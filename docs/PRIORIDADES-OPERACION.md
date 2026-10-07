# Operación y prioridades de Gold Gym

## Circuito acordado con Alex
- Dueño y recepción administran socios, pagos, clases y reservas. Los socios no necesitan cuenta ni contraseña.
- Recepción registra nombre, DNI, contacto y plan. La misma cuenta de recepción puede trabajar desde varias computadoras.
- La terminal usa una cuenta restringida de personal; el socio solo ingresa su DNI.
- Permitir acceso con cuota vigente y avisar desde 7 días antes. Si vence hoy, avisar; desde el día siguiente, derivar a recepción. También derivar si está pausado o el DNI no existe.
- La validación y su registro están implementados. La apertura del molinete físico requiere integrar el hardware del club.

## Prioridad comunicada por Nico el 6 de octubre de 2026
El dueño tuvo problemas anteriores con la carga y el control de mensualidades. Quiere priorizar cobros y gastos separados por sede, además de los turnos de pádel.

El módulo de caja de la entrega siguiente cubre la primera etapa de estas prioridades.

## Actualización 7 de octubre de 2026 — caja y stock
Alex autoriza a Codex a encargarse del desarrollo que correspondía a Alex y Nico y a continuar de forma autónoma. Preservar las mejoras visuales recientes de Nico.

Sedes confirmadas: Calle 30, Calle 23, Club Vélez (gimnasio y pádel) y Pilates. Dirección de Pilates pendiente de confirmar. No confundir sede de cobro con sede de entrenamiento.

Implementado en esta entrega:
- `/caja`: dueño y recepción registran gastos categorizados y ventas, ingresan existencias y consultan movimientos por sede, fecha y categoría. Catálogo creado por el dueño.
- Venta, descuento de stock y auditoría atómicos. Reintentos no duplican operaciones; no se permite stock negativo por ventas simultáneas.
- Anulaciones exclusivas del dueño, con motivo y contramovimiento; conservan el original. Anular una venta devuelve las unidades, por eso se utiliza cuando la mercadería vuelve físicamente.
- Cuotas nuevas requieren sede de cobro. Cobros de pádel nuevos corresponden a Vélez. Datos anteriores quedan sin sede registrada, sin inferirla.
- Respaldo JSON v3 incluye productos, caja y movimientos de stock; admite importar v1/v2 y valida relaciones de v3.
- Stock actual de las cuatro sedes y últimos 50 movimientos. CSV de la página de caja (100 filas), claramente identificado; JSON completo en Datos.
- Lecturas en lote ya no toman el bloqueo global de escritura: usan transacción de solo lectura y snapshot consistente. Menos viajes al servidor para establecer el contexto de conexión. No afirmar una mejora de latencia medida hasta medir en producción.

Límites y siguientes pasos:
- Importes en pesos enteros, como los cobros existentes. El neto de caja es movimientos registrados, no conciliación bancaria ni arqueo de efectivo.
- Ingresar mercadería actualiza cantidades; su costo se carga por separado como gasto Mercadería, para no inventar gastos ni duplicarlos.
- Pendientes: editar precios/catalogar productos inactivos; transferencias y ajustes de inventario con motivo; cierres por turno y medio de pago; adjuntar comprobantes (por ahora concepto/referencia textual); distribución de gastos compartidos.
- El nuevo módulo operativo usa PostgreSQL/Vercel. La migración SQLite mantiene compatibilidad de estructura/respaldo, no implementa la función transaccional de caja para D1.
- La API impide el acceso a terminales y clientes. Si varias recepciones usan una cuenta, la auditoría identifica esa cuenta, no a cada persona física.
- Rediseño general y optimización adicional después de estabilizar operaciones. No cambiar titularidad ni comprar planes sin una instrucción concreta.
- Mercado Pago y clima son posibilidades mencionadas, no integraciones implementadas.
- Pro de Supabase empieza en USD 25/mes según verificación oficial; no confundir con la estimación de USD 5 de la reunión. No se cambió el plan.

Verificación: 74 pruebas de dominio/auth/PostgreSQL y revisión TypeScript sin errores. Migración creada con CLI y alineada con la versión remota 20261007051900. Los advisors no detectaron problemas nuevos de RLS/funciones; se mantiene el aviso previo de protección de contraseñas filtradas desactivada (https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Índices nuevos aún sin uso son esperables antes de comenzar a operar.
