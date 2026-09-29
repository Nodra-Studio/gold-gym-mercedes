# Autenticación y PostgreSQL independientes

## Estado de esta entrega

El código para Supabase Auth y PostgreSQL está implementado. El proyecto Supabase `gold-gym-mercedes` ya fue creado en la organización `alexpereyra-dev`, región São Paulo, con referencia `iqopbxqxqelptvfsxaxt`. Se aplicaron las migraciones del esquema y de optimización de políticas/índices. Se guardaron APP_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y el secreto DATABASEURL en Vercel Production. Existe una cuenta inicial confirmada en Auth. GOLD_GYM_OWNER_ID ya fue guardado y el despliegue completó. El 29/09/2026 se corrigió la confianza TLS incorporando la CA pública oficial de Supabase con validación de certificado y hostname. La comprobación desde Vercel avanzó de SELF_SIGNED_CERT_IN_CHAIN a 28P01: la contraseña de PostgreSQL guardada en el secreto de conexión es rechazada. El titular debe actualizar DATABASEURL (o DATABASE_URL, que tiene prioridad) con la credencial vigente y redesplegar. El login y los módulos de gestión aún no están validados en producción.

La base remota fue verificada: 14 tablas con RLS, sin acceso al esquema para anon/authenticated, rol de aplicación sin superusuario/BYPASSRLS y prueba transaccional de aislamiento completada con rollback (sin datos persistidos). Advisors: sin avisos de seguridad; quedan sólo índices sin uso, esperables en una base nueva. Las pruebas locales ejecutan el motor PostgreSQL de PGlite y las API reales del dominio. Las pruebas del proveedor de autenticación usan un cliente simulado: falta validar envío/recepción de correos, PKCE, cookies, recuperación y revocación contra el proyecto remoto. No hay datos reales migrados.

## Diseño

- Next.js nativo en Vercel, Supabase Auth por correo/contraseña y PostgreSQL por conexión del servidor.
- Cookies HttpOnly, Secure en producción, SameSite=Lax. El cliente Supabase se crea por solicitud, nunca se comparte entre usuarios. `getUser()` verifica la identidad con el proveedor; no se confía en cabeceras de Sites ni en metadatos editables.
- `/acceso`, `/crear-cuenta`, `/recuperar`, `/actualizar-clave` y `/cuenta` completan el recorrido de identidad. El callback usa PKCE y redirecciones locales. Los enlaces deben abrirse en el navegador donde se inició el flujo; un enlace vencido permite solicitar uno nuevo.
- El UUID del dueño se provisiona mediante `GOLD_GYM_OWNER_ID`. Registrarse no asigna administración. Las cuentas nuevas muestran su identificador en `/cuenta`; el dueño habilita recepción, terminal o jugador desde `/equipo`. Revocar una membresía bloquea las siguientes solicitudes.
- El esquema privado `club` no está expuesto a la API pública de Supabase. Sus 14 tablas tienen RLS. El rol sin login `gold_gym_app` sólo puede operar sobre el espacio indicado por el servidor; `anon` y `authenticated` no tienen acceso. Las decisiones por rol se verifican además en las API.
- La conexión usa TLS validado, un pool pequeño y sentencias sin preparación persistente para Supavisor. Cada operación usa una transacción con `SET LOCAL ROLE`, esquema y propietario, sin contaminar la próxima conexión reutilizada.
- Una capa pequeña adapta las consultas existentes a PostgreSQL: parámetros, cálculo de vencimientos y JSON de restauración. Los lotes mantienen auditoría y mutaciones atómicas. Un bloqueo transaccional compartido serializa los lotes entre instancias; adecuado para un club, pendiente medir con carga antes de ampliar escala.
- Límites persistentes de 8 intentos por correo/acción cada 15 minutos; recuperación responde igual aunque la cuenta no exista. Complementar con límites del proveedor y SMTP antes de abrir registros al público.

## Activación

1. **Completado:** crear un proyecto **dedicado** `gold-gym-mercedes` en la organización elegida y confirmar el costo informado por Supabase. No reutilizar proyectos de otros clientes.
2. **Completado en este proyecto:** aplicar el archivo generado por CLI en `supabase/migrations/20260925065344_gold_gym_private_schema.sql` a esa base mediante la herramienta de migraciones de Supabase. La migración no es idempotente: aplicarla una sola vez con historial. Ejecutar advisors y resolver avisos del proyecto.
3. Crear/verificar la cuenta inicial del dueño en Supabase Auth. Su contraseña la elige el titular. Copiar su UUID a `GOLD_GYM_OWNER_ID`; no compartir la contraseña por chat ni versionarla. El backend no permite autoasignarse como dueño.
4. Configurar confirmación de correo, contraseña mínima de 12 caracteres, Site URL y Redirect URLs con el dominio definitivo y `/auth/callback`. Habilitar el proveedor de email y configurar SMTP para entrega real. Mantener los mensajes genéricos para evitar enumeración.
5. El código acepta `DATABASEURL` como alias del secreto ya guardado en Vercel; `DATABASE_URL` tiene prioridad si ambos existen. Nunca registrar ni versionar sus valores. Cargar las cinco variables de `.env.example` en Vercel como variables del servidor: `APP_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, `GOLD_GYM_OWNER_ID`. Usar la URI **Transaction pooler** del panel Connect. La clave publishable no concede permisos de base; no hace falta `service_role` para esta aplicación.
6. La conexión administrativa se limita con `SET LOCAL ROLE gold_gym_app` en cada transacción. Para menor privilegio del secreto de conexión, crear un usuario de conexión dedicado con permiso para asumir ese rol, guardar su contraseña sólo en Vercel y verificar con el proveedor el formato del usuario en Supavisor. No otorgarle superusuario ni BYPASSRLS.
7. Ejecutar `pnpm backend:check` con variables reales, sin imprimirlas. Verifica conexión, tablas, rol efectivo, servicio Auth y confirmación de correo. Volver a desplegar Vercel al cambiar variables.
8. Probar con dueño y una cuenta sin permisos: registro, confirmación, login, alta de recepción, revocación, recuperación y cierre. Confirmar que alguien sin rol no ve ni crea datos, que las cookies no se cachean y que las cabeceras `oai-authenticated-*` no dan acceso.
9. Exportar el JSON v2 desde la instalación anterior y restaurarlo en un espacio vacío. La restauración remapea IDs y dueño. El personal debe asignarse nuevamente a sus cuentas Supabase. Las asociaciones históricas `created_by` de reservas no se transfieren: resolverlas de forma supervisada antes de habilitar el portal a jugadores.

## Validación reproducible

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build:vercel
pnpm run test:vercel
pnpm run build
```

65 pruebas: 39 del dominio SQLite, 13 sobre PostgreSQL (incluidos RLS, transacciones y restauración), 9 de límites de autenticación y respuestas, 2 de diagnóstico seguro y 2 de confianza TLS. Los totales incluyen los contenedores de pruebas. GitHub Actions ejecuta las mismas verificaciones; las pruebas de Vercel sin variables confirman el cierre seguro de los módulos privados.

## Pendientes después de activar

Respaldos automáticos y restauración remota ensayada; métricas y alertas; paginación de listados grandes; devoluciones/anulaciones auditadas; pruebas concurrentes contra PostgreSQL remoto; integración y prueba física del molinete; aprobación del contenido público y políticas del club. El alta de una cuenta no implica que sea un socio ni le asigna una cuota.

## Diagnóstico de conexión

`GET /api/health` realiza una consulta sin filas sobre el esquema privado. Responde únicamente `ok` (200) o `unavailable` (503), sin caché. La falta de configuración sigue bloqueada por el proxy. Los logs de Vercel registran sólo códigos de error permitidos, nunca credenciales, consultas ni mensajes originales.

La CA oficial está incorporada en `lib/postgres/tls.mjs`, compartida por la aplicación y `backend:check`. Sólo se utiliza para hosts de Supabase. No desactivar `rejectUnauthorized` para resolver problemas TLS. La CA vence el 26/04/2031 y debe actualizarse desde la fuente oficial cuando corresponda.

Para el error 28P01, corregir el secreto de conexión en Vercel Production con la contraseña vigente de **Database**, no la de Auth. Conservar host/puerto/usuario de la URI Transaction pooler del panel Connect, codificar caracteres reservados de la contraseña y redesplegar. No pegar contraseñas en incidencias, commits ni chats. Verificar que `/api/health` devuelve 200 antes de repetir el ingreso del dueño.
