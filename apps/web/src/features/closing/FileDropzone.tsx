import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { tonal } from '../../app/theme';

/** Zona para soltar o elegir un archivo. Quien la usa valida el tipo y el tamaño en `onPick`. */
export function FileDropzone(props: {
  accept: string;
  hint: string;
  pending: boolean;
  blocked: boolean;
  onPick: (file: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const { blocked, pending } = props;
  return (
    <Box
      component="label"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!pending) props.onPick(e.dataTransfer.files[0] ?? null);
      }}
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        p: 2.5,
        borderRadius: '8px',
        border: '1.5px dashed',
        borderColor: dragging ? 'primary.main' : 'divider',
        textAlign: 'center',
        cursor: blocked || pending ? 'default' : 'pointer',
        opacity: blocked ? 0.6 : 1,
        ...(dragging ? tonal(theme, 'primary', 0.06) : {}),
        '&:hover': { borderColor: 'primary.main' },
        '&:focus-within': { borderColor: 'primary.main' },
      })}
    >
      <CloudUploadOutlined aria-hidden sx={{ fontSize: 28, color: 'primary.main' }} />
      <Typography sx={{ fontWeight: 600 }}>
        {pending ? 'Leyendo el archivo…' : 'Arrastra el archivo aquí'}
      </Typography>
      <Typography variant="body2" color="primary">
        {props.hint}
      </Typography>
      <input
        hidden
        type="file"
        aria-label="Archivo"
        accept={props.accept}
        disabled={blocked || pending}
        onChange={(e) => {
          props.onPick(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
    </Box>
  );
}
