import { esES } from '@mui/material/locale';
import { createTheme, type CSSObject, type Theme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface TypeText {
    /** Moneda en sufijo, quién recibió, pistas (DESIGN.md). */
    tertiary: string;
  }
  interface TypeBackground {
    /** Un paso arriba del fondo: hover de fila, compositor, menús. */
    surface1: string;
    /** Dos pasos: mensaje de la persona, pista de barras, fila seleccionada. */
    surface2: string;
  }
}

const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

/** Colores de estado: se pintan como texto o punto, nunca como fondo de bloque (DESIGN.md). */
const TONES = ['primary', 'success', 'warning', 'error', 'info'] as const;
type Tone = (typeof TONES)[number];

/** Radios del sistema: 6 px controles, 8 px contenedores. */
export const RADIUS = { control: '6px', container: '8px' } as const;

/**
 * Superficie elevada plana (spec 010, AC-010-01): un paso de color y un divisor de 1 px. Sin blur, sin
 * transparencia, sin sombra. Sustituye al antiguo material translúcido.
 */
export function surface(theme: Theme, level: 1 | 2 = 1): CSSObject {
  const palette = vars(theme).palette;
  return {
    backgroundColor: level === 1 ? palette.background.surface1 : palette.background.surface2,
    border: '1px solid',
    borderColor: palette.divider,
  };
}

/** Texto de un color de estado, con un fondo apenas perceptible (campos dudosos, zona de arrastre). */
export function tonal(theme: Theme, tone: Tone, strength = 0.08): CSSObject {
  return {
    backgroundColor: `rgba(${vars(theme).palette[tone].mainChannel} / ${strength})`,
    color: vars(theme).palette[tone].main,
  };
}

/**
 * Variables CSS del tema. Existen porque el tema se crea con `cssVariables`; fuera del `ThemeProvider`
 * (pruebas de componentes) se usan las del tema de la app.
 */
export function vars(current: Theme) {
  const result = current.vars ?? theme.vars;
  if (!result) throw new Error('El tema necesita cssVariables');
  return result;
}

const isTone = (color: unknown): color is Tone => TONES.includes(color as Tone);

/** Folios, RFC y UUID. */
export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
const SANS = '"IBM Plex Sans", "Helvetica Neue", Helvetica, sans-serif';

/** Cifras alineadas en columna: todos los montos. */
export const TABULAR = { fontVariantNumeric: 'tabular-nums' } as const;

/**
 * Tema único "libro mayor" (DESIGN.md), claro u oscuro según el sistema. La UI no define colores, tipografías ni
 * radios sueltos: todo sale de aquí.
 */
export const theme = createTheme(
  {
    cssVariables: { colorSchemeSelector: 'media' },
    colorSchemes: {
      dark: {
        palette: {
          primary: { main: '#7DB89A', dark: '#679F84', light: '#97C9AF', contrastText: '#131211' },
          secondary: { main: '#A29E97' },
          success: { main: '#A8B87E', dark: '#8E9D66', light: '#BCC99A' },
          warning: { main: '#D4AE6A', dark: '#B8934F', light: '#E0C28A' },
          error: { main: '#D98A7E', dark: '#BF7266', light: '#E5A69C' },
          info: { main: '#A29E97', dark: '#8A857E', light: '#BDB9B2' },
          background: {
            default: '#131211',
            paper: '#1A1917',
            surface1: '#1A1917',
            surface2: '#21201D',
          },
          text: { primary: '#ECE9E4', secondary: '#A29E97', tertiary: '#8A857E' },
          divider: '#2C2A27',
          action: { hover: '#1A1917', selected: '#21201D' },
        },
      },
      light: {
        palette: {
          primary: { main: '#2E6A53', dark: '#245442', light: '#4A8670', contrastText: '#FFFFFF' },
          secondary: { main: '#5E5A54' },
          success: { main: '#56692A', dark: '#45551F', light: '#6F8540' },
          warning: { main: '#8A6420', dark: '#6F4F14', light: '#A57D38' },
          error: { main: '#A8483B', dark: '#8A372C', light: '#C0645A' },
          info: { main: '#5E5A54', dark: '#4A4641', light: '#6E6963' },
          background: {
            default: '#F7F5F0',
            paper: '#FFFFFF',
            surface1: '#FFFFFF',
            surface2: '#EFECE6',
          },
          text: { primary: '#1C1B19', secondary: '#5E5A54', tertiary: '#6E6963' },
          divider: '#E2DED6',
          action: { hover: '#EFECE6', selected: '#EFECE6' },
        },
      },
    },
    shape: { borderRadius: 6 },
    spacing: 8,
    typography: {
      fontFamily: SANS,
      fontSize: 14,
      // Escala corta: 12 / 13 / 14 / 16 / 20 / 28. Nada pasa de 600.
      h1: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.005em', lineHeight: 1.3 },
      h2: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 },
      h3: { fontSize: '1.75rem', fontWeight: 500, lineHeight: 1.15, ...TABULAR },
      body1: { fontSize: '0.875rem', lineHeight: 1.55 },
      body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
      caption: { fontSize: '0.75rem', lineHeight: 1.45 },
      // Mayúsculas con tracking solo en encabezados de tabla (DESIGN.md): el overline se usa solo ahí.
      overline: {
        fontSize: '0.6875rem',
        fontWeight: 500,
        letterSpacing: '0.06em',
        lineHeight: 1.5,
        textTransform: 'uppercase',
      },
      button: { textTransform: 'none', fontWeight: 500, letterSpacing: 0, fontSize: '0.875rem' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: (theme) => ({
          body: {
            minHeight: '100vh',
            WebkitFontSmoothing: 'antialiased',
            fontFeatureSettings: '"ss02"',
          },
          '::selection': { backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.3)` },
          ':focus-visible': {
            outline: `2px solid ${vars(theme).palette.primary.main}`,
            outlineOffset: 2,
          },
          [REDUCED_MOTION]: {
            '*, *::before, *::after': {
              transitionDuration: '0.01ms !important',
              animationDuration: '0.01ms !important',
            },
          },
        }),
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({ backgroundImage: 'none', ...surface(theme) }),
          rounded: { borderRadius: RADIUS.container },
        },
      },
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: RADIUS.control,
            minHeight: 32,
            paddingBlock: 4,
            paddingInline: 12,
            whiteSpace: 'nowrap',
            transition: 'background-color 120ms ease, color 120ms ease',
          },
          sizeSmall: { minHeight: 28, paddingInline: 8, fontSize: '0.8125rem' },
          text: { '&:hover': { backgroundColor: 'transparent', textDecoration: 'underline' } },
          outlined: ({ theme }) => ({
            borderColor: vars(theme).palette.divider,
            color: vars(theme).palette.text.primary,
            '&:hover': {
              borderColor: vars(theme).palette.text.tertiary,
              backgroundColor: 'transparent',
            },
          }),
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: RADIUS.control,
            color: vars(theme).palette.text.secondary,
            '&:hover': { color: vars(theme).palette.text.primary },
          }),
        },
      },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: RADIUS.control,
            backgroundColor: 'transparent',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: vars(theme).palette.divider },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: vars(theme).palette.text.tertiary,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1 },
          }),
          input: { fontSize: '0.875rem' },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: ({ theme }) => ({ minHeight: 32, borderBottom: `1px solid ${vars(theme).palette.divider}` }),
          indicator: { height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: ({ theme }) => ({
            minHeight: 32,
            minWidth: 0,
            paddingInline: 0,
            paddingBlock: 6,
            marginRight: 20,
            fontWeight: 500,
            color: vars(theme).palette.text.secondary,
            '&.Mui-selected': { color: vars(theme).palette.text.primary },
          }),
        },
      },
      MuiChip: {
        // Solo para sugerencias de texto (asistente); los estados usan StatusDot.
        styleOverrides: {
          root: ({ theme, ownerState }) => ({
            fontWeight: 400,
            borderRadius: RADIUS.control,
            ...(ownerState.variant !== 'outlined' && isTone(ownerState.color)
              ? tonal(theme, ownerState.color)
              : {}),
            ...(ownerState.variant !== 'outlined' && ownerState.color === 'default'
              ? { backgroundColor: vars(theme).palette.background.surface2 }
              : {}),
          }),
          outlined: ({ theme }) => ({ borderColor: vars(theme).palette.divider }),
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: RADIUS.container,
            alignItems: 'center',
            border: `1px solid ${vars(theme).palette.divider}`,
            backgroundColor: 'transparent',
            color: vars(theme).palette.text.primary,
          }),
          icon: { opacity: 1 },
          standard: ({ theme, ownerState }) =>
            isTone(ownerState.severity)
              ? { '& .MuiAlert-icon': { color: vars(theme).palette[ownerState.severity].main } }
              : {},
        },
      },
      MuiTable: { defaultProps: { size: 'small' } },
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderColor: vars(theme).palette.divider,
            fontSize: '0.8125rem',
            height: 42,
            paddingBlock: 0,
            paddingInline: 12,
            '&:first-of-type': { paddingLeft: 0 },
            '&:last-of-type': { paddingRight: 0 },
          }),
          head: ({ theme }) => ({
            ...theme.typography.overline,
            height: 36,
            color: vars(theme).palette.text.secondary,
            whiteSpace: 'nowrap',
          }),
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: ({ theme }) => ({
            transition: 'background-color 120ms ease',
            '&.MuiTableRow-hover:hover': { backgroundColor: vars(theme).palette.background.surface1 },
          }),
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: ({ theme }) => ({
            ...surface(theme, 2),
            color: vars(theme).palette.text.primary,
            borderRadius: RADIUS.control,
            fontSize: '0.75rem',
            fontWeight: 400,
          }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          container: ({ theme }) => ({
            [theme.breakpoints.down('sm')]: { alignItems: 'flex-end' },
          }),
          paper: ({ theme }) => ({
            ...surface(theme),
            borderRadius: RADIUS.container,
            boxShadow: '0 12px 32px rgba(0 0 0 / 0.35)',
            [theme.breakpoints.down('sm')]: {
              margin: 0,
              width: '100%',
              maxWidth: '100% !important',
              maxHeight: '92dvh',
              borderRadius: `${RADIUS.container} ${RADIUS.container} 0 0`,
              paddingBottom: 'env(safe-area-inset-bottom)',
            },
          }),
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(10 9 8 / 0.6)' } },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => ({
            ...surface(theme),
            borderRadius: RADIUS.container,
            boxShadow: '0 8px 24px rgba(0 0 0 / 0.3)',
          }),
        },
      },
      MuiLinearProgress: { styleOverrides: { root: { height: 2 } } },
      MuiLink: {
        defaultProps: { underline: 'hover' },
        styleOverrides: { root: { fontWeight: 500 } },
      },
    },
  },
  esES,
);

/** Alto de la barra inferior del teléfono: lo que flota al pie (acciones, compositor) se pone encima. */
export const MOBILE_NAV_OFFSET = 'calc(56px + env(safe-area-inset-bottom))';
