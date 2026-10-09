import { cn } from '@/lib/cn';

export type Environment = 'DEV' | 'TEST' | 'PROD';

const styles: Record<Environment, string> = {
  DEV: 'border-info text-info bg-info-subtle',
  TEST: 'border-warning text-warning bg-warning-subtle',
  PROD: 'border-danger text-danger bg-danger-subtle',
};

/** Ambiente siempre visible. La sigla en mayúsculas es el indicador, no solo el color. */
export function EnvBadge({ env, className }: { env: Environment; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-sm border px-s10 text-caption font-bold tracking-wide',
        styles[env],
        className,
      )}
    >
      {env}
    </span>
  );
}
