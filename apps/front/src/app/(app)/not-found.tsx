import type { Metadata } from 'next';
import { NotFoundView } from '@/components/not-found-view';

export const metadata: Metadata = { title: 'Página no encontrada' };

/** 404 dentro del shell autenticado (`notFound()` de las páginas del grupo `(app)`). */
export default function AppNotFound() {
  return <NotFoundView />;
}
