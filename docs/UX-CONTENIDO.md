# Texto y diseño de la interfaz

Revisión: 24 de octubre de 2026. El objetivo es que socios y personal encuentren lo que necesitan y entiendan qué hace cada función.

## Texto

- Usar español rioplatense natural: consultá, elegí, guardá. Evitar slogans en herramientas de gestión.
- Nombrar la función en los títulos: «Agenda de pádel», «Datos y respaldos», «Informes», «Mi cuenta». No agregar un punto final a títulos breves.
- Usar descripciones para explicar una tarea, un requisito o una consecuencia. Evitar repetir el título o prometer una experiencia.
- En botones, nombrar la acción: «Registrar cobro», «Descargar respaldo», «Consultar». Si abre WhatsApp, indicar ese destino con texto o nombre accesible.
- En la web pública, describir actividades, instalaciones y ubicación con datos reales. Conservar la identidad del club sin llenar cada sección de frases publicitarias.
- Mantener estados claros: solicitud enviada no significa reserva confirmada; resultado de caja no significa ganancia contable; acceso limitado debe explicar qué permiso falta.
- No recortar instrucciones necesarias para importar, restaurar, corregir cobros o usar la terminal sin conexión.
- Mantener el mismo nombre en navegación, título de página, acceso bloqueado y enlaces. Evitar etiquetas repetidas en el encabezado cuando el contexto ya está en el panel.

Ejemplos aplicados:

| Antes | Después |
| --- | --- |
| El próximo partido, organizado. | Agenda de pádel |
| Datos que podés llevarte. | Datos y respaldos |
| Los números del club. | Informes |
| Tu acceso al club. | Mi cuenta |
| Tu próximo partido, un paso más cerca. | Solicitud enviada |

## Decisiones de diseño y desarrollo

La revisión de referencias actuales no justifica reemplazar el diseño ni sumar una librería. Se mantienen los componentes existentes, controles nativos, estados de carga/error, foco visible, reducción de movimiento y tamaños de controles móviles. Por indicación del cliente, no se agregan botones de pausa a las franjas animadas.

Antes de usar una API web nueva, comprobar su compatibilidad entre navegadores y ofrecer una alternativa cuando corresponda. No actualizar dependencias ni añadir efectos solo por una tendencia visual. Esta revisión de código no certifica conformidad completa con WCAG ni sustituye pruebas visuales con usuarios y dispositivos.

## Fuentes consultadas

- [Nielsen Norman Group — State of UX 2026](https://www.nngroup.com/articles/state-of-ux-2026/): priorizar el funcionamiento completo del producto y las necesidades reales frente al acabado superficial.
- [GOV.UK — Writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces): títulos descriptivos, lenguaje familiar y textos breves que reduzcan el esfuerzo de lectura.
- [Apple — Principles of great design, WWDC26](https://developer.apple.com/videos/play/wwdc2026/250/): jerarquía, claridad y nombres comprensibles.
- [W3C — Novedades de WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/): foco visible y controles con tamaño o separación suficiente.
- [web.dev — Baseline](https://web.dev/baseline): comprobar disponibilidad de funciones de la plataforma en los principales navegadores.
