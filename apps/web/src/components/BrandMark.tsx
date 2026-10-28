import Box from '@mui/material/Box';

/** Marca de MIMARK: el cuadro con la "M". */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: `${Math.round(size * 0.3)}px`,
        display: 'grid',
        placeItems: 'center',
        color: 'common.white',
        fontWeight: 800,
        fontSize: size * 0.5,
        background: 'linear-gradient(135deg, #0A84FF 0%, #5E5CE6 100%)',
        boxShadow: '0 4px 14px rgba(10 132 255 / 0.35)',
      }}
    >
      M
    </Box>
  );
}
