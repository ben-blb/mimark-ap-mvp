import { esES } from '@mui/material/locale';
import { createTheme, type CSSObject, type Theme } from '@mui/material/styles';

const REDUCED_TRANSPARENCY = '@media (prefers-reduced-transparency: reduce)';
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

/** Colores de estado que se pintan "tonales" (fondo suave + texto oscuro): chips y avisos. */
const TONES = ['primary', 'success', 'warning', 'error', 'info'] as const;
type Tone = (typeof TONES)[number];

/**
 * Material translúcido (spec 009, AC-009-01). Una sola receta para tarjetas, diálogos y navegación:
 * fondo semitransparente con desenfoque y un borde claro, y sólido si la persona pide menos transparencia.
 */
export function glass(theme: Theme, opacity = 0.72): CSSObject {
  return {
    backgroundColor: `rgba(${vars(theme).palette.background.paperChannel} / ${opacity})`,
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid',
    borderColor: 'rgba(255 255 255 / 0.6)',
    boxShadow: '0 1px 2px rgba(0 0 0 / 0.04), 0 8px 28px rgba(0 0 0 / 0.06)',
    ...theme.applyStyles('dark', {
      borderColor: 'rgba(255 255 255 / 0.08)',
      boxShadow: '0 1px 2px rgba(0 0 0 / 0.4), 0 8px 28px rgba(0 0 0 / 0.35)',
    }),
    [REDUCED_TRANSPARENCY]: {
      backgroundColor: vars(theme).palette.background.paper,
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    },
  };
}

/** Fondo y texto tonales de un color de estado: legibles en claro y en oscuro. */
export function tonal(theme: Theme, tone: Tone, strength = 0.14): CSSObject {
  return {
    backgroundColor: `rgba(${vars(theme).palette[tone].mainChannel} / ${strength})`,
    color: vars(theme).palette[tone].dark,
    ...theme.applyStyles('dark', { color: vars(theme).palette[tone].light }),
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

/** Tema único, claro y oscuro según el sistema. La UI no define colores ni tipografías sueltos: todo sale de aquí. */
export const theme = createTheme(
  {
    cssVariables: { colorSchemeSelector: 'media' },
    colorSchemes: {
      light: {
        palette: {
          primary: { main: '#0071E3', dark: '#0058B0', light: '#4DA3FF' },
          secondary: { main: '#1D1D1F' },
          success: { main: '#34C759', dark: '#1E7B34', light: '#30D158' },
          warning: { main: '#FF9500', dark: '#A35200', light: '#FFB340' },
          error: { main: '#FF3B30', dark: '#C41E15', light: '#FF6961' },
          info: { main: '#007AFF', dark: '#0058B9', light: '#64B5FF' },
          background: { default: '#F5F5F7', paper: '#FFFFFF' },
          text: { primary: '#1D1D1F', secondary: '#6E6E73' },
          divider: 'rgba(60 60 67 / 0.14)',
        },
      },
      dark: {
        palette: {
          primary: { main: '#0A84FF', dark: '#0060DF', light: '#64B5FF' },
          secondary: { main: '#F5F5F7' },
          success: { main: '#30D158', dark: '#248A3D', light: '#5EE07F' },
          warning: { main: '#FF9F0A', dark: '#C77700', light: '#FFC163' },
          error: { main: '#FF453A', dark: '#D70015', light: '#FF7A72' },
          info: { main: '#0A84FF', dark: '#0060DF', light: '#70B7FF' },
          background: { default: '#000000', paper: '#1C1C1E' },
          text: { primary: '#F5F5F7', secondary: '#98989D' },
          divider: 'rgba(84 84 88 / 0.6)',
        },
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: 14,
      h1: { fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15 },
      h2: { fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 },
      h3: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.5 },
      body2: { fontSize: '0.875rem', lineHeight: 1.45 },
      overline: {
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.06em',
        lineHeight: 1.6,
      },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: (theme) => ({
          body: {
            minHeight: '100vh',
            backgroundAttachment: 'fixed',
            // Un velo de color muy tenue para que el vidrio tenga qué difuminar.
            backgroundImage:
              'radial-gradient(1200px 600px at 0% 0%, rgba(0 113 227 / 0.10), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(175 82 222 / 0.08), transparent 60%), radial-gradient(900px 600px at 50% 100%, rgba(52 199 89 / 0.06), transparent 60%)',
            ...theme.applyStyles('dark', {
              backgroundImage:
                'radial-gradient(1200px 600px at 0% 0%, rgba(10 132 255 / 0.18), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(191 90 242 / 0.14), transparent 60%), radial-gradient(900px 600px at 50% 100%, rgba(48 209 88 / 0.08), transparent 60%)',
            }),
            WebkitFontSmoothing: 'antialiased',
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
          root: ({ theme }) => ({ backgroundImage: 'none', ...glass(theme) }),
          rounded: { borderRadius: 16 },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 980,
            paddingInline: 16,
            transition: 'transform 100ms ease-out, background-color 150ms ease',
            '&:active': { transform: 'scale(0.97)' },
          },
          sizeSmall: { paddingInline: 12 },
          outlined: ({ theme }) => ({
            borderColor: vars(theme).palette.divider,
            backgroundColor: `rgba(${vars(theme).palette.background.paperChannel} / 0.6)`,
          }),
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { '&:active': { transform: 'scale(0.94)' } } },
      },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 10,
            backgroundColor: `rgba(${vars(theme).palette.background.paperChannel} / 0.7)`,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: vars(theme).palette.divider },
          }),
        },
      },
      MuiToggleButtonGroup: {
        // Control segmentado tipo iOS; en pantallas chicas se desplaza en lugar de desbordar la página.
        styleOverrides: {
          root: ({ theme }) => ({
            padding: 2,
            gap: 2,
            borderRadius: 10,
            maxWidth: '100%',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            alignSelf: 'flex-start',
            backgroundColor: 'rgba(118 118 128 / 0.12)',
            ...theme.applyStyles('dark', { backgroundColor: 'rgba(118 118 128 / 0.24)' }),
          }),
          grouped: {
            border: 0,
            margin: 0,
            borderRadius: '8px !important',
            borderLeft: '0 !important',
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            flexShrink: 0,
            whiteSpace: 'nowrap',
            paddingBlock: 4,
            paddingInline: 12,
            fontWeight: 500,
            color: vars(theme).palette.text.primary,
            '&.Mui-selected, &.Mui-selected:hover': {
              color: vars(theme).palette.text.primary,
              backgroundColor: vars(theme).palette.background.paper,
              boxShadow: '0 1px 3px rgba(0 0 0 / 0.12), 0 1px 1px rgba(0 0 0 / 0.04)',
              ...theme.applyStyles('dark', { backgroundColor: '#636366' }),
            },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: ({ theme, ownerState }) => ({
            fontWeight: 600,
            borderRadius: 8,
            ...(ownerState.variant !== 'outlined' && isTone(ownerState.color)
              ? tonal(theme, ownerState.color)
              : {}),
            ...(ownerState.variant !== 'outlined' && ownerState.color === 'default'
              ? { backgroundColor: 'rgba(118 118 128 / 0.14)' }
              : {}),
          }),
          outlined: ({ theme, ownerState }) =>
            isTone(ownerState.color)
              ? {
                  borderColor: `rgba(${vars(theme).palette[ownerState.color].mainChannel} / 0.45)`,
                  color: vars(theme).palette[ownerState.color].dark,
                  ...theme.applyStyles('dark', {
                    color: vars(theme).palette[ownerState.color].light,
                  }),
                }
              : {},
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 14, alignItems: 'center' },
          standard: ({ theme, ownerState }) =>
            isTone(ownerState.severity) ? tonal(theme, ownerState.severity, 0.12) : {},
        },
      },
      MuiTable: { defaultProps: { size: 'small' } },
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({ borderColor: vars(theme).palette.divider, paddingBlock: 10 }),
          head: ({ theme }) => ({
            ...theme.typography.overline,
            color: vars(theme).palette.text.secondary,
            whiteSpace: 'nowrap',
          }),
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&:last-child td': { borderBottom: 0 },
            '&.MuiTableRow-hover:hover': {
              backgroundColor: `rgba(${vars(theme).palette.primary.mainChannel} / 0.05)`,
            },
          }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          // En el teléfono el diálogo es una hoja que sube desde abajo, como en iOS.
          container: ({ theme }) => ({
            [theme.breakpoints.down('sm')]: { alignItems: 'flex-end' },
          }),
          paper: ({ theme }) => ({
            ...glass(theme, 0.92),
            borderRadius: 20,
            [theme.breakpoints.down('sm')]: {
              margin: 0,
              width: '100%',
              maxWidth: '100% !important',
              maxHeight: '92dvh',
              borderRadius: '20px 20px 0 0',
              paddingBottom: 'env(safe-area-inset-bottom)',
            },
          }),
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            '&:not(.MuiBackdrop-invisible)': {
              backgroundColor: 'rgba(0 0 0 / 0.28)',
              backdropFilter: 'blur(4px)',
            },
          },
        },
      },
      MuiMenu: {
        styleOverrides: { paper: ({ theme }) => ({ ...glass(theme, 0.88), borderRadius: 14 }) },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { height: 3, borderRadius: 3 } },
      },
      MuiLink: { defaultProps: { underline: 'hover' } },
    },
  },
  esES,
);

/** Alto de la barra inferior del teléfono: lo que flota al pie (acciones, compositor) se pone encima. */
export const MOBILE_NAV_OFFSET = 'calc(64px + env(safe-area-inset-bottom))';

/** Folios, RFC y UUID: monoespaciada del sistema. */
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
