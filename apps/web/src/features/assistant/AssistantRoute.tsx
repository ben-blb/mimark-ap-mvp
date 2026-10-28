import { useLocation, useParams } from 'react-router';
import { AssistantPage } from './AssistantPage';

/** Ruta `/asistente/:id?`: cambiar de conversación (o empezar una nueva) reinicia el estado de la página. */
export function AssistantRoute() {
  const { id } = useParams();
  const fresh = (useLocation().state as { fresh?: number } | null)?.fresh;
  return <AssistantPage key={`${id ?? 'new'}-${fresh ?? ''}`} openId={id} />;
}
