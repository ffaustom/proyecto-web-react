"""Pruebas reales, SOLO en un cluster temporal creado por este programa.

Requiere PostgreSQL instalado o binarios descartables: PG_BIN_DIR y, si hace
falta, PG_LIBPQ. No acepta DATABASE_URL ni carga .env.local. No necesita psycopg,
Docker o paquetes Python: usa libpq, el cliente oficial incluido con PostgreSQL.
"""
import concurrent.futures
import ctypes
import ctypes.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / 'supabase' / 'migrations'
MIGRATION = '20261110140000_prepare_checkout_idempotent.sql'
SIGNATURE = 'public.operar_checkout(text,uuid,text,text,text,integer,date,text)'
PAYMENT_MIGRATION = '20261111120000_registrar_pago_verificado.sql'
PAYMENT_SIGNATURE = 'public.registrar_pago_verificado(uuid,text,text,text,numeric,text,timestamptz)'
BIN = Path(os.environ.get('PG_BIN_DIR', '/no-configurado'))
library = os.environ.get('PG_LIBPQ') or ctypes.util.find_library('pq')
if not library:
    for candidate in ['libpq.5.dylib', 'libpq.dylib', 'libpq.so.5', 'libpq.so']:
        filename = BIN.parent / 'lib' / candidate
        if filename.exists():
            library = str(filename)
            break
if not library or not (BIN / 'initdb').is_file():
    raise SystemExit('Configurar PG_BIN_DIR (initdb/pg_ctl) y PG_LIBPQ si no se detecta libpq. No se conectó a ninguna base.')
pq = ctypes.CDLL(library)
for name, args, result in [
    ('PQconnectdb', [ctypes.c_char_p], ctypes.c_void_p),
    ('PQstatus', [ctypes.c_void_p], ctypes.c_int),
    ('PQerrorMessage', [ctypes.c_void_p], ctypes.c_char_p),
    ('PQexec', [ctypes.c_void_p, ctypes.c_char_p], ctypes.c_void_p),
    ('PQresultStatus', [ctypes.c_void_p], ctypes.c_int),
    ('PQresultErrorField', [ctypes.c_void_p, ctypes.c_int], ctypes.c_char_p),
    ('PQntuples', [ctypes.c_void_p], ctypes.c_int),
    ('PQnfields', [ctypes.c_void_p], ctypes.c_int),
    ('PQgetisnull', [ctypes.c_void_p, ctypes.c_int, ctypes.c_int], ctypes.c_int),
    ('PQgetvalue', [ctypes.c_void_p, ctypes.c_int, ctypes.c_int], ctypes.c_char_p),
    ('PQclear', [ctypes.c_void_p], None), ('PQfinish', [ctypes.c_void_p], None),
]:
    function = getattr(pq, name)
    function.argtypes, function.restype = args, result


class SqlError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class Connection:
    def __init__(self, socket, database='postgres'):
        # El host siempre es el socket PRIVADO creado abajo, nunca una URL externa.
        if not str(socket).startswith('/tmp/afuera-pg-'):
            raise ValueError('Solo se permiten los sockets temporales de esta suite.')
        self.conn = pq.PQconnectdb(('host=%s port=55432 user=postgres dbname=%s connect_timeout=5 sslmode=disable'
                                   % (socket, database)).encode())
        if pq.PQstatus(self.conn) != 0:
            message = pq.PQerrorMessage(self.conn).decode()
            pq.PQfinish(self.conn)
            raise RuntimeError(message)
        self.query("SET statement_timeout = '8s'")

    def query(self, sql):
        result = pq.PQexec(self.conn, sql.encode())
        try:
            if not result:
                raise RuntimeError('libpq no devolvió resultado.')
            if pq.PQresultStatus(result) not in (1, 2):
                code = pq.PQresultErrorField(result, ord('C')) or b''
                message = pq.PQresultErrorField(result, ord('M')) or b'Error SQL'
                raise SqlError(code.decode(), message.decode())
            return [[None if pq.PQgetisnull(result, row, col)
                     else pq.PQgetvalue(result, row, col).decode()
                     for col in range(pq.PQnfields(result))]
                    for row in range(pq.PQntuples(result))]
        finally:
            if result:
                pq.PQclear(result)

    def scalar(self, sql):
        return self.query(sql)[0][0]

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pq.PQfinish(self.conn)


def literal(value):
    return 'NULL' if value is None else "'%s'" % str(value).replace("'", "''")


def prepare(reservation_id, fecha=None, nombre='Prueba', email='prueba@example.invalid', cantidad=2):
    fecha = fecha or "((statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1)"
    return "SELECT public.operar_checkout('preparar', %s::uuid, 'checkout-fixture', %s, %s, %s, %s)::text" % (
        literal(reservation_id), literal(nombre), literal(email), 'NULL' if cantidad is None else cantidad, fecha)


def operation(op, reservation_id, preference=None):
    return 'SELECT public.operar_checkout(%s, %s::uuid, p_preferencia => %s)::text' % (
        literal(op), literal(reservation_id), literal(preference))


def payment(reservation_id, preference, payment_id, status='approved', amount='190000',
            currency='ARS', updated='2026-11-11T12:00:00Z'):
    return 'SELECT public.registrar_pago_verificado(%s::uuid,%s,%s,%s,%s::numeric,%s,%s::timestamptz)' % (
        literal(reservation_id), literal(preference), literal(payment_id), literal(status),
        literal(amount), literal(currency), literal(updated))


class CheckoutPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(prefix='afuera-pg-', dir='/tmp')
        cls.base = Path(cls.directory.name)
        cls.socket = cls.base / 'socket'
        cls.socket.mkdir(mode=0o700)
        cls.data = cls.base / 'data'
        cls.started = False
        cls.addClassCleanup(cls.shutdown)
        cls.run_binary('initdb', '-D', str(cls.data), '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8')
        cls.run_binary('pg_ctl', '-D', str(cls.data), '-l', str(cls.base / 'postgres.log'),
                       '-o', "-F -h '' -k %s -p 55432" % cls.socket, '-w', 'start')
        cls.started = True
        with Connection(cls.socket) as conn:
            conn.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS')
            cls.setup_schema(conn)
            cls.snapshot = cls.snapshot_data(conn)
            cls.policies = conn.scalar("SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname)::text FROM pg_policies p WHERE schemaname='public'")
            conn.query((MIGRATIONS / MIGRATION).read_text())
            cls.after = cls.snapshot_data(conn)
            cls.after_policies = conn.scalar("SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname)::text FROM pg_policies p WHERE schemaname='public'")
            # Ejecutar el archivo nuevo sin alterar su contenido ni las pruebas anteriores.
            cls.payment_before = cls.snapshot_data(conn)
            conn.query((MIGRATIONS / PAYMENT_MIGRATION).read_text())
            cls.payment_after = cls.snapshot_data(conn)
            cls.payment_policies = conn.scalar("SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname)::text FROM pg_policies p WHERE schemaname='public'")
            print('PostgreSQL real:', conn.scalar('SHOW server_version'), '| cluster privado temporal, sin TCP', flush=True)

    @classmethod
    def run_binary(cls, binary, *args):
        env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
        result = subprocess.run([str(BIN / binary), *args], capture_output=True, text=True, env=env, timeout=30)
        if result.returncode:
            raise RuntimeError('%s falló: %s' % (binary, result.stderr or result.stdout))

    @classmethod
    def shutdown(cls):
        if cls.started:
            cls.run_binary('pg_ctl', '-D', str(cls.data), '-m', 'fast', '-w', 'stop')
        cls.directory.cleanup()

    @staticmethod
    def setup_schema(conn):
        # Archivos reales que definen las tablas, RLS y grants usados por checkout.
        # No reproduce los módulos Supabase Auth ni pretende probar PostgREST.
        for name in ['20261008185437_create_experiencias.sql',
                     '20261015180000_allow_public_read_experiencias.sql',
                     '20261029120000_create_reservas.sql',
                     '20261029130000_allow_public_insert_reservas.sql',
                     '20261108120000_add_reservas_fecha_visita.sql',
                     '20261110130000_grant_service_role_checkout_columns.sql']:
            conn.query((MIGRATIONS / name).read_text())
        conn.query("""INSERT INTO public.experiencias
            (id,titulo,provincia,ubicacion,region,categoria,duracion,precio,imagen,alt,descripcion,incluye,recomendacion)
            VALUES ('checkout-fixture','Prueba','Prueba','Prueba','Prueba','Prueba','Prueba',95000,'/prueba','Prueba','Prueba',ARRAY[]::text[],'Prueba');
            INSERT INTO public.reservas (experiencia_id,nombre_comprador,email,cantidad_personas,total)
            VALUES ('checkout-fixture','Historial ficticio','historial@example.invalid',1,95000)""")

    @staticmethod
    def snapshot_data(conn):
        return conn.scalar("""SELECT jsonb_build_object(
            'reservas',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.reservas r),
            'experiencias',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.experiencias e))::text""")

    def rpc(self, sql, role='service_role'):
        with Connection(self.socket) as conn:
            conn.query('SET ROLE ' + role)
            return json.loads(conn.scalar(sql))

    def test_01_migration_preserves_history_and_policies(self):
        self.assertEqual(self.snapshot, self.after)
        self.assertEqual(self.policies, self.after_policies)
        with Connection(self.socket) as conn:
            self.assertEqual(conn.scalar("SELECT relrowsecurity::text FROM pg_class WHERE oid='public.checkout_intentos'::regclass"), 'true')
            self.assertEqual(conn.scalar("SELECT prosecdef::text FROM pg_proc WHERE oid=%s::regprocedure" % literal(SIGNATURE)), 'true')

    def test_02_roles_and_direct_access(self):
        for role in ['anon', 'authenticated']:
            with self.subTest(role=role), self.assertRaises(SqlError) as caught:
                self.rpc(prepare(uuid.uuid4()), role)
            self.assertEqual(caught.exception.code, '42501')
        with Connection(self.socket) as conn:
            for role in ['anon', 'authenticated', 'service_role']:
                for privilege in ['SELECT', 'INSERT', 'UPDATE', 'DELETE']:
                    self.assertEqual(conn.scalar("SELECT has_table_privilege(%s,'public.checkout_intentos',%s)::text" % (literal(role), literal(privilege))), 'false')
            for column in ['total', 'fecha_visita', 'email', 'nombre_comprador', 'cantidad_personas']:
                self.assertEqual(conn.scalar("SELECT has_column_privilege('service_role','public.reservas',%s,'UPDATE')::text" % literal(column)), 'false')

    def test_03_create_and_retry_keep_id_price_and_fields(self):
        reservation_id = uuid.uuid4()
        first = self.rpc(prepare(reservation_id))
        second = self.rpc(prepare(reservation_id))
        self.assertTrue(first['crear'])
        self.assertFalse(second['crear'])
        with Connection(self.socket) as conn:
            self.assertEqual(conn.query('SELECT total::text,estado FROM public.reservas WHERE id=%s' % literal(reservation_id)), [['190000.00', 'pendiente']])
        with self.assertRaisesRegex(SqlError, 'CHECKOUT_DATOS_DISTINTOS'):
            self.rpc(prepare(reservation_id, cantidad=3))

    def test_04_invalid_arguments_leave_no_rows(self):
        for kwargs in [dict(nombre=''), dict(email='mal'), dict(cantidad=0), dict(cantidad=None),
                       dict(fecha='NULL'), dict(fecha="DATE 'infinity'"), dict(fecha="DATE '-infinity'"),
                       dict(fecha="DATE '2000-01-01'"), dict(cantidad=2147483647)]:
            reservation_id = uuid.uuid4()
            with self.subTest(kwargs=kwargs), self.assertRaises(SqlError):
                self.rpc(prepare(reservation_id, **kwargs))
            with Connection(self.socket) as conn:
                self.assertEqual(conn.scalar('SELECT count(*) FROM public.reservas WHERE id=%s' % literal(reservation_id)), '0')
                self.assertEqual(conn.scalar('SELECT count(*) FROM public.checkout_intentos WHERE reserva_id=%s' % literal(reservation_id)), '0')

    def test_05_real_concurrent_commit(self):
        self.concurrent_case(commit=True)

    def test_06_real_concurrent_rollback(self):
        self.concurrent_case(commit=False)

    def concurrent_case(self, commit):
        reservation_id = uuid.uuid4()
        entered = threading.Event()
        def second():
            entered.set()
            return self.rpc(prepare(reservation_id))
        with Connection(self.socket) as first, concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            first.query('BEGIN; SET LOCAL ROLE service_role')
            self.assertTrue(json.loads(first.scalar(prepare(reservation_id)))['crear'])
            future = pool.submit(second)
            self.assertTrue(entered.wait(2))
            # Comprobar bloqueo real, no simularlo con un objeto JavaScript.
            with Connection(self.socket) as observer:
                waiting = False
                for _ in range(100):
                    if observer.scalar("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted") != '0':
                        waiting = True
                        break
                    threading.Event().wait(0.01)
                self.assertTrue(waiting, 'La segunda conexión debe esperar el advisory lock')
            first.query('COMMIT' if commit else 'ROLLBACK')
            self.assertEqual(future.result(timeout=10)['crear'], not commit)
        with Connection(self.socket) as conn:
            self.assertEqual(conn.scalar('SELECT count(*) FROM public.reservas WHERE id=%s' % literal(reservation_id)), '1')
            self.assertEqual(conn.scalar('SELECT count(*) FROM public.checkout_intentos WHERE reserva_id=%s' % literal(reservation_id)), '1')

    def test_07_save_is_idempotent_and_does_not_confirm(self):
        reservation_id = uuid.uuid4()
        self.rpc(prepare(reservation_id))
        for _ in range(2):
            self.rpc(operation('guardar', reservation_id, 'preferencia-fixture'))
        with self.assertRaisesRegex(SqlError, 'CHECKOUT_PREFERENCIA_DISTINTA'):
            self.rpc(operation('guardar', reservation_id, 'otra'))
        with Connection(self.socket) as conn:
            self.assertEqual(conn.query('SELECT estado,mercado_pago_preference_id FROM public.reservas WHERE id=%s' % literal(reservation_id)), [['pendiente', 'preferencia-fixture']])

    def test_08_crash_before_post_remains_closed(self):
        reservation_id = uuid.uuid4()
        self.assertTrue(self.rpc(prepare(reservation_id))['crear'])
        # La conexión original ya cerró: la reclamación persistió.
        self.assertFalse(self.rpc(prepare(reservation_id))['crear'])
        self.assertFalse(self.rpc(prepare(reservation_id))['crear'])

    def test_09_release_only_prepares_same_reservation_again(self):
        reservation_id = uuid.uuid4()
        self.rpc(prepare(reservation_id))
        self.rpc(operation('liberar', reservation_id))
        self.assertTrue(self.rpc(prepare(reservation_id))['crear'])

    def test_10_midnight_recovery_without_authorizing_a_new_post(self):
        for state in ['creando', 'lista', 'reservada']:
            reservation_id = uuid.uuid4()
            preference = 'preferencia-ayer' if state == 'lista' else None
            with Connection(self.socket) as conn:
                yesterday = conn.scalar("SELECT ((statement_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 1)::text")
                conn.query("INSERT INTO public.reservas (id,experiencia_id,nombre_comprador,email,cantidad_personas,total,fecha_visita,mercado_pago_preference_id) VALUES (%s,'checkout-fixture','Prueba','prueba@example.invalid',2,190000,%s,%s)" % (literal(reservation_id), literal(yesterday), literal(preference)))
                conn.query('INSERT INTO public.checkout_intentos(reserva_id,estado) VALUES (%s,%s)' % (literal(reservation_id), literal(state)))
            if state == 'reservada':
                with self.assertRaisesRegex(SqlError, 'CHECKOUT_FECHA_PASADA'):
                    self.rpc(prepare(reservation_id, fecha='DATE ' + literal(yesterday)))
            else:
                self.assertFalse(self.rpc(prepare(reservation_id, fecha='DATE ' + literal(yesterday)))['crear'])
                self.rpc(operation('guardar', reservation_id, preference or 'recuperada-ayer'))

    def test_11_historical_reservation_cannot_be_adopted(self):
        with Connection(self.socket) as conn:
            historical = conn.scalar("SELECT id::text FROM public.reservas WHERE email='historial@example.invalid'")
        with self.assertRaisesRegex(SqlError, 'CHECKOUT_INTENTO_INVALIDO'):
            self.rpc(prepare(historical))

    def test_12_migration_failure_rolls_back_ddl(self):
        with Connection(self.socket) as admin:
            admin.query('CREATE DATABASE afuera_rollback')
        with Connection(self.socket, 'afuera_rollback') as conn:
            self.setup_schema(conn)
            snapshot = self.snapshot_data(conn)
            conn.query("CREATE FUNCTION public.operar_checkout(text,uuid,text,text,text,integer,date,text) RETURNS jsonb LANGUAGE sql AS 'SELECT NULL::jsonb'")
            with self.assertRaises(SqlError):
                conn.query((MIGRATIONS / MIGRATION).read_text())
            conn.query('ROLLBACK')
            self.assertIsNone(conn.scalar("SELECT to_regclass('public.checkout_intentos')::text"))
            self.assertEqual(snapshot, self.snapshot_data(conn))


    def payment_fixture(self):
        reservation_id = uuid.uuid4()
        preference = 'preferencia-' + str(reservation_id)
        payment_id = str(uuid.uuid4().int % (10 ** 18) + 1)
        self.rpc(prepare(reservation_id))
        self.rpc(operation('guardar', reservation_id, preference))
        return reservation_id, preference, payment_id

    def payment_rpc(self, sql, role='service_role'):
        with Connection(self.socket) as conn:
            conn.query('SET ROLE ' + role)
            return conn.scalar(sql)

    def reservation(self, reservation_id):
        with Connection(self.socket) as conn:
            return json.loads(conn.scalar('SELECT to_jsonb(r)::text FROM public.reservas r WHERE id=%s' % literal(reservation_id)))

    def test_13_payment_migration_preserves_history_rls_and_permissions(self):
        before, after = json.loads(self.payment_before), json.loads(self.payment_after)
        for row in after['reservas']:
            self.assertIsNone(row.pop('mercado_pago_updated_at'))
        self.assertEqual(before, after)
        self.assertEqual(self.after_policies, self.payment_policies)
        with Connection(self.socket) as conn:
            for table in ['reservas', 'checkout_intentos']:
                self.assertEqual(conn.scalar("SELECT relrowsecurity::text FROM pg_class WHERE oid=%s::regclass" % literal('public.' + table)), 'true')
            self.assertEqual(conn.scalar("SELECT prosecdef::text FROM pg_proc WHERE oid=%s::regprocedure" % literal(PAYMENT_SIGNATURE)), 'true')
            for role in ['anon', 'authenticated', 'service_role']:
                allowed = conn.scalar("SELECT has_function_privilege(%s,%s,'EXECUTE')::text" % (literal(role), literal(PAYMENT_SIGNATURE)))
                self.assertEqual(allowed, 'true' if role == 'service_role' else 'false')
                for privilege in ['SELECT', 'INSERT', 'UPDATE']:
                    self.assertEqual(conn.scalar("SELECT has_column_privilege(%s,'public.reservas','mercado_pago_updated_at',%s)::text" % (literal(role), literal(privilege))), 'false')
        for role in ['anon', 'authenticated']:
            with self.subTest(role=role), self.assertRaises(SqlError) as caught:
                self.payment_rpc(payment(uuid.uuid4(), 'ajena', '123'), role)
            self.assertEqual(caught.exception.code, '42501')

    def test_14_approved_payment_confirms_only_target_without_changing_contract(self):
        reservation_id, preference, payment_id = self.payment_fixture()
        other_id, _, _ = self.payment_fixture()
        before, other = self.reservation(reservation_id), self.reservation(other_id)
        self.assertEqual(self.payment_rpc(payment(reservation_id, preference, payment_id)), 'aplicado')
        after = self.reservation(reservation_id)
        self.assertEqual(after['estado'], 'confirmada')
        self.assertEqual(after['mercado_pago_status'], 'approved')
        self.assertEqual(after['mercado_pago_payment_id'], payment_id)
        self.assertIsNotNone(after['mercado_pago_updated_at'])
        for key in before.keys() - {'estado', 'mercado_pago_status', 'mercado_pago_payment_id', 'mercado_pago_updated_at'}:
            self.assertEqual(before[key], after[key], key)
        self.assertEqual(other, self.reservation(other_id))

    def test_15_pending_and_rejected_do_not_confirm(self):
        for status in ['pending', 'in_process', 'authorized', 'rejected', 'cancelled']:
            with self.subTest(status=status):
                reservation_id, preference, payment_id = self.payment_fixture()
                self.assertEqual(self.payment_rpc(payment(reservation_id, preference, payment_id, status=status)), 'aplicado')
                row = self.reservation(reservation_id)
                self.assertEqual(row['estado'], 'pendiente')
                self.assertEqual(row['mercado_pago_status'], status)

    def test_16_duplicate_and_older_payment_do_not_change_rows(self):
        reservation_id, preference, payment_id = self.payment_fixture()
        sql = payment(reservation_id, preference, payment_id, status='pending')
        self.assertEqual(self.payment_rpc(sql), 'aplicado')
        before = self.reservation(reservation_id)
        self.assertEqual(self.payment_rpc(sql), 'duplicado')
        self.assertEqual(self.payment_rpc(payment(reservation_id, preference, payment_id, status='rejected', updated='2026-11-10T12:00:00Z')), 'duplicado')
        self.assertEqual(before, self.reservation(reservation_id))
        self.assertEqual(self.payment_rpc(payment(reservation_id, preference, payment_id, updated='2026-11-12T12:00:00Z')), 'aplicado')
        confirmed = self.reservation(reservation_id)
        self.assertEqual(self.payment_rpc(payment(reservation_id, preference, payment_id, updated='2026-11-12T12:00:00Z')), 'ignorado')
        self.assertEqual(confirmed, self.reservation(reservation_id))

    def test_17_wrong_reference_or_preference_cannot_confirm(self):
        reservation_id, preference, payment_id = self.payment_fixture()
        other_id, _, _ = self.payment_fixture()
        before = self.reservation(reservation_id)
        other = self.reservation(other_id)
        for target, pref in [(uuid.uuid4(), preference), (other_id, preference), (reservation_id, 'ajena'), (reservation_id, None)]:
            with self.subTest(target=target, preference=pref), self.assertRaises(SqlError):
                self.payment_rpc(payment(target, pref, payment_id))
        self.assertEqual(before, self.reservation(reservation_id))
        self.assertEqual(other, self.reservation(other_id))
        with Connection(self.socket) as conn:
            historical = conn.scalar("SELECT id::text FROM public.reservas WHERE email='historial@example.invalid'")
        with self.assertRaisesRegex(SqlError, 'PAGO_INTENTO_INEXISTENTE'):
            self.payment_rpc(payment(historical, preference, payment_id))

    def test_18_incompatible_amount_currency_and_arguments_leave_row_unchanged(self):
        reservation_id, preference, payment_id = self.payment_fixture()
        before = self.reservation(reservation_id)
        for kwargs in [dict(amount='1'), dict(amount='190000.001'), dict(amount='0'), dict(amount='-1'),
                       dict(amount='NaN'), dict(amount='Infinity'), dict(amount=None),
                       dict(currency='USD'), dict(currency=None), dict(status='inventado'),
                       dict(status=None), dict(updated='infinity'), dict(updated=None)]:
            with self.subTest(kwargs=kwargs), self.assertRaises(SqlError):
                self.payment_rpc(payment(reservation_id, preference, payment_id, **kwargs))
            self.assertEqual(before, self.reservation(reservation_id))

    def test_19_late_or_other_attempt_cannot_overwrite_confirmed_reservation(self):
        reservation_id, preference, payment_id = self.payment_fixture()
        self.payment_rpc(payment(reservation_id, preference, payment_id))
        before = self.reservation(reservation_id)
        for status in ['pending', 'rejected', 'approved']:
            for attempt in [payment_id, str(int(payment_id) + 1)]:
                for updated in ['2026-11-10T12:00:00Z', '2026-11-12T12:00:00Z']:
                    with self.subTest(status=status, attempt=attempt, updated=updated):
                        self.assertEqual(self.payment_rpc(payment(reservation_id, preference, attempt, status=status, updated=updated)), 'ignorado')
                        self.assertEqual(before, self.reservation(reservation_id))

    def test_20_approved_retry_after_rejected_attempt(self):
        reservation_id, preference, payment_id = self.payment_fixture()
        self.payment_rpc(payment(reservation_id, preference, payment_id, status='rejected'))
        approved_id = str(int(payment_id) + 1)
        self.assertEqual(self.payment_rpc(payment(reservation_id, preference, approved_id, updated='2026-11-12T12:00:00Z')), 'aplicado')
        self.assertEqual(self.reservation(reservation_id)['estado'], 'confirmada')
        self.assertEqual(self.reservation(reservation_id)['mercado_pago_payment_id'], approved_id)

    def test_21_payment_unique_across_reservations(self):
        reservation_id, preference, payment_id = self.payment_fixture()
        other_id, other_preference, _ = self.payment_fixture()
        self.payment_rpc(payment(reservation_id, preference, payment_id))
        before = self.reservation(other_id)
        with self.assertRaises(SqlError) as caught:
            self.payment_rpc(payment(other_id, other_preference, payment_id))
        self.assertEqual(caught.exception.code, '23505')
        self.assertEqual(before, self.reservation(other_id))

    def test_22_concurrent_duplicate_serializes_and_preserves_approval(self):
        reservation_id, preference, payment_id = self.payment_fixture()
        sql = payment(reservation_id, preference, payment_id)
        entered = threading.Event()
        def second():
            entered.set()
            return self.payment_rpc(sql)
        with Connection(self.socket) as first, concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            first.query('BEGIN; SET LOCAL ROLE service_role')
            self.assertEqual(first.scalar(sql), 'aplicado')
            future = pool.submit(second)
            self.assertTrue(entered.wait(2))
            with Connection(self.socket) as observer:
                waiting = False
                for _ in range(100):
                    if observer.scalar("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted") != '0':
                        waiting = True
                        break
                    threading.Event().wait(0.01)
                self.assertTrue(waiting, 'El duplicado debe esperar el bloqueo de la primera transacción')
            first.query('COMMIT')
            self.assertEqual(future.result(timeout=10), 'ignorado')
        self.assertEqual(self.reservation(reservation_id)['estado'], 'confirmada')

    def test_23_payment_migration_failure_rolls_back_new_column(self):
        with Connection(self.socket) as admin:
            admin.query('CREATE DATABASE afuera_payment_rollback')
        with Connection(self.socket, 'afuera_payment_rollback') as conn:
            self.setup_schema(conn)
            conn.query((MIGRATIONS / MIGRATION).read_text())
            before = self.snapshot_data(conn)
            conn.query("CREATE FUNCTION public.registrar_pago_verificado(uuid,text,text,text,numeric,text,timestamptz) RETURNS text LANGUAGE sql AS 'SELECT NULL::text'")
            with self.assertRaises(SqlError):
                conn.query((MIGRATIONS / PAYMENT_MIGRATION).read_text())
            conn.query('ROLLBACK')
            self.assertEqual(conn.scalar("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='reservas' AND column_name='mercado_pago_updated_at'"), '0')
            self.assertEqual(before, self.snapshot_data(conn))


if __name__ == '__main__':
    unittest.main(verbosity=2)
