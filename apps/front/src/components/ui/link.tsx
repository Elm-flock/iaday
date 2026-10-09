import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type LinkProps = ComponentProps<typeof NextLink>;

/** Link de texto. Color `primary-text` (nunca el violeta de marca crudo sobre claro). */
export function Link({ className, ...props }: LinkProps) {
  return (
    <NextLink
      className={cn(
        'rounded-sm text-primary-text underline underline-offset-2 transition-colors duration-150 ease-out hover:text-primary-hover',
        className,
      )}
      {...props}
    />
  );
}
