INSERT INTO public.experiencias (
    id,
    titulo,
    provincia,
    ubicacion,
    region,
    categoria,
    duracion,
    precio,
    imagen,
    alt,
    descripcion,
    incluye,
    recomendacion,
    destacada
)
VALUES
(
    'senderos-del-fitz-roy',
    'A los pies del Fitz Roy',
    'Santa Cruz',
    'El Chaltén, Santa Cruz',
    'Patagonia',
    'Aventura',
    '8 horas',
    95000,
    '/images/patagonia.jpg',
    'Cumbres nevadas del Fitz Roy sobre el bosque de El Chaltén',
    'Hay paisajes que se entienden mejor caminando. Un día entre senderos, bosque patagónico y miradores, con las agujas del Fitz Roy como horizonte. La propuesta es avanzar sin apuro, detenerse a mirar y compartir un almuerzo al aire libre.',
    ARRAY[
        'Caminata acompañada por un guía local',
        'Paradas en miradores del sendero',
        'Almuerzo de marcha'
    ],
    'Una salida de día completo para quienes disfrutan caminar. Llevá calzado de trekking, agua y abrigo en capas.',
    true
),
(
    'vinedos-de-mendoza',
    'El tiempo entre viñedos',
    'Mendoza',
    'Valle de Uco, Mendoza',
    'Cuyo',
    'Gastronomía',
    '5 horas',
    78000,
    '/images/mendoza.jpg',
    'Hileras de viñedos mendocinos con la cordillera al atardecer',
    'La cordillera al fondo y una mesa que invita a quedarse. Un recorrido por los viñedos para conocer el trabajo detrás de cada cosecha, seguido de una degustación y un almuerzo con sabores de estación. Mendoza, a su propio ritmo.',
    ARRAY[
        'Recorrido por el viñedo y la bodega',
        'Degustación de vinos',
        'Almuerzo de estación'
    ],
    'La degustación con alcohol está pensada para mayores de 18 años. Llevá protección solar y ropa cómoda.',
    true
),
(
    'colores-de-purmamarca',
    'Los colores del norte',
    'Jujuy',
    'Purmamarca, Jujuy',
    'Norte',
    'Naturaleza',
    '4 horas',
    42000,
    '/images/jujuy.jpg',
    'Camino de tierra entre cerros de tonos rojizos en Purmamarca',
    'Calles de tierra, casas de adobe y cerros que cambian con la luz. Una caminata por Purmamarca y sus alrededores para descubrir las texturas de la quebrada, conversar sobre su historia y hacer una pausa junto a los puestos de artesanías.',
    ARRAY[
        'Paseo acompañado por el pueblo',
        'Caminata por el Paseo de los Colorados',
        'Tiempo libre en la plaza y feria artesanal'
    ],
    'Caminaremos a un ritmo tranquilo. Llevá agua, sombrero y protección solar; reservá tiempo para adaptarte a la altura.',
    false
),
(
    'quebrada-de-las-conchas',
    'Donde la tierra es roja',
    'Salta',
    'Cafayate, Salta',
    'Norte',
    'Aventura',
    '6 horas',
    56000,
    '/images/salta.jpg',
    'Formación rocosa rojiza en el paisaje de Cafayate, Salta',
    'La ruta se abre entre paredes de piedra roja y formas esculpidas por el viento. Un recorrido por la Quebrada de las Conchas, con pequeñas caminatas y paradas para escuchar el silencio y mirar cómo cambia el paisaje.',
    ARRAY[
        'Recorrido desde Cafayate',
        'Paradas en formaciones de la quebrada',
        'Acompañamiento de un guía local'
    ],
    'Llevá zapatillas cómodas y agua. Hay tramos de terreno irregular y poca sombra.',
    false
),
(
    'historias-de-buenos-aires',
    'Buenos Aires, a pie',
    'Ciudad de Buenos Aires',
    'La Boca y San Telmo, Buenos Aires',
    'Buenos Aires',
    'Cultura',
    '3 horas',
    35000,
    '/images/buenos-aires.jpg',
    'Fachadas de colores y balcones de Caminito en el barrio de La Boca',
    'Una ciudad también se cuenta desde sus esquinas. Recorremos las fachadas de La Boca y las calles de San Telmo entre historias de inmigración, arte y música. Al final, una pausa de café para ver pasar Buenos Aires.',
    ARRAY[
        'Paseos por La Boca y San Telmo',
        'Traslado entre ambos barrios',
        'Café en una parada del recorrido'
    ],
    'Un paseo urbano con varias paradas. Llevá calzado cómodo y una cámara, si te gusta guardar detalles.',
    false
),
(
    'ballenas-en-puerto-madryn',
    'Un encuentro con el océano',
    'Chubut',
    'Puerto Pirámides, cerca de Puerto Madryn, Chubut',
    'Patagonia',
    'Naturaleza',
    '3 horas',
    89000,
    '/images/madryn.jpg',
    'Una ballena asoma sobre las aguas azules de la costa de Puerto Madryn',
    'El motor baja y todas las miradas vuelven al agua. Una propuesta de navegación desde Puerto Pirámides para acercarse a la vida marina de la península y conocer el paisaje costero desde otra perspectiva.',
    ARRAY[
        'Charla introductoria sobre fauna marina',
        'Salida de navegación acompañada',
        'Equipamiento de seguridad a bordo'
    ],
    'Actividad estacional y sujeta al clima. Los avistajes dependen de la fauna silvestre; llevá abrigo incluso en días soleados.',
    false
);