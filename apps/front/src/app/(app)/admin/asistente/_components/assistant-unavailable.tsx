import { ASSISTANT_COPY } from '../messages';
import { Alert } from '@/components/ui/alert';

/** Aviso NO bloqueante: el asistente es accesorio, el resto de la plataforma sigue igual. */
export function AssistantUnavailable({
  message = ASSISTANT_COPY.unavailable,
}: {
  message?: string;
}) {
  return (
    <Alert tone="info" title="El asistente no está disponible por ahora">
      {message}
    </Alert>
  );
}
