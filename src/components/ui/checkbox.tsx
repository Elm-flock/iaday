import { Check } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type CheckboxProps = Omit<ComponentProps<'input'>, 'type' | 'children'> & {
  label: ReactNode;
};

/** Checkbox nativo con estilo (funciona en formularios de servidor). */
export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        'inline-flex min-h-10 cursor-pointer items-center gap-s10 text-body text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40',
        className,
      )}
    >
      <span className="relative inline-flex size-5 shrink-0">
        <input
          type="checkbox"
          className="peer size-5 cursor-[inherit] appearance-none rounded-sm border border-border-strong bg-surface transition-colors duration-150 ease-out checked:border-primary checked:bg-primary"
          {...props}
        />
        <Check
          size={14}
          strokeWidth={3}
          aria-hidden="true"
          className="pointer-events-none absolute top-[3px] left-[3px] text-on-primary opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label}
    </label>
  );
}
