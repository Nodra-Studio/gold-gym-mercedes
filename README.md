# Gold Gym Mercedes

Web institucional y prototipo funcional privado de gestión de gimnasio y pádel.

- [Backend propio y activación](docs/BACKEND-PROPIO.md)
- [Despliegue en Vercel y límites actuales](docs/VERCEL.md)
- [Entrega y recorrido](docs/ENTREGA.md)
- [Propuesta y guía comercial](docs/VENTA.md)
- [Puesta en marcha y aceptación](docs/PUESTA-EN-MARCHA.md)
- [Arquitectura y próximos pasos](docs/TECNICA.md)
- [Investigación y fuentes](docs/research/HALLAZGOS.md)

React / Next.js App Router con runtime Vinext, Cloudflare Workers y D1. No sustituir los sistemas operativos del club hasta completar integración, migración y aceptación. No ingresar datos reales en la demostración.

```sh
npm ci
npm run dev
npm run typecheck
node --test tests/club.test.mjs
```

## Estado del proyecto

Incluye socios, cuotas, clases, control de ingreso simulado, agenda de pádel, portal de jugadores, roles, importación, respaldos e informes. Las señas y saldos de pádel cuentan con historial de cobros. Ver los documentos de entrega para límites y pruebas.

El repositorio tiene dos destinos: **Next.js nativo en Vercel** para la web pública y **Vinext sobre Cloudflare Workers/D1** para el prototipo privado existente. `vercel.json` selecciona `npm run build:vercel`. En Vercel la gestión queda explícitamente deshabilitada hasta conectar el proyecto Supabase ya creado y configurar la cuenta inicial; no se migran automáticamente los datos ni las sesiones de Sites. Ver la guía de Vercel antes de desplegar.

No se incluyen credenciales, bases locales ni datos reales del gimnasio. Las fotografías y marcas pertenecen a sus respectivos titulares; la publicación del código no concede derechos de reutilización sobre esos recursos.
