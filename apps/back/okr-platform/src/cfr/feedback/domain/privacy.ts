export interface FeedbackParties {
  fromUserId: string;
  toUserId: string;
}

/**
 * Solo emisor y receptor. SIN bypass por rol: ni ADMIN ni LEADER (por eso la
 * función ni siquiera recibe el rol).
 */
export function canViewFeedback(actorId: string, fb: FeedbackParties): boolean {
  return actorId === fb.fromUserId || actorId === fb.toUserId;
}

/** Solo el autor edita o borra. */
export function canModifyFeedback(actorId: string, fb: FeedbackParties): boolean {
  return actorId === fb.fromUserId;
}
