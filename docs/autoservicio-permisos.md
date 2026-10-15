# Autoservicio y permisos del club

El personal puede crear y mantener los planes reales desde **Planes y membresías → Crear plan**. Funciona aunque el club todavía no tenga planes ni socios. Los accesos desde Gestión abren el mismo formulario. No hace falta cargar una demostración ni solicitar una modificación del sitio.

## Decisión de roles

| Función | Dueños | Recepción |
| --- | --- | --- |
| Crear planes: nombre, precio, días, actividades y publicación | Sí | Sí |
| Cambiar precio o publicación de un plan existente | Sí | Sí |
| Cambiar nombre, días o actividades de un plan existente | Sí | Visible con candado |
| Gestionar socios, membresías, cobros, clases y reservas | Sí | Sí |
| Registrar ventas, ingresos, gastos, recepción y traslado de stock | Sí | Sí |
| Crear o editar productos y ajustar existencias | Sí | Visible con candado |
| Corregir movimientos manuales y anular movimientos | Sí | Visible con candado |
| Precio y porcentaje de seña de pádel | Sí | Sí |
| Alias de cobro y WhatsApp de reservas | Sí | Visible con candado |
| Equipo y permisos | Sí | Vista bloqueada |
| Informes, configuración general y datos fiscales | Sí | Vista bloqueada |
| Importar, exportar o restaurar respaldos | Sí | Vista bloqueada |

Los dueños manejan las decisiones que afectan a todo el club, los permisos y los controles financieros sensibles. Recepción maneja la operación cotidiana y puede crear ofertas sin depender del desarrollador. Los roles de terminal y jugador no ganan acceso administrativo.

## Crear y mantener planes

El precio comienza vacío y es obligatorio. Para un plan gratuito hay que escribir **0**. Los modelos opcionales completan solamente el nombre y las actividades; no inventan precios. La vigencia puede ir de 1 a 366 días. Cada plan nuevo queda sin publicar hasta que el operador elija mostrar su precio en el sitio.

Cambiar precio o vigencia afecta a próximos cobros y renovaciones; no reescribe importes de pagos ni fechas de vencimiento ya guardadas. El nombre y las actividades pertenecen al plan compartido: cambiar actividades sí modifica los accesos de los socios que tienen ese plan. El formulario del dueño advierte ese efecto. Para una oferta distinta que deba coexistir con la anterior, se puede crear otro plan.

La edición verifica la versión que el operador abrió. Si otra persona la cambió, el sistema conserva el borrador y permite cargar los valores actuales antes de volver a guardar. Un envío de creación sin respuesta conserva su identificador y su contenido para reintentarlo sin duplicar el plan. La misma clave con datos diferentes se rechaza.

## Vistas bloqueadas y protección de datos

Recepción ve todas las secciones del menú. Las exclusivas muestran un candado y una vista decorativa sin datos reales. La página verifica el rol antes de consultar registros o montar los componentes privados. Los botones de acciones puntuales permanecen visibles, deshabilitados y con la indicación **Solo dueños**.

Los endpoints mantienen sus controles de autorización; un bloqueo visual no reemplaza el control del servidor. Crear y editar planes también verifica que el operador conserve su rol activo dentro de la transacción que escribe el cambio y la auditoría. No se introducen tablas ni migraciones.

Bloquear exportaciones evita usar las funciones de descarga reservadas a dueños. No impide copiar datos que recepción ya puede consultar para operar el club.
