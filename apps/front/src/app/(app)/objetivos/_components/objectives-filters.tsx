'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { OBJECTIVE_STATUS_LABEL } from '../messages';

export type FilterOption = { id: string; label: string };

type Props = {
  cycles: FilterOption[];
  teams: FilterOption[];
  users: FilterOption[];
  cycleId: string | undefined;
  teamId: string | undefined;
  ownerUserId: string | undefined;
  status: string | undefined;
};

/** Filtros de la lista. El estado vive en la URL (`?cycleId=&teamId=&ownerUserId=&status=`): se puede compartir y recargar. */
export function ObjectivesFilters({
  cycles,
  teams,
  users,
  cycleId,
  teamId,
  ownerUserId,
  status,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [pending, startTransition] = useTransition();

  function change(key: string, value: string) {
    const next = new URLSearchParams(current.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <form
      aria-label="Filtros de objetivos"
      className="mb-s20 grid grid-cols-1 gap-s15 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
      onSubmit={(e) => e.preventDefault()}
    >
      <FormField label="Ciclo">
        <Select
          value={cycleId ?? ''}
          disabled={pending}
          onChange={(e) => change('cycleId', e.target.value)}
        >
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Equipo responsable">
        <Select
          value={teamId ?? ''}
          disabled={pending}
          onChange={(e) => change('teamId', e.target.value)}
        >
          <option value="">Todos los equipos</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Persona responsable">
        <Select
          value={ownerUserId ?? ''}
          disabled={pending}
          onChange={(e) => change('ownerUserId', e.target.value)}
        >
          <option value="">Todas las personas</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Estado">
        <Select
          value={status ?? ''}
          disabled={pending}
          onChange={(e) => change('status', e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(OBJECTIVE_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FormField>
    </form>
  );
}
