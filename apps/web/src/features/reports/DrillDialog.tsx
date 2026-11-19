import type { ReportLine } from '@mimark/contracts/reports';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { Money } from '../../components/Money';
import { formatDate } from '../../lib/format';
import { NUMERIC, ReportTable } from './ReportTable';
import { sourceFileUrl, useDrill } from './reports.api';

const PAGE_SIZE = 50;

/**
 * Partidas de un renglón del EDO RES (spec 024, RF-08): subtotal por categoría y cada movimiento con su
 * archivo y fila de origen. El concepto viene de un documento externo: se muestra siempre como texto.
 */
export function DrillDialog(props: {
  line: ReportLine | null;
  companyId: string;
  month: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={props.line !== null} onClose={props.onClose} fullWidth maxWidth="lg">
      {props.line !== null && <Body {...props} line={props.line} />}
    </Dialog>
  );
}

function Body(props: { line: ReportLine; companyId: string; month: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const drill = useDrill(props.line, props.companyId, props.month, page);
  const data = drill.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <DialogTitle>
        {props.line}
        {data && (
          <Typography component="span" sx={{ ml: 2, fontWeight: 400 }}>
            <Money amount={data.amount} currency="MXN" />
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <ErrorAlert error={drill.error} />
          {drill.isFetching && <LinearProgress />}
          {data && data.categories.length > 1 && (
            <ReportTable label="Subtotal por categoría">
              <TableHead>
                <TableRow>
                  <TableCell>Categoría</TableCell>
                  <TableCell sx={NUMERIC}>Movimientos</TableCell>
                  <TableCell sx={NUMERIC}>Subtotal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.categories.map((c) => (
                  <TableRow key={c.code}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell sx={NUMERIC}>{c.count}</TableCell>
                    <TableCell sx={NUMERIC}>
                      <Money amount={c.amount} currency="MXN" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          )}
          {data && (
            <ReportTable label={`Partidas de ${props.line}`}>
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Concepto</TableCell>
                  <TableCell>Kiosko</TableCell>
                  <TableCell>Cuenta</TableCell>
                  <TableCell sx={NUMERIC}>Monto</TableCell>
                  <TableCell>Origen</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(e.date)}</TableCell>
                    <TableCell sx={{ wordBreak: 'break-word' }}>{e.concept}</TableCell>
                    <TableCell>{e.kioskName ?? '—'}</TableCell>
                    <TableCell>{e.accountName ?? '—'}</TableCell>
                    <TableCell sx={NUMERIC}>
                      <Money amount={e.amount} currency="MXN" />
                    </TableCell>
                    <TableCell>
                      {e.uploadId ? (
                        <Link href={sourceFileUrl(e.uploadId)} download>
                          {e.fileName}
                        </Link>
                      ) : (
                        'Captura manual'
                      )}
                      {e.rowNumber !== null && ` · fila ${e.rowNumber}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          )}
          {data?.total === 0 && (
            <Typography sx={{ color: 'text.secondary' }}>
              Este renglón no tiene partidas.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)} color="inherit">
            Anterior
          </Button>
          <Typography>
            Página {page} de {pages}
          </Typography>
          <Button disabled={page >= pages} onClick={() => setPage(page + 1)} color="inherit">
            Siguiente
          </Button>
        </Stack>
        <Button onClick={props.onClose}>Cerrar</Button>
      </DialogActions>
    </>
  );
}
