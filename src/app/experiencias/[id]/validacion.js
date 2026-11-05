export function validarReserva(formData) {
  const texto = (campo) => {
    const valor = formData.get(campo)
    return typeof valor === 'string' ? valor.trim() : ''
  }
  const values = {
    nombre_comprador: texto('nombre_comprador'),
    email: texto('email'),
    cantidad_personas: texto('cantidad_personas'),
  }
  const errors = {}
  if (!values.nombre_comprador || values.nombre_comprador.length > 200) {
    errors.nombre_comprador = 'Ingresá tu nombre (hasta 200 caracteres).'
  }
  if (values.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Ingresá un email válido.'
  }
  const cantidad = Number(values.cantidad_personas)
  if (!/^\d+$/.test(values.cantidad_personas) || !Number.isSafeInteger(cantidad) || cantidad <= 0 || cantidad > 2147483647) {
    errors.cantidad_personas = 'Ingresá una cantidad entera mayor que cero y hasta 2147483647.'
  }
  return { values, errors, cantidad }
}
