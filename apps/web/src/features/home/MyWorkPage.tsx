import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { useCan } from '../session/session.api';
import { type WorkBlock, type WorkRow, useMyWork } from './home.api';

const MAX_ROWS = 5;

function Row({ row }: { row: WorkRow }) {
  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-child': { border: 0 },
      }}
    >
      <Link
        component={RouterLink}
        to={row.to}
        underline="none"
        color="inherit"
        sx={{ display: 'block', py: 1.25, '&:hover': { color: 'primary.main' } }}
      >
        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
          {row.title}
        </Typography>
        <Typography variant="caption" noWrap component="div" sx={{ color: 'text.tertiary' }}>
          {row.detail}
        </Typography>
      </Link>
    </Box>
  );
}

function Block(props: { block: WorkBlock; rows: WorkRow[] | undefined; error: Error | null }) {
  const { block, rows } = props;
  const headingId = `work-${block.key}`;
  return (
    <Box component="section" aria-labelledby={headingId}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <Typography id={headingId} variant="h2" sx={{ fontSize: '1rem' }}>
          {block.title}
          {rows && (
            <Typography
              component="span"
              variant="body2"
              sx={{ ml: 1, color: 'text.secondary' }}
              aria-label={`${rows.length} pendientes`}
            >
              {rows.length}
            </Typography>
          )}
        </Typography>
        {rows && rows.length > 0 && (
          <Link component={RouterLink} to={block.seeAll} variant="body2">
            Ver todas
            <Box component="span" sx={visuallyHidden}>
              {' '}
              ({block.title})
            </Box>
          </Link>
        )}
      </Stack>
      <ErrorAlert error={props.error} />
      {!rows && !props.error && <Skeleton variant="text" width={160} />}
      {rows?.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
          Nada pendiente
        </Typography>
      )}
      {rows && rows.length > 0 && (
        <Box component="ul" sx={{ p: 0, m: 0 }}>
          {rows.slice(0, MAX_ROWS).map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </Box>
      )}
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

/** Inicio de quien tiene bandeja (spec 017): lo que le toca hacer, por tipo de pendiente. */
export function MyWorkPage() {
  const work = useMyWork(useCan());
  const allLoaded = work.every(({ query }) => query.data);
  const allEmpty = allLoaded && work.every(({ query }) => query.data?.length === 0);

  return (
    <>
      <PageHeader title="Mi trabajo" />
      {allEmpty && (
        <Typography sx={{ mb: 3 }} role="status">
          Estás al día
        </Typography>
      )}
      <Stack spacing={4}>
        {work.map(({ block, query }) => (
          <Block key={block.key} block={block} rows={query.data} error={query.error} />
        ))}
      </Stack>
    </>
  );
}
