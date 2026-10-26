# MIMARK AP · Cuentas por pagar con extracción asistida por IA

MVP para el área de cuentas por pagar (CxP) de MIMARK: se sube una factura, una IA extrae sus datos, reglas
deterministas los validan contra la orden de compra (OC) y la recepción, y **una persona** confirma, programa y registra
el pago. El sistema nunca ejecuta pagos ni transferencias.

> Este documento está escrito con lo que el repositorio puede demostrar: cada afirmación remite a una spec, a una
> prueba o a un archivo de `evidencia/`.

## Datos de entrega

| Dato                | Valor                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| URL pública         | https://mimark-ap-mvp.vercel.app (proyecto `mimark-ap-mvp` en Vercel, un solo despliegue) |
| Repositorio         | https://github.com/ben-blb/mimark-ap-mvp                                                  |
| Código de acceso    | se entrega por separado al evaluador; no está en el repositorio ni en estos documentos    |
| Modelo de IA medido | `claude-haiku-5-5`, prompt `extract-invoice@1` (ver `evidencia/eval.md`)                  |

## Alternativa elegida

Aplicación propia en lugar de un flujo de automatización:

- **Backend:** NestJS 12 (ESM) y Prisma 7 sobre Postgres (Neon), desplegado como una sola función de Vercel.
- **Web:** React 19, Vite 8 y MUI 9, como sitio estático.
- **IA:** un modelo multimodal lee el PDF o la imagen directamente (AI SDK, salida validada con Zod), sin OCR aparte.
- **Contratos compartidos:** `packages/contracts` (Zod) es tipo y validación en la web, la API y la salida de la IA.
- **Desarrollo guiado por specs:** cada comportamiento nace en `specs/` con criterios `AC-NNN-NN`; las pruebas citan
  el criterio y `pnpm spec:check` verifica la trazabilidad. Las decisiones están en `docs/decisiones.md`.

## Motivo del cambio desde n8n

La prueba de concepto (carpeta `referencia-poc/`) demostró el flujo Extraer → Validar → Derivar. El MVP conserva ese
flujo y agrega lo que un flujo de automatización no da por sí solo (**revisar y completar con el equipo si hay otros
motivos**):

- **Reglas de negocio verificables:** las validaciones (cero tolerancia en importes, RFC, moneda, duplicados,
  recepción confirmada) son funciones puras con pruebas, no nodos.
- **Persistencia y auditoría:** cada acción deja un evento con quién, cuándo y `requestId`; la salida de la IA se
  guarda intacta.
- **La IA solo extrae:** ninguna decisión ni cambio de estado sale de un documento; los decide el código y una
  persona.
- **Acceso, cuotas y seguridad probadas:** acceso protegido, límite diario de uso de IA, pruebas de seguridad
  repetibles (`pnpm probador`).

## Qué funciona

| Capacidad                                                                                                  | Spec |
| ---------------------------------------------------------------------------------------------------------- | ---- |
| Acceso con código, cookie firmada, límite de intentos                                                      | 001  |
| Proveedores con días de crédito                                                                            | 002  |
| Órdenes de compra y confirmación de recepción                                                              | 003  |
| Subir PDF/PNG/JPG (≤ 4 MB, validado por su firma), extracción con IA, validación contra la OC, duplicados  | 004  |
| Corregir, confirmar, vencimiento y pago sugerido (miércoles/viernes), programar, registrar pago, descartar | 005  |
| Tablero de cartera (7/15/30 días, por moneda) y filtros de expedientes                                     | 006  |
| Probador (12 casos de aceptación y seguridad) y evaluación de exactitud de la IA                           | 007  |

## Qué no funciona o queda fuera

- **No ejecuta pagos ni transferencias** (por diseño): registrar un pago solo guarda que una persona ya lo hizo.
- Sin pagos parciales, días festivos, ni autorización por roles (el rol se declara al entrar).
- Un expediente **confirmado ya no se puede descartar**. Por eso cada corrida del probador deja un expediente
  confirmado sobre una OC propia que luego cancela.
- La cuota diaria de IA no es atómica: una ráfaga simultánea justo en el límite puede excederlo por poco.
- No hay exportación a Excel, gráficas históricas ni avisos por correo.

## Calidad de la extracción

Evaluación con 30 documentos sintéticos (`pnpm eval`, resultado en `evidencia/eval.md`): **100 % de exactitud por
campo, 0 valores inventados y 3 de 3 documentos fuera de alcance detectados**, que cumple la meta (≥ 95 %, 0 y
100 %). Se midió con `claude-haiku-5-5` y el prompt `extract-invoice@1`.

> Tanto el probador (12 de 12 PASS, `evidencia/probador.txt`) como la evaluación (`evidencia/eval.md`) se corrieron
> contra la URL pública https://mimark-ap-mvp.vercel.app, con IA real.

## Limitación principal y próximo paso

**Limitación:** la medición usa documentos sintéticos generados por el propio proyecto (texto limpio, tres
diseños). No demuestra la exactitud sobre facturas reales: escaneos torcidos, fotos, sellos o tablas densas.

**Próximo paso:** armar un conjunto de evaluación con facturas reales **anonimizadas** de MIMARK (nunca se suben
documentos reales al repositorio), medirlo con `pnpm eval` y, si la exactitud baja de 95 %, probar un modelo mayor o
un prompt v2. Para los CFDI se puede leer el XML sin IA.

## Cómo correrlo

```bash
pnpm install
pnpm bootstrap        # .env, Postgres con Docker, migraciones y semilla
pnpm dev              # web http://localhost:5173 · API http://localhost:3000/api/health
pnpm check            # tipos, capas, specs, pruebas, lint, formato e integración
```

Con `AI_PROVIDER=fake` (por defecto en local) funciona sin llaves de IA. Para IA real: `AI_PROVIDER=anthropic`,
`AI_MODEL` y `ANTHROPIC_API_KEY` en `apps/api/.env`. Despliegue y entornos: `infra/README.md`.

### Probador y evaluación contra una URL

```bash
PROBADOR_CODE='<código de acceso>' pnpm probador --url https://<url-publica>
PROBADOR_CODE='<código de acceso>' pnpm eval --url https://<url-publica>
```

El código se lee solo de la variable de entorno. La evaluación sube 30 documentos: usa un entorno con
`DAILY_AI_LIMIT=100` o sube temporalmente el límite. La base debe tener la semilla (`pnpm db:seed`).

## Evidencia (`evidencia/`)

| Archivo            | Qué es                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `probador.txt`     | Salida del probador: CA-01…CA-06 y PS-01…PS-06 con PASS/FAIL                                     |
| `eval.md`          | Exactitud de la IA por campo, inventados y fuera de alcance                                      |
| `1-pantalla.png`   | La aplicación en la URL pública (pantalla de Proveedores)                                        |
| `2-plataforma.png` | La plataforma: despliegue de producción en Vercel (estado Ready)                                 |
| `3-falla.png`      | Falla controlada: código de acceso incorrecto, con su mensaje y `Ref.` para buscarla en los logs |

Todo el material de prueba es sintético. No hay secretos ni documentos reales en el repositorio.
