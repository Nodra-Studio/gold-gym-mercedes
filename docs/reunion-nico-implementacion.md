# Acuerdos de la reunión del 13 de octubre de 2026

## Dueños y sedes

Los dueños adicionales se habilitan desde **Equipo y permisos**, usando el identificador de una cuenta con correo confirmado. Comparten el mismo club y las cuatro sedes. El acceso canónico y el acceso propio no se pueden modificar desde esta pantalla. Las revocaciones se comprueban de nuevo al guardar permisos.

Queda pendiente recibir los correos de Alejandro Llanos, Felipe Llanos y Agustín. No se asignaron cuentas por suposición. La separación futura de permisos por sede requiere definir qué puede consultar y modificar cada dueño.

La sede de pertenencia del socio se registra explícitamente, se filtra en la gestión y se incluye en CSV y respaldos. No se deduce de una visita ni de un cobro. Los registros anteriores quedan sin sede hasta que recepción los actualice.

## Segundo paso gratuito

Desde **Mi cuenta → Verificación en dos pasos** se configura una aplicación gratuita como Google Authenticator o Microsoft Authenticator. Se escanea el QR y se confirma el primer código. En accesos posteriores se pide un código de esa aplicación antes de abrir las herramientas privadas o modificar la contraseña.

Los códigos de la aplicación funcionan sin conexión y no generan cargos por SMS. No se activó ningún complemento de pago. La configuración opcional `GOLD_GYM_SMS_MFA_ENABLED` permanece desactivada; no hace falta habilitarla para usar la aplicación autenticadora.

La protección se comprueba en páginas y APIs, con verificación de sesión en servidor. El QR y la clave de configuración sólo se entregan durante el alta del método; no forman parte de exportaciones o respaldos. Cada persona debe conservar acceso a su aplicación y sus mecanismos de recuperación.

## Movimientos y respaldos

Caja permite cargar ingresos y gastos manuales. Un dueño puede corregir sede, categoría, concepto, importe, medio de pago y fecha, dejando el motivo y el estado anterior en el historial. Las versiones previenen sobrescrituras entre pantallas. Anular registra un movimiento contrario y mantiene el original; las ventas anuladas también restituyen stock.

Los cobros de cuotas y pádel conservan sus relaciones con membresías y reservas. No se implementó una devolución automática de esos pagos: necesita definir sus efectos sobre la actividad correspondiente.

El gasto de categoría **Electricidad** está cubierto por pruebas. No se obtuvo una reproducción del mensaje histórico «Operación inválida» con ese gasto; el procedimiento remoto anterior ya admitía la operación de gasto.

La exportación incluye sede de socios, versiones e historial de correcciones y datos fiscales. Los respaldos anteriores se admiten sin atribuir sedes históricas. Los permisos, factores de autenticación, dispositivos y copias offline no se transfieren en una restauración.

## Continuidad de recepción sin internet

Con una sesión autorizada y conexión, seleccionar la sede de la terminal y pulsar **Preparar copia offline por 8 horas**. La copia local contiene referencias de DNI y elegibilidad; no incluye nombres, teléfonos, cobros o precios. La pantalla pública de continuidad se puede cargar si se recarga la terminal durante el corte.

Sin conexión, el resultado siempre indica que procede de una copia histórica y requiere control manual de recepción. No acciona un molinete. Una copia vencida no habilita nuevas consultas. Las consultas pendientes se sincronizan al recuperar la conexión; el servidor reconstruye el resultado y distingue la elegibilidad de la copia del estado actual. Las repeticiones de envío no duplican los registros.

El cierre de sesión o la pérdida de permisos elimina los datos locales. Antes de cerrar sesión conviene sincronizar; la cuenta avisa si existen consultas pendientes. Los hechos registrados dentro de la vigencia de una copia pueden sincronizarse durante los siete días siguientes a su vencimiento. Después de ese plazo, recepción debe conservar su registro manual.

## Datos fiscales y otros pendientes

**Datos fiscales** permite preparar razón social, CUIT, domicilio, condición frente al IVA y punto de venta por sede. Se valida el CUIT y se protegen ediciones concurrentes. Guardar estos datos no emite una factura: la integración fiscal y el envío automatizado por WhatsApp requieren configuración posterior.

Los planes de musculación y Pilates y sus importes definitivos, incluidas las variantes para socios, no socios y Sport Club, quedan pendientes de información comercial. No se inventaron tarifas ni se publicaron precios a partir de las notas.

Crear plan ofrece seis modelos de nombre y actividad para esas variantes. Elegir uno no guarda un plan: el precio permanece vacío y debe completarse antes de confirmar.

La sincronización con la aplicación externa de pádel requiere identificar la aplicación, su API y las reglas de conflictos. La conexión con molinetes requiere conocer el hardware y su protocolo. La generación de contenido y su publicación no se automatizaron; se conserva la revisión humana acordada.
