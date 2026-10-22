# Revisión de estilos del sistema

## Problemas corregidos

El encabezado de Datos quedaba desplazado porque `.work-header` pasa a columna en móvil, pero la regla de mayor especificidad `.admin-shell .work-header` conservaba `align-items: center`. El bloque de texto se encogía y quedaba centrado dentro del espacio disponible. En móvil el contenedor ahora estira sus hijos y el texto ocupa el ancho de la columna, compartiendo el borde izquierdo con los paneles.

Los párrafos sin clase también conservaban un color fijo del tema oscuro sobre paneles blancos, como el texto de Descargar respaldo. El texto base usa ahora un token de tema que cambia en las pantallas privadas y se hereda también en los portales de formularios. Los mensajes mantienen sus colores semánticos, incluidos los párrafos interiores. Se ajustan los textos secundarios para alcanzar contraste de texto normal de al menos 4,5:1 sobre los dos fondos privados.

La revisión incluye la separación del enlace de regreso y del encabezado, tamaño de los rótulos, títulos largos, paneles y contenedores de tablas que puedan encogerse, acciones largas que puedan pasar de línea y campos móviles con tamaño de texto legible.

## Cobertura

| Área | Revisión compartida |
| --- | --- |
| Gestión, agenda de pádel y Caja | WorkspaceHeader, paneles, tablas y formularios |
| Datos, Informes, Equipo y Configuración | Encabezado, regreso, explicación y mensajes |
| Datos fiscales y Planes | Encabezado, etiquetas, formularios y estados de guardado |
| Mi cuenta y verificación | Tema claro, explicaciones y mensajes |
| Vistas bloqueadas de recepción | Encabezado común y estructura sin datos privados |

## Verificación

`tests/admin-layout-contracts.test.mjs` localiza los encabezados reales en los componentes y evalúa las reglas compartidas con PostCSS en anchos de 320, 360, 390, 430, 600, 760, 768, 1024, 1440 y 1920 px. Comprueba alineación móvil, espacio para acciones de escritorio, contraste, mensajes, acciones de portales y contención de paneles/tablas. También comprueba dos órdenes de carga para las hojas compartidas y de componentes.

Son contratos de cascada y estructura, no capturas ni una simulación completa del motor de un navegador. Complementan las pruebas de composición de páginas, roles y controles HTTP/SSR. No se accedió a sesiones del cliente ni se modificaron sus registros para revisar los estilos.
