# Correcciones de la reunión del 20 de octubre

El alcance indicado por el usuario es corregir Gold Gym. La versión BAP queda para después. La observación de la landing corresponde al navbar de escritorio.

## Caja: causa de «Operación inválida»

La API enviaba el objeto de la operación como JSON serializado a un parámetro `::jsonb`. El controlador postgres.js infería el tipo JSONB del servidor y volvía a serializar ese texto. `record_cash` recibía un valor JSON de tipo string; su lectura de `action` daba NULL y devolvía «Operación inválida», aunque el formulario y la rutina admitían crear productos.

La corrección conserva los valores string del adaptador como parámetros de texto (OID 25) antes de los casts explícitos del SQL. Se usa tanto en consultas individuales como dentro de transacciones. También evita el mismo problema en la restauración con `jsonb_populate_recordset`. No modifica las reglas de Caja, permisos ni esquema de producción.

La reproducción usa el controlador postgres.js real y el protocolo PostgreSQL sobre una conexión TCP local respaldada por PGlite. Los tests anteriores ejecutaban el dominio sobre PGlite sin pasar por ese controlador, por eso no detectaban esta diferencia de transporte.

## Navegación y pantallas

- El navbar público tiene un contenedor de 1440 px, alineado con el contenido. Los enlaces forman un grupo y el contacto ocupa un espacio propio. El menú móvil conserva su apertura, cierre y alternativa sin JavaScript.
- Informes, Datos y Configuración tenían un panel tanto en el layout como en la página. Se eliminan los layouts redundantes y se conserva la protección en la página. Recepción puede llegar a su vista con candado sin consultar datos privados.
- El menú administrativo permite desplazamiento interno cuando la ventana es baja; el encabezado admite títulos y botones largos. Se conservan destinos, permisos y textos de cada función.
- Los campos desplegables de formularios ocupan su columna y las columnas pueden encogerse sin desbordar. En móvil pasan a una sola columna.
- Verificación en dos pasos usa el tema claro de Mi cuenta, con contraste coherente en título, avisos y controles. La clave manual del autenticador puede partirse en líneas en pantallas pequeñas.
- La ayuda de Equipo describe los permisos actuales de recepción y remite a Mi cuenta para obtener el identificador de cada persona.

La revisión incluye código, CSS, composición de páginas, pruebas de permisos y verificaciones HTTP/SSR. Las capturas iniciales sirvieron para diagnosticar el navbar; no se dispone de una captura posterior a los cambios. No se modificaron fotos, sedes, precios definitivos ni contactos del club.
