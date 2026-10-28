import type { CssVarsTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { glass, theme } from './theme';

const withVars = theme as typeof theme & CssVarsTheme;

describe('theme', () => {
  it('AC-009-01 trae esquema claro y oscuro y sigue la preferencia del sistema', () => {
    expect(Object.keys(withVars.colorSchemes)).toEqual(expect.arrayContaining(['light', 'dark']));
    expect(withVars.colorSchemes.dark?.palette.background.default).toBe('#000000');
    const sheets = withVars.generateStyleSheets() as Record<string, unknown>[];
    expect(sheets.map((sheet) => Object.keys(sheet)[0])).toContain(
      '@media (prefers-color-scheme: dark)',
    );
  });

  it('AC-009-01 el vidrio se vuelve sólido con transparencia reducida', () => {
    const styles = glass(theme);
    expect(styles.backdropFilter).toContain('blur');
    expect(styles['@media (prefers-reduced-transparency: reduce)']).toMatchObject({
      backdropFilter: 'none',
    });
  });

  it('AC-009-01 quita las transiciones con movimiento reducido', () => {
    const overrides = theme.components?.MuiCssBaseline?.styleOverrides;
    const css = typeof overrides === 'function' ? overrides(theme) : overrides;
    expect(JSON.stringify(css)).toContain('prefers-reduced-motion: reduce');
  });
});
