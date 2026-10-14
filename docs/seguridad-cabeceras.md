# Revisión del informe recibido por Nico

El informe adjunto aclara que no pudo consultar las cabeceras del dominio. Sus estados «probable» y «falta» se contrastaron con el repositorio; no se tomaron como resultados de un escaneo remoto.

## Cambios aplicados

- Cabeceras globales de Next.js: HSTS durante un año, `nosniff`, bloqueo de marcos, política de referencias y permisos de navegador. HSTS no declara `preload` ni presupone control de futuros subdominios.
- `poweredByHeader: false` evita publicar la cabecera identificadora de Next.js.
- CSP obligatoria que restringe recursos al mismo origen, prohíbe objetos y marcos, y limita formularios al propio sitio. Las imágenes admiten `data:` para QR de autenticación y `blob:` para comprobantes. Las fuentes son locales; las llamadas a Supabase y al servicio meteorológico ocurren en el servidor.
- Las páginas privadas dinámicas usan un nonce aleatorio de 128 bits por solicitud. El proxy reemplaza cabeceras recibidas del visitante y reenvía el mismo nonce a Next.js y al navegador. Conserva las cookies renovadas y las restricciones de caché en respuestas normales y redirecciones.
- Caja declara renderizado dinámico. El enlace público al acceso del personal abre un documento nuevo para establecer la CSP de ese documento privado.
- La pantalla pública de continuidad offline usa una política sin scripts ni estilos inline. La versión del caché de su pantalla se actualiza y elimina las anteriores; este cambio no borra la copia de elegibilidad ni las consultas pendientes.
- `safeReturnTo` se comparte desde un módulo puro. Los componentes del navegador ya no importan el módulo que consulta configuración del servidor.

## Compatibilidad y límites

Las páginas públicas prerenderizadas conservan la autorización de scripts inline que necesita la hidratación de Next.js. No se presenta esta CSP pública como una eliminación completa del riesgo de XSS. Endurecer esos scripts requeriría hashes integrados en cada build o cambiar esas páginas a renderizado dinámico. Las páginas privadas sí usan nonces y `strict-dynamic`; los estilos inline de React siguen permitidos.

La política mantiene pantalla completa y escritura en el portapapeles para la terminal y la cuenta. Desactiva cámara, micrófono, geolocalización y la API de pagos, que el sitio no utiliza. La aplicación autenticadora escanea el QR fuera de esta web.

## Recomendaciones que ya estaban resueltas

Los 23 enlaces externos revisados con `target="_blank"` incluyen `noopener noreferrer`. El acceso ya dispone de limitación persistente de intentos, cookies HttpOnly/Secure/SameSite, comprobación de origen y segundo factor en servidor y APIs.

El grafo de componentes cliente y el artefacto local compilado se revisaron sin encontrar módulos de conexión PostgreSQL ni credenciales del servidor expuestas. Esto verifica el código y el artefacto disponibles, no certifica versiones históricas ajenas.

La indexación pública permanece en la etapa de validación documentada del contenido y dominio; `noindex` no es una vulnerabilidad. Las páginas privadas continúan sin indexarse. Los enlaces oficiales abreviados de WhatsApp y Maps no se sustituyen por destinos supuestos: hace falta verificar el número o URL final.

## Verificación reproducible

`npm test` comprueba la política privada, las cabeceras manipuladas por un visitante, cookies renovadas y redirecciones. `npm run build:vercel` y `npm run test:vercel` sirven el build de producción y revisan las cabeceras efectivas, el nonce de cada script de las pantallas de acceso y el rechazo de acceso a Caja sin sesión. `npm run build` comprueba la compatibilidad del destino Cloudflare.

Las solicitudes directas al dominio desde este entorno reciben un bloqueo del proxy de salida (`CONNECT 403`), que no es una respuesta de la página. No se atribuye una calificación de securityheaders.com u Observatory sin poder ejecutar ese análisis externo.
