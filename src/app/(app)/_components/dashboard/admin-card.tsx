import { CalendarRange, Shield, Users } from 'lucide-react';
import NextLink from 'next/link';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/format';

type ActiveCycle = { name: string; startDate: string; endDate: string };

const LINKS = [
  { href: '/ciclos', label: 'Ciclos', Icon: CalendarRange },
  { href: '/equipos', label: 'Equipos', Icon: Users },
  { href: '/admin/usuarios', label: 'Usuarios', Icon: Shield },
] as const;

/** Administración: estado del ciclo activo y accesos rápidos (enlaces secundarios, no acciones primarias). */
export function AdminCard({ cycle }: { cycle: ActiveCycle | undefined }) {
  return (
    <Card title="Gestión" aria-label="Gestión">
      <div className="mb-s15 flex flex-wrap items-center gap-s10">
        {cycle ? (
          <>
            <StatusBadge tone="success">Ciclo activo</StatusBadge>
            <span className="text-body text-ink">
              {cycle.name} · {formatDate(cycle.startDate)}–{formatDate(cycle.endDate)}
            </span>
          </>
        ) : (
          <>
            <StatusBadge tone="warning">Sin ciclo activo</StatusBadge>
            <span className="text-body-sm text-ink-muted">
              Activá un ciclo desde Ciclos para que el equipo cargue objetivos.
            </span>
          </>
        )}
      </div>
      <nav aria-label="Accesos de administración">
        <ul className="flex flex-wrap gap-s10">
          {LINKS.map(({ href, label, Icon }) => (
            <li key={href}>
              <NextLink
                href={href}
                className="inline-flex h-10 items-center gap-s10 rounded-pill border border-border-strong px-s20 text-button-sm text-ink transition-colors duration-150 hover:bg-surface-subtle"
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </NextLink>
            </li>
          ))}
        </ul>
      </nav>
    </Card>
  );
}
