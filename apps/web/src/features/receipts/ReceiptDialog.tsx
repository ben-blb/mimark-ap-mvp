import { ReceiptInput } from '@mimark/contracts/purchase-orders';
import type { ReceiptOrderDto } from '@mimark/contracts/receipts';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { useZodForm } from '../../lib/use-zod-form';
import { localToday } from '../purchase-orders/today';
import { useConfirmReceipt } from './receipts.api';

const VALID = /^\d{1,9}(\.\d{1,3})?$/;
/** Redondea a 3 decimales para que 0.1 + 0.2 no deje basura de punto flotante. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Confirmar la llegada de una OC (spec 018). Cada partida trae lo pedido precargado; Almacén corrige lo que no
 * llegó completo. Con diferencias las notas son obligatorias. Sin partidas (OC anteriores) solo se pide fecha
 * y notas. El botón queda fijo abajo con el contador.
 */
export function ReceiptDialog({ order, onClose }: { order: ReceiptOrderDto; onClose: () => void }) {
  const confirm = useConfirmReceipt(order.id);
  const error = confirm.error;
  const fullScreen = useMediaQuery('(max-width:599.95px)');
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.lines.map((l) => [l.id, l.quantity])),
  );
  const [notesMissing, setNotesMissing] = useState(false);
  const form = useZodForm(
    ReceiptInput,
    { receivedOn: localToday(), notes: '' },
    error instanceof ApiError ? error.fieldErrors : {},
  );
  const generalError = error instanceof ApiError && error.code !== 'VALIDATION' ? error : null;

  const total = order.lines.length;
  const received = (id: string) => quantities[id] ?? '';
  const isValid = (line: ReceiptOrderDto['lines'][number]) => {
    const value = received(line.id);
    return VALID.test(value) && Number(value) <= Number(line.quantity);
  };
  const missing = (line: ReceiptOrderDto['lines'][number]) =>
    isValid(line) ? round3(Number(line.quantity) - Number(received(line.id))) : 0;
  const completeCount = order.lines.filter((l) => isValid(l) && missing(l) === 0).length;
  const hasDifferences = order.lines.some((l) => missing(l) > 0);
  const allValid = order.lines.every(isValid);
  const nothingArrived = total > 0 && order.lines.every((l) => Number(received(l.id)) === 0);
  const notes = form.field('notes');
  const set = (id: string, value: string) => setQuantities((q) => ({ ...q, [id]: value }));
  const step = (line: ReceiptOrderDto['lines'][number], delta: number) => {
    const current = VALID.test(received(line.id)) ? Number(received(line.id)) : 0;
    set(line.id, String(Math.min(Number(line.quantity), Math.max(0, round3(current + delta)))));
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle>Confirmar recepción de {order.number}</DialogTitle>
      <Stack
        component="form"
        noValidate
        sx={{ flex: 1, minHeight: 0 }}
        onSubmit={form.handleSubmit((values) => {
          const trimmed = values.notes?.trim() ?? '';
          if (hasDifferences && !trimmed) {
            setNotesMissing(true);
            return;
          }
          setNotesMissing(false);
          confirm.mutate(
            {
              ...values,
              notes: trimmed || undefined,
              lines: order.lines.map((l) => ({ lineId: l.id, receivedQuantity: received(l.id) })),
            },
            { onSuccess: onClose },
          );
        })}
      >
        <DialogContent sx={{ pt: '8px !important' }}>
          <Stack spacing={1}>
            <TextField
              label="Fecha de recepción"
              type="date"
              slotProps={{
                htmlInput: { min: order.issuedOn, max: localToday() },
                inputLabel: { shrink: true },
              }}
              {...form.field('receivedOn')}
            />
            <TextField
              label={hasDifferences ? 'Notas' : 'Notas (opcional)'}
              required={hasDifferences}
              multiline
              minRows={2}
              {...notes}
              {...(hasDifferences &&
                !notes.error && {
                  helperText: notesMissing ? 'Explica qué faltó' : 'Explica qué faltó',
                  error: notesMissing,
                })}
            />
            {total > 0 && (
              <>
                <Stack
                  direction="row"
                  sx={{ alignItems: 'center', justifyContent: 'flex-end', pt: 1 }}
                >
                  <Button
                    size="small"
                    onClick={() =>
                      setQuantities(Object.fromEntries(order.lines.map((l) => [l.id, l.quantity])))
                    }
                    disabled={!hasDifferences && allValid}
                  >
                    Todo llegó completo
                  </Button>
                </Stack>
                <List
                  aria-label="Partidas por recibir"
                  disablePadding
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
                >
                  {order.lines.map((line) => {
                    const short = missing(line);
                    return (
                      <ListItem
                        key={line.id}
                        sx={{ borderBottom: 1, borderColor: 'divider', alignItems: 'flex-start' }}
                      >
                        <Stack spacing={0.5} sx={{ width: '100%' }}>
                          <Typography>{line.description}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {line.sku ? `${line.sku} · ` : ''}Pedido {line.quantity} {line.unit}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <IconButton
                              aria-label={`Menos: ${line.description}`}
                              onClick={() => step(line, -1)}
                              sx={{ width: 48, height: 48 }}
                            >
                              <RemoveIcon />
                            </IconButton>
                            <TextField
                              size="small"
                              label="Recibido"
                              value={received(line.id)}
                              onChange={(e) => set(line.id, e.target.value.trim())}
                              error={!isValid(line)}
                              slotProps={{
                                htmlInput: {
                                  inputMode: 'decimal',
                                  'aria-label': `Recibido: ${line.description}`,
                                  style: { textAlign: 'center' },
                                },
                              }}
                              sx={{ width: 110 }}
                            />
                            <IconButton
                              aria-label={`Más: ${line.description}`}
                              onClick={() => step(line, 1)}
                              sx={{ width: 48, height: 48 }}
                            >
                              <AddIcon />
                            </IconButton>
                            {short > 0 && (
                              <Typography
                                variant="body2"
                                color="warning.dark"
                                sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}
                              >
                                Faltan {short}
                              </Typography>
                            )}
                            {!isValid(line) && (
                              <Typography variant="caption" color="error">
                                Máximo {line.quantity}
                              </Typography>
                            )}
                          </Stack>
                        </Stack>
                      </ListItem>
                    );
                  })}
                </List>
                {form.errors.lines && (
                  <Typography variant="caption" color="error">
                    {form.errors.lines}
                  </Typography>
                )}
              </>
            )}
            <ErrorAlert error={generalError} />
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            position: 'sticky',
            bottom: 0,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            px: 3,
            py: 1.5,
            flexWrap: 'wrap',
            rowGap: 1,
          }}
        >
          {total > 0 && (
            <Typography
              variant="subtitle2"
              aria-live="polite"
              sx={{ mr: 'auto', flexBasis: { xs: '100%', sm: 'auto' } }}
            >
              {completeCount} de {total} completas
            </Typography>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            type="submit"
            variant="contained"
            loading={confirm.isPending}
            disabled={!allValid || nothingArrived}
          >
            {hasDifferences ? 'Confirmar con diferencias' : 'Confirmar recepción'}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
