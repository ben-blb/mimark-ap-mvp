import type { MoneyByCurrency } from '@mimark/contracts/dashboard';
import Stack from '@mui/material/Stack';
import Typography, { type TypographyProps } from '@mui/material/Typography';
import { formatMoney } from '../lib/format';

/** Monedas con importe; si ambas están en cero se muestra el cero en MXN. MXN y USD nunca se suman. */
export function currenciesWithAmount(amount: MoneyByCurrency) {
  const shown = (['MXN', 'USD'] as const).filter((c) => Number(amount[c]) > 0);
  return shown.length > 0 ? shown : (['MXN'] as const);
}

/** Cada moneda en su línea. */
export function Amounts(props: { amount: MoneyByCurrency; variant?: TypographyProps['variant'] }) {
  return (
    <Stack>
      {currenciesWithAmount(props.amount).map((currency) => (
        <Typography
          key={currency}
          variant={props.variant ?? 'h3'}
          component="p"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatMoney(props.amount[currency], currency)}
        </Typography>
      ))}
    </Stack>
  );
}
