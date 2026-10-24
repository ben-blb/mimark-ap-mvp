import { createTheme } from '@mui/material/styles';
import { esES } from '@mui/material/locale';

/** Tema único. La UI no define colores ni tipografías sueltos: todo sale de aquí. */
export const theme = createTheme(
  {
    palette: {
      mode: 'light',
      primary: { main: '#2349A8' },
      secondary: { main: '#16212B' },
      background: { default: '#F2F4F1', paper: '#FFFFFF' },
      text: { primary: '#16212B', secondary: '#55626E' },
      divider: '#D0D8D3',
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily:
        'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      h1: { fontSize: '1.6rem', fontWeight: 700 },
      h2: { fontSize: '1.25rem', fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiTable: { defaultProps: { size: 'small' } },
      MuiPaper: { defaultProps: { variant: 'outlined' } },
    },
  },
  esES,
);
