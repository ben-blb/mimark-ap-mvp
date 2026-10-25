import { CURRENCIES } from '@mimark/contracts/common';
import { DOC_TYPES } from '@mimark/contracts/extraction';
import {
  CorrectFieldsInput,
  type PayableDto,
  type PayableFields,
} from '@mimark/contracts/payables';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { ApiError } from '../../lib/api-client';
import { DOC_TYPE_LABELS, FIELD_LABELS } from '../../lib/labels';

type Key = keyof PayableFields;

const FIELDS: { key: Key; label: string; type?: 'date' | 'select-currency' | 'select-doc' }[] = [
  { key: 'docType', label: 'Tipo de documento', type: 'select-doc' },
  { key: 'supplierName', label: FIELD_LABELS.supplierName },
  { key: 'supplierTaxId', label: FIELD_LABELS.supplierTaxId },
  { key: 'invoiceNumber', label: FIELD_LABELS.invoiceNumber },
  { key: 'issueDate', label: FIELD_LABELS.issueDate, type: 'date' },
  { key: 'poNumber', label: FIELD_LABELS.purchaseOrderNumber },
  { key: 'subtotal', label: FIELD_LABELS.subtotal },
  { key: 'taxes', label: FIELD_LABELS.taxes },
  { key: 'total', label: FIELD_LABELS.total },
  { key: 'currency', label: FIELD_LABELS.currency, type: 'select-currency' },
  { key: 'taxUuid', label: FIELD_LABELS.taxUuid },
];

/** Campo del expediente → nombre que usa la IA para marcarlo como dudoso. */
const UNCERTAIN_NAME: Partial<Record<Key, string>> = { poNumber: 'purchaseOrderNumber' };

/**
 * Formulario puro (sin API) para corregir los campos vigentes. Solo envía lo que la persona cambió, más los
 * campos dudosos (al revisarlos y guardar, una persona los da por vistos).
 */
export function CorrectFieldsForm(props: {
  payable: PayableDto;
  pending: boolean;
  error: unknown;
  onSubmit: (input: CorrectFieldsInput) => void;
  onCancel: () => void;
}) {
  const { payable } = props;
  const initial = (key: Key) => payable.fields[key] ?? '';
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, initial(f.key)])),
  );
  const [reclassify, setReclassify] = useState(payable.isApDocument === false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const serverErrors = props.error instanceof ApiError ? props.error.fieldErrors : {};
  const errors = Object.keys(clientErrors).length > 0 ? clientErrors : serverErrors;
  const generalError =
    props.error instanceof ApiError && props.error.code === 'VALIDATION' ? null : props.error;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload: Record<string, string | boolean | null> = {};
    for (const { key } of FIELDS) {
      const uncertain = payable.uncertainFields.some((f) => f === (UNCERTAIN_NAME[key] ?? key));
      if (values[key] !== initial(key) || uncertain) payload[key] = values[key]?.trim() || null;
    }
    if (reclassify) payload.isApDocument = true;

    const parsed = CorrectFieldsInput.safeParse(payload);
    if (!parsed.success) {
      setClientErrors(
        Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || '_', i.message])),
      );
      return;
    }
    setClientErrors({});
    props.onSubmit(parsed.data);
  }

  return (
    <Stack component="form" spacing={1} noValidate onSubmit={submit}>
      {payable.isApDocument === false && (
        <FormControlLabel
          control={
            <Checkbox checked={reclassify} onChange={(e) => setReclassify(e.target.checked)} />
          }
          label="Reclasificar como documento de compra"
        />
      )}
      {FIELDS.map(({ key, label, type }) => (
        <TextField
          key={key}
          label={label}
          type={type === 'date' ? 'date' : 'text'}
          select={type === 'select-currency' || type === 'select-doc'}
          value={values[key]}
          onChange={(e) => setValues((current) => ({ ...current, [key]: e.target.value }))}
          error={!!errors[key]}
          helperText={errors[key] ?? ' '}
          slotProps={{
            select: { native: true },
            inputLabel: { shrink: type === 'date' || type?.startsWith('select') || undefined },
          }}
        >
          {type === 'select-currency' && (
            <>
              <option value="" />
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </>
          )}
          {type === 'select-doc' && (
            <>
              <option value="" />
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {DOC_TYPE_LABELS[d]}
                </option>
              ))}
            </>
          )}
        </TextField>
      ))}
      <ErrorAlert error={generalError} />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', pt: 1 }}>
        <Button onClick={props.onCancel}>Cancelar</Button>
        <Button type="submit" variant="contained" loading={props.pending}>
          Guardar
        </Button>
      </Stack>
    </Stack>
  );
}
