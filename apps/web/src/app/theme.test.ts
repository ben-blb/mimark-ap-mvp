import type { CssVarsTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';
import { surface, theme } from './theme';

const withVars = theme as typeof theme & CssVarsTheme;

describe('theme', () => {
  it('AC-009-01 AC-010-01 trae esquema claro y oscuro y sigue la preferencia del sistema', () => {
    expect(Object.keys(withVars.colorSchemes)).toEqual(expect.arrayContaining(['light', 'dark']));
    expect(withVars.colorSchemes.dark?.palette.background.default).toBe('#131211');
    expect(withVars.colorSchemes.light?.palette.background.default).toBe('#F7F5F0');
    const sheets = withVars.generateStyleSheets() as Record<string, unknown>[];
    expect(sheets.map((sheet) => Object.keys(sheet)[0])).toContain(
      '@media (prefers-color-scheme: dark)',
    );
  });

  it('AC-010-01 un solo acento que no es el azul del sistema, IBM Plex y radios 6/8', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const primary = withVars.colorSchemes[scheme]?.palette.primary.main ?? '';
      expect(primary).not.toMatch(/0A84FF|007AFF|0071E3/i);
    }
    expect(theme.typography.fontFamily).toMatch(/^"IBM Plex Sans"/);
    expect(theme.shape.borderRadius).toBe(6);
  });

  it('AC-010-01 las superficies son planas: sin blur, transparencia ni gradientes', () => {
    const css = JSON.stringify([surface(theme), surface(theme, 2), theme.components]);
    expect(css).not.toMatch(/blur\(|backdropFilter|gradient\(/i);
  });

  it('AC-009-01 AC-010-01 quita las transiciones con movimiento reducido', () => {
    const overrides = theme.components?.MuiCssBaseline?.styleOverrides;
    const css = typeof overrides === 'function' ? overrides(theme) : overrides;
    expect(JSON.stringify(css)).toContain('prefers-reduced-motion: reduce');
  });
});
