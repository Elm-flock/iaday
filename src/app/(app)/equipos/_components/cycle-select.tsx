'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';

export type CycleOption = { id: string; label: string };

/** Selector del ciclo para el que se calcula la mezcla de origen. Navega con `?cycleId=`. */
export function CycleSelect({
  options,
  selectedId,
}: {
  options: CycleOption[];
  selectedId: string | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <FormField label="Ciclo" className="w-full max-w-md">
      <Select
        value={selectedId ?? ''}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(() => router.push(next ? `${pathname}?cycleId=${next}` : pathname));
        }}
      >
        <option value="">Sin ciclo</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
