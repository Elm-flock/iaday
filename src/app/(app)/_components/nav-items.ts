import {
  Award,
  CalendarRange,
  Home,
  MessageSquare,
  RefreshCw,
  Shield,
  Target,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Si está, el ítem se muestra deshabilitado y este texto explica por qué. */
  unavailableReason?: string;
  /** Solo administración: el resto lo ve deshabilitado con explicación (y no se muestra hasta conocer el rol). */
  adminOnly?: boolean;
};

const soon = (module: string) =>
  `${module} todavía no está disponible. Lo vamos a habilitar pronto.`;

export const ADMIN_ONLY_REASON = 'Solo administración puede gestionar usuarios.';

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/objetivos', label: 'Objetivos', icon: Target },
  { href: '/check-ins', label: 'Check-ins', icon: RefreshCw, unavailableReason: soon('Check-ins') },
  { href: '/equipos', label: 'Equipos', icon: Users },
  { href: '/ciclos', label: 'Ciclos', icon: CalendarRange },
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
  { href: '/admin/usuarios', label: 'Usuarios', icon: Shield, adminOnly: true },
];
