import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { MONO } from '../../app/theme';

/** Muestra la contraseña temporal una sola vez, como texto (AC-013-21). */
export function TemporaryPasswordDialog(props: {
  name: string;
  password: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="xs">
      <DialogTitle>Contraseña temporal</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Entrégasela a {props.name}. No volverá a mostrarse y tendrá que cambiarla al entrar.
        </DialogContentText>
        <Typography sx={{ fontFamily: MONO, fontSize: '1.125rem', mt: 2, userSelect: 'all' }}>
          {props.password}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={props.onClose}>
          Listo
        </Button>
      </DialogActions>
    </Dialog>
  );
}
