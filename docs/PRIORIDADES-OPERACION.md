# Operación y prioridades de Gold Gym

## Circuito acordado con Alex
- Dueño y recepción administran socios, pagos, clases y reservas. Los socios no necesitan cuenta ni contraseña.
- Recepción registra nombre, DNI, contacto y plan. La misma cuenta de recepción puede trabajar desde varias computadoras.
- La terminal usa una cuenta restringida de personal; el socio solo ingresa su DNI.
- Permitir acceso con cuota vigente y avisar desde 7 días antes. Si vence hoy, avisar; desde el día siguiente, derivar a recepción. También derivar si está pausado o el DNI no existe.
- La validación y su registro están implementados. La apertura del molinete físico requiere integrar el hardware del club.

## Prioridad comunicada por Nico el 6 de octubre de 2026
El dueño tuvo problemas anteriores con la carga y el control de mensualidades. Quiere priorizar cobros y gastos separados por sede, además de los turnos de pádel.

Pendiente de implementar:
- Registrar la sede de cobro en cada mensualidad y cada cobro de pádel, separada de la sede donde el socio entrena. No inventar una sede para los movimientos anteriores.
- Registrar gastos por sede: limpieza e insumos, electricidad, reparaciones y otras categorías a confirmar con Nico.
- Guardar fecha, concepto, importe, medio de pago, responsable y comprobante cuando corresponda.
- Consultar ingresos, egresos y saldo por sede y período, con detalle verificable de movimientos.
- Conservar auditoría y usar anulaciones o ajustes explícitos para corregir importes; evitar borrar movimientos financieros.
- Mantener reservas, señas, saldos y disponibilidad de canchas en el circuito de recepción.

Pendiente de aclarar con Nico: si «insumos» significa solo registrar compras/gastos o también controlar cantidades y stock; cómo se asignan gastos compartidos entre sedes; otras categorías y requisitos de cierres de caja. No presentar estos puntos como acordados o implementados.

Estado al revisar el código: los informes actuales distinguen gimnasio y pádel, pero los pagos no guardan sede y no existe una tabla de gastos. El nuevo control por sede necesita cambios de datos, formularios e informes.
