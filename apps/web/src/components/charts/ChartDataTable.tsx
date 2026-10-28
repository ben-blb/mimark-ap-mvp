import Box from '@mui/material/Box';

/**
 * Los datos de una gráfica como tabla, solo para lectores de pantalla (AC-009-03): la gráfica se marca
 * `aria-hidden` y esta tabla dice lo mismo en texto.
 */
export function ChartDataTable(props: { caption: string; columns: string[]; rows: string[][] }) {
  return (
    <Box
      component="table"
      sx={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        clip: 'rect(0 0 0 0)',
        whiteSpace: 'nowrap',
        border: 0,
        p: 0,
        margin: '-1px',
      }}
    >
      <caption>{props.caption}</caption>
      <thead>
        <tr>
          {props.columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.join('|')}>
            {row.map((cell, i) => (
              <td key={i}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </Box>
  );
}
