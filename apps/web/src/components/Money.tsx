import type { MoneyByCurrency } from '@mimark/contracts/dashboard';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import { TABULAR } from '../app/theme';
import { formatAmount } from '../lib/format';

/**
 * Monto con cifras tabulares y la moneda como sufijo pequeño (DESIGN.md). `cents={false}` en resúmenes.
 * Se lee completo ("$28,536 MXN") para lectores de pantalla y para buscarlo en pruebas.
 */
export function Money(props: {
  amount: string;
  currency: string;
  cents?: boolean;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box component="span" sx={[{ ...TABULAR, whiteSpace: 'nowrap' }, ...[props.sx ?? []].flat()]}>
      {formatAmount(props.amount, props.cents ?? true)}
      <Box
        component="span"
        sx={{ fontSize: '0.75rem', color: 'text.tertiary', ml: 0.5, fontWeight: 400 }}
      >
        {props.currency}
      </Box>
    </Box>
  );
}

/** Monedas con importe; si ambas están en cero se muestra el cero en MXN. MXN y USD nunca se suman. */
export function currenciesWithAmount(amount: MoneyByCurrency) {
  const shown = (['MXN', 'USD'] as const).filter((c) => Number(amount[c]) > 0);
  return shown.length > 0 ? shown : (['MXN'] as const);
}
