import { Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Inicio" description="Objetivos, check-ins y CFR del equipo de Flock IT." />
      <EmptyState
        icon={<Target size={32} strokeWidth={1.75} aria-hidden="true" />}
        title="Todavía no hay nada para mostrar"
        description="Cuando estén disponibles los objetivos y los check-ins, vas a ver acá tu avance y lo que tenés pendiente."
      />
    </>
  );
}
