import { cn } from '@/lib/cn';

type AvatarProps = {
  /** Nombre completo: se usa para las iniciales y como texto alternativo. */
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizes = { sm: 'size-6 text-caption', md: 'size-8 text-body-sm', lg: 'size-10 text-body' };

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-pill bg-primary-subtle font-normal text-ink select-none',
        sizes[size],
        className,
      )}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
