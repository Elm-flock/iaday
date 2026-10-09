import type { Feedback } from '@/lib/dal/feedback';

type Parties = Pick<Feedback, 'fromUserId' | 'toUserId'>;

/** Rol de quien mira en este feedback. El back ya garantiza que solo llegan los propios. */
export function feedbackRole(viewerId: string, feedback: Parties): 'author' | 'receiver' | null {
  if (feedback.fromUserId === viewerId) return 'author';
  if (feedback.toUserId === viewerId) return 'receiver';
  return null;
}

/** Sin leer: lo recibí y todavía no lo abrí. Lo enviado nunca se muestra como "sin leer" para mí. */
export function isUnread(viewerId: string, feedback: Parties & Pick<Feedback, 'readAt'>): boolean {
  return feedback.toUserId === viewerId && feedback.readAt === null;
}

/** Espejo de `canModifyFeedback` del back: edita y borra solo el autor. */
export function canModifyFeedback(viewerId: string, feedback: Parties): boolean {
  return feedback.fromUserId === viewerId;
}

/** Primeras palabras para la lista (sin cortar a la mitad una palabra cuando se puede). */
export function excerpt(content: string, max = 140): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
