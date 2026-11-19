# Pendientes de verificar

Lista viva de lo que un agente no pudo comprobar solo (verificación manual, decisiones abiertas, texto por
revisar). **Quien lo resuelva lo borra de aquí y lo anota en la Bitácora de su spec.** Los agentes agregan una
línea cada vez que dejan algo sin verificar; formato: `- [ ] AAAA-MM-DD · spec · qué falta · cómo verificarlo`.

## Verificación manual

- [ ] 2026-11-15 · 018/019 · Repetir el recorrido de `docs/verificacion-manual.md` con teclado y ratón en la web
      (el 2026-11-15 se probó la API de punta a punta y la web a 375 px, pero el recorrido completo por la
      interfaz no se hizo). Usuarios y archivos están en ese documento.
- [ ] 2026-11-15 · 019 · Con `AI_PROVIDER=anthropic` la lectura del PDF falló con `AI_UNAVAILABLE` (llave, modelo
      `claude-haiku-5-5` o red; no se investigó). Verificar la lectura real de `docs/OC 3062 PEPSI.pdf`.

- [ ] 2026-11-15 · 004/015 · `pnpm paquete-manual` (guía `docs/paquete-de-pruebas.md`): los resultados esperados
      se derivaron de las reglas, no se ejecutaron contra la IA real. Recorrerlos y corregir la guía donde difieran
      (en especial `X07`/`X08`, `E11`, `E12` y `PO_MISMATCH`). PNG/JPG no se generan: exportar una factura a mano.

- [ ] 2026-11-18 · 020/021 · En el export real de Parlevel que se vio, la columna Asset parece repetirse (varias filas
      con «1»). Si es así, `parlevelAsset` único (AC-020-04) rechazaría kioskos y la 021 deberá mapear por otro
      campo (p. ej. Device ID). Confirmar con el export completo antes de aprobar la 021.

- [ ] 2026-11-18 · 020 · AC-020-14 se probó con un concepto con el formato de la spec, no con uno de un estado de
      cuenta real. Repetir «Probar» de las reglas con un concepto real cuando llegue el PDF (spec 022).

- [ ] 2026-11-18 · 021 · AC-021-15 [manual], sigue abierto. Con el libro de la contadora solo el banco coincide
      (−61,414.08, agosto; ya acepta meses mezclados). Faltan los **exports crudos** de Parlevel (ventas por día y por Asset, mermas), Cantaloupe
      (con Device ID) y los archivos de caja y nómina; o decidir que la 021 acepte los acumulados mensuales (Parlevel
      sin Date, Cantaloupe en tabla dinámica). Detalle en la Bitácora de la 021. Después: cargarlos en `/cierre/cargas`,
      comparar totales con el Excel y medir si 45 kioskos caben en 4 MB. Al terminar: borrar esta línea y pasar a `hecha`.
- [ ] 2026-11-18 · 022 · AC-022-12 [manual]. Con un estado de cuenta real de una cuenta chica (`AI_PROVIDER` real, no
      `fake`): subir el PDF en `/cierre/cargas` → «Banco (PDF)», comprobar `balanceCheck`, comparar las filas con el
      Excel de la contadora y anotar % de filas exactas y casos fallidos; medir el tiempo y si un mes grande cabe en 300 s
      (si no, partir por páginas). Antes, `pnpm eval:bank --url <URL>` con el PDF sintético. Al terminar: borrar esta
      línea y anotarlo en la Bitácora de la spec 022. Límite conocido: el borrador solo vive en la pantalla; si se
      recarga, hay que volver a subir el PDF (no hay `GET` del borrador).

## Decisiones o texto por revisar

- [ ] 2026-11-15 · 018 · `apps/api/src/integrations/prompts/assistant.v3.ts` aún dice «el checklist completo»;
      la recepción ahora es por cantidades. Cambiar el prompt es otra decisión (versión nueva del prompt).
- [ ] 2026-11-15 · 018 · Una cantidad como `'70.0'` queda así en el evento de auditoría y como `70` en la API.
      No afecta cálculos; opcional: normalizarla en `receipt.rules.ts`.
- [ ] 2026-11-15 · 015 · `pnpm spec:check` la muestra `en-progreso` con tareas 7/8: revisar qué falta y cerrarla.
- [ ] 2026-11-15 · 019 · Validar con la contadora que el subtotal de sus facturas sea comparable con cantidad × precio
      unitario de la OC (por ejemplo, que el IEPS no venga dentro del precio).
- [ ] 2026-11-18 · 020–024 · Cierre mensual (Mini SRS de kioskos): las specs están en `borrador`. Antes de pasarlas
      a `lista`, resolver con la contadora y el jefe: catálogo de categorías y renglón de EDO RES, ID de kiosko por
      fuente, prorrateo de gastos generales, si el banco da CSV/Excel, comisión Cantaloupe 3.4 % / IVA / tolerancia,
      y si el EDO RES queda idéntico o se separa Ventas. Pedir un mes completo de cada export (sintetizarlo para el repo).
