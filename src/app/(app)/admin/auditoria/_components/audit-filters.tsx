import Link from 'next/link';
import { ACTION_LABEL, ENTITY_LABEL } from '../audit-diff';
import { Button, buttonStyles } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { TextInput } from '@/components/ui/text-input';
import type { AuditAction } from '@/lib/dal/audit';

export type AuditFilterValues = {
  action?: AuditAction;
  entityType?: string;
  actorId?: string;
  /** `YYYY-MM-DD` */
  from?: string;
  /** `YYYY-MM-DD` */
  to?: string;
};

/** Filtros por formulario GET (sin JS): la URL guarda el filtro y se puede compartir. */
export function AuditFilters({
  values,
  people,
  actions,
}: {
  values: AuditFilterValues;
  people: { id: string; name: string }[];
  actions: AuditAction[];
}) {
  const hasFilters = Object.values(values).some(Boolean);
  return (
    <Card>
      <form method="get" action="/admin/auditoria" aria-label="Filtros de auditoría">
        <div className="grid gap-s15 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Acción">
            <Select name="accion" defaultValue={values.action ?? ''}>
              <option value="">Todas</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Elemento">
            <Select name="entidad" defaultValue={values.entityType ?? ''}>
              <option value="">Todos</option>
              {Object.entries(ENTITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Quién">
            <Select name="persona" defaultValue={values.actorId ?? ''}>
              <option value="">Cualquier persona</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Desde">
            <TextInput name="desde" type="date" defaultValue={values.from ?? ''} />
          </FormField>
          <FormField label="Hasta">
            <TextInput name="hasta" type="date" defaultValue={values.to ?? ''} />
          </FormField>
        </div>
        <div className="mt-s15 flex flex-wrap items-center justify-end gap-s10">
          {hasFilters ? (
            <Link
              href="/admin/auditoria"
              className={buttonStyles({ variant: 'secondary', size: 'md' })}
            >
              Quitar filtros
            </Link>
          ) : null}
          <Button type="submit">Filtrar</Button>
        </div>
      </form>
    </Card>
  );
}
