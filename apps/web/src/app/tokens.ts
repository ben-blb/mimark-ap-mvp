import type { ColorSystemOptions } from '@mui/material/styles';

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

/**
 * Tokens de color de DESIGN.md: "papel oscuro" (referencia) y "papel claro". Neutros cálidos, un solo acento
 * (verde tinta) y semánticos desaturados. Contraste AA verificado en DESIGN.md.
 */
export const COLOR_SCHEMES: Record<'dark' | 'light', ColorSystemOptions> = {
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
};
