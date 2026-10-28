# DESIGN · MIMARK Cuentas por pagar

> **Libro mayor moderno: tinta sobre papel oscuro, números como protagonistas, color solo cuando algo requiere
> acción.**

Lo usan 2–3 personas de administración varias veces al día para decidir qué pagar los miércoles y viernes. Es una
herramienta de oficio, no una landing: densa, tranquila y exacta. Spec: `specs/010-identidad-visual.md`. Todo lo de
aquí está implementado en `src/app/theme.ts`; la UI no define colores, fuentes ni radios sueltos.

## Tokens

### Color

El oscuro ("papel oscuro") es el de referencia; el claro ("papel claro") es el mismo sistema invertido. Neutros
cálidos (tinta y papel), nunca grises puros ni negro/blanco absolutos de fondo.

| Token            | Oscuro    | Claro     | Uso                                                            |
| ---------------- | --------- | --------- | -------------------------------------------------------------- |
| `bg`             | `#131211` | `#F7F5F0` | Fondo de la app y de la barra lateral. Plano.                  |
| `surface1`       | `#1A1917` | `#FFFFFF` | Hover de fila, compositor, diálogos, menú.                     |
| `surface2`       | `#21201D` | `#EFECE6` | Mensaje de la persona, fila seleccionada, pista de las barras. |
| `divider`        | `#2C2A27` | `#E2DED6` | Divisores de 1 px. El único "borde".                           |
| `text.primary`   | `#ECE9E4` | `#1C1B19` | Cifras, nombres, cuerpo.                                       |
| `text.secondary` | `#A29E97` | `#5E5A54` | Etiquetas, metadatos.                                          |
| `text.tertiary`  | `#8A857E` | `#6E6963` | Moneda en sufijo, quién recibió, pistas.                       |
| `accent`         | `#7DB89A` | `#2E6A53` | Acción primaria, navegación activa, foco. **Nada más.**        |
| `error`          | `#D98A7E` | `#A8483B` | Vencido. Texto o punto de 6 px.                                |
| `warning`        | `#D4AE6A` | `#8A6420` | Por vencer / en revisión. Texto o punto.                       |
| `success`        | `#A8B87E` | `#56692A` | Pagado / recibido. Texto o punto.                              |

**Acento: verde tinta.** Es el color de la tinta de un libro de cuentas y del "visto bueno"; se lee como "actúa
aquí" sin la carga de alarma del rojo ni la genericidad del azul de sistema. Para no confundirlo con "pagado", el
acento es verde-azulado y frío, y `success` es oliva y cálido; además el acento nunca marca un estado, solo una
acción. Ámbar quedó descartado: chocaría con "por vencer".

Contraste (WCAG, sobre `bg` / `surface1` / `surface2`): todos los textos ≥ 4.5:1, el terciario incluido (oscuro
5.1 / 4.8 / 4.5; claro 5.0 / 5.4 / 4.6). El terciario del brief (`#6E6A64`, 3.5:1) se subió por eso. Texto sobre el
acento: `bg` en oscuro (8.2:1), blanco en claro (6.4:1).

### Forma y espacio

- Radios: **6 px** controles (botón, campo, select, tooltip), **8 px** contenedores (diálogo, menú, mensaje,
  tarjeta de herramienta). Circular solo el avatar.
- Espaciado en múltiplos de 4 px (`theme.spacing(1) = 8px`; usar `0.5` = 4 px).
- Densidad de trabajo: filas de tabla 40–44 px, controles de 32 px.
- Sin sombras salvo menús y diálogos (una sola, corta). Elevación = un paso de superficie, no sombra.

### Tipografía

**IBM Plex Sans** (UI) + **IBM Plex Mono** (folios, UUID, RFC). Plex nació para documentación técnica de IBM: tiene
aire de formulario y de oficina sin ser frío, sus cifras tabulares son claras (el 1 y el 7 no se confunden) y la
Mono es de la misma familia, así que un folio junto a un nombre no salta. Se sirve con `@fontsource` (pesos 400,
500 y 600), sin peticiones a terceros.

| Paso | Uso                                                           |
| ---- | ------------------------------------------------------------- |
| 12   | Etiquetas de la franja, sufijo de moneda, encabezados de tabla |
| 13   | Celdas de tabla, folios, metadatos                            |
| 14   | Cuerpo, botones, navegación                                   |
| 16   | Títulos de sección (h2)                                       |
| 20   | H1 de página                                                  |
| 28   | Cifras de la franja de resumen                                |

- Todos los montos con `font-variant-numeric: tabular-nums`, alineados a la derecha (`<Money>`).
- Mayúsculas con tracking **solo** en encabezados de tabla.
- Pesos: 400 cuerpo, 500 énfasis y folios, 600 títulos y marca. Nunca 700+.

## Componentes base

- `Money`: monto tabular; `cents={false}` en resúmenes; la moneda como sufijo pequeño terciario.
- `StatusDot`: punto de 6 px + texto. Sustituye a los chips de estado.
- `SummaryStrip`: cifras separadas por divisores verticales de 1 px, sin tarjetas.
- `DataTable`: tabla compacta sobre el fondo, filas clicables con hover de un paso y foco de teclado.

Franja de resumen (ejemplo):

```
Por pagar              │ Vencido            │ Próximos 15 días     │ Pagado este mes
$28,536 MXN            │ Al corriente       │ $28,536 MXN          │ $28,304 MXN
4 expedientes          │                    │ 4 expedientes        │ 3 expedientes
```

Etiqueta 12 secundaria · cifra 28 tabular · "MXN" 12 terciario · conteo 12 terciario. "Al corriente" en `success`,
nunca rojo con un 0.

## Movimiento

Solo con propósito: mensajes del asistente entran con fade + 4 px (150 ms, ease-out); filas de herramienta cambian
de estado en 120 ms; hover de fila 120 ms. Todo se desactiva con `prefers-reduced-motion`. Nada decorativo.

## Copy

Español de México, directo. Botones con verbo + objeto ("Nueva orden", "Programar pago"). Sin subtítulos debajo
del H1. Fechas "25 oct" en el año en curso; con año si es otro ("25 oct 2025").

## Anti-patrones prohibidos

- Fondos con aurora, glow, blur o gradientes decorativos.
- Sidebar "flotante" con borde y radio grande separada del borde de la ventana.
- Logo como cuadrito con gradiente y una letra.
- Fila de 4 tarjetas KPI idénticas con ícono en cuadrito de color.
- Envolver todo en tarjetas con borde ("card soup").
- Subtítulo explicativo debajo de cada H1.
- Pastillas/chips de color para cada estado; segmented controls redondos por todos lados.
- Gráficas que no informan (donut de un solo segmento, barras con 2 datos).
- Etiqueta roja de "Vencidos" cuando el valor es 0.
- Azul de sistema (`#0A84FF`/`#007AFF`) o más de un acento.
- Bloques de fondo de color para la navegación activa o para estados.
- Sombras difusas grandes para "elevar" tarjetas.
- Íconos decorativos junto a títulos, etiquetas o cifras (íconos solo donde son el control: adjuntar, salir).
- Avatar de color con iniciales en cada fila de tabla.
- Animaciones de entrada en tablas o cifras que "cuentan" hacia arriba.
- Centavos en las cifras de resumen; montos alineados a la izquierda o sin cifras tabulares.
- Mayúsculas con tracking fuera de los encabezados de tabla (overlines, botones, etiquetas).
- Burbujas de chat de color brillante; el asistente "hablando" dentro de una burbuja.
- Texto truncado en acciones ("Confirmar rec…").
