import { AccessibleVersionPanel } from './accessible-version-panel';
import { canValidateAdaptation, type AdaptableEntity, type OwnerRef } from '../policy';
import { getAiStatus } from '@/lib/dal/ai';
import { getCurrentUser } from '@/lib/dal/session';

type Props = {
  entityType: AdaptableEntity;
  entityId: string;
  /** Dueño del objetivo (para saber si se ofrece "Validar"). `null` en feedback. */
  owner: OwnerRef | null;
};

/**
 * "Ver en lectura fácil / lenguaje claro" para un objetivo, check-in o feedback.
 *
 * Server Component async: va dentro de un <Suspense> o de una vista ya dinámica. Si la IA está apagada
 * (`GET /ai/status` → enabled=false) o no se puede consultar, no renderiza NADA: la página sigue igual.
 * El estado se consulta una sola vez por render (el DAL deduplica con `cache()` de React).
 */
export async function AccessibleVersion({ entityType, entityId, owner }: Props) {
  const [status, viewer] = await Promise.all([getAiStatus(), getCurrentUser()]);
  if (!status.enabled) return null;
  return (
    <AccessibleVersionPanel
      entityType={entityType}
      entityId={entityId}
      viewerId={viewer.id}
      validation={canValidateAdaptation(viewer, entityType, owner)}
    />
  );
}
