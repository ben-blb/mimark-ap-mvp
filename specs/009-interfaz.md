---
id: '009'
titulo: Interfaz y responsive
estado: hecha
depende_de: ['006']
requisitos: Usabilidad (extensión)
---

# 009 · Interfaz y responsive

## Objetivo

Que la plataforma se lea y se use con facilidad en escritorio y en el teléfono: un sistema visual sobrio tipo
Apple (materiales translúcidos, tipografía del sistema, modo claro y oscuro), gráficas en el tablero y listas que
en pantallas chicas se vuelven tarjetas. No cambia ningún dato, endpoint ni regla.

## Alcance

**Incluye:** tema claro/oscuro, navegación lateral y barra inferior, componentes compartidos (tarjetas de
indicador, lista responsiva, estado vacío), gráficas del tablero, rediseño de todas las pantallas y diálogos.

**No incluye:** cambios de API o de contratos, gráficas históricas, selector manual de tema, nuevas acciones o
flujos.

## Criterios de aceptación

- **AC-009-01** · El tema sigue `prefers-color-scheme` (claro u oscuro). Las superficies translúcidas usan fondo
  sólido con `prefers-reduced-transparency: reduce` y las transiciones se quitan con
  `prefers-reduced-motion: reduce`.
- **AC-009-02** · Desde `md` hay una barra lateral con las 5 secciones (icono y texto) y la ruta activa marcada con
  `aria-current="page"`; abajo de `md` hay una barra inferior con las mismas 5 secciones. El nombre, el rol y
  «Salir» se alcanzan en ambos tamaños.
- **AC-009-03** · El tablero muestra los 4 indicadores con su moneda (MXN y USD nunca se suman; se mantienen
  AC-006-02 y AC-006-06), una gráfica de barras por día de pago (una serie por moneda) y una dona con la
  composición de lo por pagar por número de expedientes (vencidos, próximos y resto). Cada gráfica tiene una
  alternativa en texto con los mismos datos para lectores de pantalla.
- **AC-009-04** · Abajo de `sm`, las listas de expedientes, órdenes de compra, proveedores y la tabla del tablero
  se muestran como tarjetas con los mismos datos, enlaces y acciones; a 375 px de ancho no hay scroll horizontal
  de página.
- **AC-009-05** · En el expediente, los campos dudosos o faltantes se marcan con color **y** texto («Dudoso»,
  «Falta»); el historial se muestra como línea de tiempo; abajo de `sm` la barra de acciones queda fija al pie.
- **AC-009-06** [manual] · Revisión visual a 375, 768 y 1440 px, en claro y oscuro, de login, tablero, expedientes,
  detalle, proveedores, órdenes de compra y asistente. Cómo verificarlo: `pnpm dev` y el navegador con esos tamaños
  y esquemas; sin desbordes, texto legible y acciones alcanzables.

## Diseño

### UI

- `app/theme.ts`: `cssVariables` + `colorSchemes` (claro/oscuro con `colorSchemeSelector: 'media'`), paleta tipo
  iOS, tipografía del sistema con tracking negativo en títulos, radio 12, material `glass` reutilizado por
  `MuiPaper`, `MuiDialog`, `MuiAppBar` y la navegación; segmented control en `MuiToggleButtonGroup`; chips
  tonales.
- `components/`: `StatCard`, `ResponsiveList`, `EmptyState`, `charts/PayDayBarChart`, `charts/PortfolioDonut`;
  `PageHeader` y `StatusChip` cambian de aspecto, no de API.
- `app/AppShell.tsx`: barra lateral (≥ md) y barra superior compacta + barra inferior (< md).
- Pantallas: mismos textos, roles y etiquetas que ya usan las pruebas.

## Tareas

- [x] 1. Dependencias `@mui/x-charts` y `@mui/icons-material`; tema claro/oscuro (AC-009-01).
- [x] 2. Componentes compartidos y gráficas con pruebas (AC-009-03, AC-009-04).
- [x] 3. `AppShell` con barra lateral y barra inferior, con prueba (AC-009-02).
- [x] 4. Tablero con indicadores y gráficas (AC-009-03).
- [x] 5. Expedientes, detalle y acciones (AC-009-04, AC-009-05).
- [x] 6. Proveedores, órdenes de compra, asistente, login y diálogos (AC-009-04).
- [x] 7. Verificación visual (AC-009-06) y bitácora.

## Fuera de alcance y decisiones

- **Gráficas con `@mui/x-charts`** (decisión del usuario): es de la misma familia que MUI 9 (peer `^9`), toma los
  colores del tema y trae tooltips y accesibilidad de teclado.
- **`@mui/icons-material`** para los iconos de la navegación y de los indicadores: sin iconos, la barra inferior
  móvil no es usable.
- **Modo oscuro automático** (decisión del usuario), sin selector manual.
- **Barra lateral en escritorio y barra inferior en móvil** (decisión del usuario).
- Depende solo de 006: el asistente (008) se reestiliza sin cambiar su comportamiento.

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->

- 2026-10-27 · Spec aprobada por el usuario junto con el plan de rediseño.
- 2026-10-27 · Tema con `cssVariables` + `colorSchemes` y `colorSchemeSelector: 'media'`. `vars(theme)` cae al tema de la
  app cuando un componente se prueba sin `ThemeProvider`; `glass()` y `tonal()` en `theme.ts` son la única receta de
  vidrio y de color de estado.
- 2026-10-27 · `ResponsiveList` decide tabla o tarjetas con `useMediaQuery`; `test/setup.ts` simula `matchMedia`
  (`setViewport`). Sin llamarlo nada coincide, como antes: las pruebas existentes siguen viendo tablas.
- 2026-10-27 · La prueba AC-006-06 del tablero ahora busca los importes con `selector: 'p'`: la tabla accesible de la
  gráfica repite los mismos importes en celdas.
- 2026-10-27 · `@mui/x-charts` pesa ~150 KB gzip; va en su propio archivo (`advancedChunks` en `vite.config.ts`). El
  resto queda en ~208 KB gzip.
- 2026-10-27 · En el teléfono el PDF no se incrusta (los navegadores móviles no lo muestran): queda el enlace «Abrir».
  Los diálogos se vuelven hoja inferior desde el tema, sin tocar cada diálogo.
- 2026-10-27 · AC-009-06 verificado con `pnpm dev` y el navegador integrado: 1440×900 (claro y oscuro), 768×1024 y
  375×812 en login, tablero, expedientes, detalle, proveedores (con diálogo), órdenes de compra y asistente.
  `scrollWidth === innerWidth` en 375 y 768. Ajustes tras la revisión: columnas de folios sin partir, proveedor a dos
  líneas, barras más angostas con pocos días y línea de tiempo con `width: '1px'` (en `sx`, `1` es 100 %).
