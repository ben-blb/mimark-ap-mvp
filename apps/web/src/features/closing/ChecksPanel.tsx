import type { CheckDto, CheckStatus } from '@mimark/contracts/closing-review';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Money } from '../../components/Money';
import { StatusDot, type DotTone } from '../../components/StatusDot';
import { CHECK_STATUS_LABELS } from '../../lib/labels';

export const CHECK_TONES: Record<CheckStatus, DotTone> = {
  ok: 'success',
  warning: 'warning',
  error: 'error',
};

const isMoney = (value: string) => /^-?\d+\.\d{2}$/.test(value);
const Value = ({ value }: { value: string }) =>
  isMoney(value) ? <Money amount={value} currency="MXN" /> : <>{value}</>;

/** Cuadres del cierre con su semáforo: estado en texto y punto de color, nunca solo color (AC-023-18). */
export function ChecksPanel({ checks }: { checks: CheckDto[] }) {
  return (
    <Stack component="ul" aria-label="Cuadres del cierre" sx={{ p: 0, m: 0 }}>
      {checks.map((check) => (
        <Stack
          key={check.id}
          component="li"
          spacing={0.5}
          sx={{ listStyle: 'none', py: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 500 }}>{check.title}</Typography>
            <StatusDot tone={CHECK_TONES[check.status]}>
              {CHECK_STATUS_LABELS[check.status]}
            </StatusDot>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {check.message}
          </Typography>
          <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="body2">
              Calculado: <Value value={check.valueA} />
            </Typography>
            <Typography variant="body2">
              Esperado: <Value value={check.valueB} />
            </Typography>
            <Typography variant="body2">
              Diferencia: <Value value={check.difference} />
            </Typography>
            {check.entryIds.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                {check.entryIds.length} movimiento(s) involucrados
              </Typography>
            )}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
