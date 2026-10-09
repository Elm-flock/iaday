import { SearchX } from 'lucide-react';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import Link from 'next/link';

/** Contenido del 404 en español, compartido por `app/not-found.tsx` y `app/(app)/not-found.tsx`. */
export function NotFoundView() {
  return (
    <EmptyState
      icon={<SearchX size={32} strokeWidth={1.75} aria-hidden />}
      title="No encontramos esta página"
      description="Puede que no exista o que no tengas acceso."
      action={
        <Link href="/" className={buttonStyles({ variant: 'primary' })}>
          Volvé al inicio
        </Link>
      }
    />
  );
}
