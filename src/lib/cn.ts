import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Sin esto, tailwind-merge confunde `text-button-sm` (tamaño) con un color y descarta `text-on-primary`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'body',
        'body-sm',
        'caption',
        'button',
        'button-sm',
        'heading-1',
        'heading-2',
        'heading-3',
        'display',
      ],
      tracking: ['heading', 'display'],
      radius: ['pill'],
      shadow: ['overlay'],
      spacing: ['s5', 's10', 's15', 's20', 's30', 's40', 's60'],
    },
  },
});

/** Une clases condicionales y resuelve conflictos de Tailwind (la última gana). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
