# Integración de pádel con DondeJuego

## Objetivo y estado

Reunir en la agenda de Gold Gym los turnos disponibles, reservados, modificados y cancelados de DondeJuego, conservando la presencia del club en esa app. Es la prioridad expresada en las reuniones del 20 y 22 de octubre de 2026.

**Pendiente de habilitación oficial.** No hay conexión activa ni un conector ficticio. El sitio público de DondeJuego confirma agenda, reservas y gestión de complejos, pero la investigación no encontró documentación pública de API, webhooks o integración con terceros. Esto no demuestra que no exista una integración privada: hace falta solicitarla a su equipo.

La sección de Configuración explica el estado actual y abre una consulta preparada en WhatsApp. El usuario revisa y envía el mensaje; abrir el enlace no conecta las agendas ni envía nada automáticamente. No se contactó al proveedor desde este desarrollo.

## Fuentes oficiales verificadas

- [Sitio oficial](https://www.dondejuegoapp.com/): funciones para gestionar agenda, reservas, caja y colaboradores; contacto para complejos.
- [Preguntas frecuentes](https://www.dondejuegoapp.com/faq): operación desde app y web, reservas, modificaciones y contacto del proveedor.
- [WhatsApp oficial](https://api.whatsapp.com/send?phone=5493425268473): +54 9 342 526-8473, enlazado desde el sitio actual. Algunos resultados indexados muestran un número anterior; usar el enlace actual. No se infirió una dirección de correo a partir del texto protegido de la web.

Investigación realizada el 23 de octubre de 2026. No se usaron endpoints privados, extracción de sesiones ni scraping de la aplicación.

## Qué pedir

1. Confirmar si permiten integrar el complejo de Gold Gym con un sistema externo y qué autorización del titular necesitan.
2. Documentación del acceso oficial, autenticación y permisos mínimos, entorno de pruebas, costos y contacto técnico.
3. Identificadores del complejo y sus canchas; horarios, duraciones y zona horaria.
4. Consultas de disponibilidad y reservas, incluyendo cambios, cancelaciones, bloqueos y recurrencias; identificador estable, estado y fecha de actualización de cada operación.
5. Webhooks autenticados o consultas incrementales, límites de uso, paginación y tratamiento de reintentos, duplicados y eventos fuera de orden.
6. Posibilidad de crear o bloquear turnos en DondeJuego cuando se reservan desde Gold. La lectura en un solo sentido no impide dobles reservas entre canales.
7. Qué datos de señas, pagos y devoluciones pueden compartirse, con reglas para evitar registrar dos veces el mismo cobro.

Las credenciales se incorporarán por configuración del servidor una vez conocido el contrato. La pantalla informativa no solicita claves ni contraseñas de cuentas.

## Consulta lista para enviar

> Hola, ¿cómo están? Estamos desarrollando la web de Gold Gym Mercedes y queremos vincular su agenda de pádel con DondeJuego, manteniendo la app que ya usan. Necesitamos consultar turnos disponibles y reservados, recibir cambios y cancelaciones, y evitar que un mismo horario se reserve en ambos sistemas. ¿Tienen una API, webhooks o alguna integración oficial? ¿Nos pueden pasar la documentación, los requisitos de acceso para el complejo, los costos si los hubiera y un contacto técnico? Gracias.

## Encaje con la agenda actual

La disponibilidad pública y la agenda administrativa de Gold consultan reservas confirmadas en `bookings`. Hoy no consultan DondeJuego. Un turno creado en un sistema no bloquea automáticamente el otro; recepción debe revisar ambas agendas antes de confirmar.

Gold configura cuatro canchas, turnos de 90 minutos y una grilla fija de 08:00 a 21:30. Antes de importar hay que mapear las canchas y adaptar el modelo si DondeJuego admite otras duraciones o inicios. El índice `bookings_active_slot` evita duplicar una cancha con el mismo día e inicio, pero no evita intervalos distintos que se superponen. No se deben redondear o recortar turnos externos para hacerlos entrar en la grilla.

El sistema ya tiene claves de idempotencia y transacciones para las reservas. La conexión deberá conservar una identidad externa estable por reserva, aplicar cambios de forma transaccional, registrar el origen en auditoría y mostrar los conflictos para su resolución. Los pagos externos no se contabilizarán como ingresos nuevos sin comprobar su correspondencia.

## Próximos pasos al recibir respuesta

1. Revisar el contrato autorizado y definir qué sistema confirma cada reserva. Si sólo hay lectura, mantener la creación en DondeJuego y reflejar ocupación en Gold sin prometer sincronización de doble vía.
2. Validar con datos de prueba el mapeo de canchas, estados, horarios y pagos.
3. Implementar la conexión con permisos mínimos, idempotencia, conciliación y registro de errores.
4. Probar alta, cambio de horario, cancelación, repetición de eventos, caída temporal y conflicto simultáneo de reserva.
5. Activar únicamente después de comprobar disponibilidad consistente en ambos canales.

La app de rutinas, planes de entrenamiento y estadísticas personales pertenece al segundo proyecto mencionado en la reunión y queda fuera de esta integración.
