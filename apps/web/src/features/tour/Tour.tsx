import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Portal from '@mui/material/Portal';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useLayoutEffect, useState } from 'react';
import { vars } from '../../app/theme';
import { TOUR_STEPS } from './tour.steps';

const GAP = 16;
const PAD = 4;

function findTarget(anchor?: string): HTMLElement | null {
  return anchor ? document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`) : null;
}

/** Rectángulo del elemento del paso, recalculado al cambiar de paso o de tamaño de ventana. */
function useTargetRect(anchor?: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const measure = () => setRect(findTarget(anchor)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [anchor]);
  return rect;
}

/** Junto al elemento: a su derecha si está arriba (barra lateral), encima si está abajo (barra inferior). */
function placement(rect: DOMRect): SxProps<Theme> {
  const base = { position: 'fixed', m: 0, maxWidth: 'min(360px, calc(100% - 32px))' } as const;
  if (rect.top > window.innerHeight / 2) {
    return {
      ...base,
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: window.innerHeight - rect.top + GAP,
    };
  }
  return { ...base, left: rect.right + GAP, top: Math.max(GAP, rect.top - PAD) };
}

/** Recorrido de bienvenida (spec 012): se monta abierto y avisa con `onClose` al terminar, saltar o pulsar Esc. */
export function Tour(props: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const step = TOUR_STEPS[index] ?? TOUR_STEPS[0];
  const rect = useTargetRect(step?.anchor);
  if (!step) return null;
  const last = index === TOUR_STEPS.length - 1;

  return (
    <>
      {rect && (
        <Portal>
          <Box
            aria-hidden
            data-tour-highlight={step.anchor}
            sx={(theme) => ({
              position: 'fixed',
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              borderRadius: 1,
              outline: `2px solid ${vars(theme).palette.primary.main}`,
              pointerEvents: 'none',
              zIndex: theme.zIndex.modal + 1,
            })}
          />
        </Portal>
      )}
      <Dialog
        open
        onClose={props.onClose}
        aria-labelledby="tour-title"
        hideBackdrop={!!rect}
        transitionDuration={reducedMotion ? 0 : undefined}
        slotProps={{ paper: { sx: rect ? placement(rect) : { maxWidth: 360 } } }}
      >
        <DialogTitle id="tour-title">{step.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {step.body}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.tertiary' }}>
            Paso {index + 1} de {TOUR_STEPS.length}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {!last && <Button onClick={props.onClose}>Saltar</Button>}
            {index > 0 && <Button onClick={() => setIndex(index - 1)}>Atrás</Button>}
            <Button
              variant="contained"
              onClick={last ? props.onClose : () => setIndex(index + 1)}
            >
              {last ? 'Terminar' : 'Siguiente'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </>
  );
}
