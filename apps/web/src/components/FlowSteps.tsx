import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export interface FlowStep {
  label: string;
  /** Texto corto bajo el paso (una fecha); solo se muestra en los pasos cumplidos. */
  detail?: string | undefined;
  done: boolean;
  /** El paso en el que está el proceso: se resalta y lleva `aria-current="step"`. */
  current?: boolean;
  /** Texto que reemplaza a la etiqueta en el paso actual (la etapa). */
  currentText?: string | undefined;
}

/** Barra de pasos: horizontal desde `sm`, vertical abajo. Solo presentación. */
export function FlowSteps(props: { steps: FlowStep[]; label: string }) {
  return (
    <Box
      component="ol"
      aria-label={props.label}
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1.5, sm: 1 },
        listStyle: 'none',
        p: 0,
        m: 0,
      }}
    >
      {props.steps.map((step, i) => (
        <Box
          component="li"
          key={step.label}
          aria-current={step.current ? 'step' : undefined}
          sx={{
            flex: { sm: 1 },
            display: 'flex',
            flexDirection: { xs: 'row', sm: 'column' },
            alignItems: { xs: 'center', sm: 'flex-start' },
            gap: { xs: 1.5, sm: 0.75 },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              width: { sm: '100%' },
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: 2,
                borderColor: step.done || step.current ? 'primary.main' : 'divider',
                bgcolor: step.done ? 'primary.main' : 'transparent',
                color: step.done ? 'primary.contrastText' : 'text.secondary',
              }}
            >
              {step.done ? '✓' : i + 1}
            </Box>
            <Box
              aria-hidden
              sx={{
                display: { xs: 'none', sm: i === props.steps.length - 1 ? 'none' : 'block' },
                flex: 1,
                height: 2,
                bgcolor: step.done ? 'primary.main' : 'divider',
              }}
            />
          </Box>
          <Box>
            <Typography
              variant="body2"
              sx={{
                fontWeight: step.current ? 700 : 500,
                color: step.current ? 'primary.main' : 'text.primary',
              }}
            >
              {step.current && step.currentText ? step.currentText : step.label}
            </Typography>
            {step.done && step.detail && (
              <Typography variant="caption" sx={{ color: 'text.tertiary' }}>
                {step.detail}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
