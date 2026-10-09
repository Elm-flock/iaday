import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SwitchProps = Omit<ComponentProps<'input'>, 'type' | 'role' | 'children'> & {
  label: ReactNode;
};

/** Switch pill basado en `<input type="checkbox" role="switch">`. */
export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    <label
      className={cn(
        'inline-flex min-h-10 cursor-pointer items-center gap-s10 text-body text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40',
        className,
      )}
    >
      <span className="relative inline-flex h-6 w-10 shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer h-6 w-10 cursor-[inherit] appearance-none rounded-pill border border-border-strong bg-surface-subtle transition-colors duration-150 ease-out checked:border-primary checked:bg-primary"
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[3px] left-[3px] size-4 rounded-pill bg-ink-muted transition-transform duration-150 ease-out peer-checked:translate-x-4 peer-checked:bg-on-primary"
        />
      </span>
      {label}
    </label>
  );
}
