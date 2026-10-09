import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export const toneStyles: Record<AlertTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'border-info bg-info-subtle', icon: 'text-info', Icon: Info },
  success: { box: 'border-success bg-success-subtle', icon: 'text-success', Icon: CircleCheck },
  warning: { box: 'border-warning bg-warning-subtle', icon: 'text-warning', Icon: TriangleAlert },
  danger: { box: 'border-danger bg-danger-subtle', icon: 'text-danger', Icon: CircleAlert },
};

type AlertProps = {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const { box, icon, Icon } = toneStyles[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex gap-s10 rounded-md border p-s15 text-body text-ink', box, className)}
    >
      <Icon
        size={20}
        strokeWidth={1.75}
        aria-hidden="true"
        className={cn('mt-px shrink-0', icon)}
      />
      <div className="flex flex-col gap-s5">
        {title ? <p className="font-bold">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
