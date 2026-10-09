import { Award, CalendarRange, Home, MessageSquare, RefreshCw, Target, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Si está, el ítem se muestra deshabilitado y este texto explica por qué. */
  unavailableReason?: string;
};

const soon = (module: string) =>
  `${module} todavía no está disponible. Lo vamos a habilitar pronto.`;

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/okrs', label: 'Objetivos', icon: Target, unavailableReason: soon('Objetivos') },
  { href: '/check-ins', label: 'Check-ins', icon: RefreshCw, unavailableReason: soon('Check-ins') },
  { href: '/teams', label: 'Equipos', icon: Users, unavailableReason: soon('Equipos') },
  { href: '/cycles', label: 'Ciclos', icon: CalendarRange, unavailableReason: soon('Ciclos') },
  {
    href: '/cfr/feedback',
    label: 'Feedback',
    icon: MessageSquare,
    unavailableReason: soon('Feedback'),
  },
  {
    href: '/cfr/recognitions',
    label: 'Reconocimientos',
    icon: Award,
    unavailableReason: soon('Reconocimientos'),
  },
];
