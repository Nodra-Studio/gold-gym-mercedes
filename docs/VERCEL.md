# Despliegue en Vercel

## Qué queda disponible

La web institucional (`/`, `/padel`) y la propuesta (`/propuesta`) usan Next.js nativo. El despliegue no requiere credenciales para esas páginas. Se mantiene `noindex` hasta aprobar contenido y dominio definitivos.

Los módulos de socios, pagos, ingresos y reservas tienen una adaptación a PostgreSQL y Supabase Auth. El proyecto Supabase ya está creado y migrado; el nuevo proyecto de Vercel debe tener sus variables configuradas: mientras no estén configuradas, en Vercel las pantallas privadas muestran un aviso y todas las rutas `/api/*` responden 503 sin acceder a datos. Las cabeceras `oai-authenticated-*` enviadas por visitantes no autentican usuarios. No se habilita una identidad compartida de demostración en producción.

## Configuración

- Repositorio: `Nodra-Studio/gold-gym-mercedes`, rama `main`.
- Root Directory: raíz del repositorio.
- Framework Preset: Next.js.
- Build Command: `npm run build:vercel` (definido en `vercel.json`).
- Output Directory: `.next-vercel` (definido en `vercel.json`).
- Node.js: 22.x (fijado en `package.json`).
- Instalación: `npm ci` con `package-lock.json` versionado.

Si existen overrides manuales diferentes en el proyecto de Vercel, quitarlos o alinearlos con estos valores. Volver a desplegar el commit nuevo; volver a desplegar el snapshot `f471071` conserva el error original.

El fallo `routes-manifest.json couldn't be found` se producía porque `npm run build` ejecutaba Vinext y generaba `dist`, mientras Vercel esperaba la salida de Next.js. Cambiar solamente Output Directory a `dist` no adapta el backend de Workers a Vercel.

## Validación local

```sh
npm ci
npm test
npm run build:vercel
npm run test:vercel
```

La prueba inicia un servidor Next de producción, comprueba páginas públicas y recursos, verifica el bloqueo de las pantallas privadas y prueba GET/POST en todas las API con cabeceras de identidad falsificadas. No equivale a una validación del despliegue remoto de Vercel.

Para desarrollo Next: `npm run dev:vercel`. Para servir el build Next: `npm run start:vercel`.

Los comandos `npm run dev`, `npm run build` y `npm run start` conservan el runtime de Cloudflare. El alias `@club/runtime` separa sus bindings de la compilación Next. No copiar las variables o cabeceras de identidad de Sites a Vercel como sustituto de autenticación.

## Activación de la gestión independiente

Ver [BACKEND-PROPIO.md](BACKEND-PROPIO.md) para la migración, cuenta inicial, variables, pruebas y límites actuales. El código está implementado; el servicio remoto está creado y migrado, la conexión remota y el inicio de sesión deben comprobarse en cada alojamiento.
