import {
  Award,
  BookOpen,
  Bot,
  CalendarRange,
  ClipboardList,
  FileText,
  Home,
  MessageSquare,
  RefreshCw,
  ScrollText,
  Shield,
  Sparkles,
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
  /** Explicación cuando un no-ADMIN lo ve deshabilitado (default: `ADMIN_ONLY_REASON`). */
  adminOnlyReason?: string;
};

export const ADMIN_ONLY_REASON = 'Solo administración puede gestionar usuarios.';

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/objetivos', label: 'Objetivos', icon: Target },
  { href: '/check-ins', label: 'Check-ins', icon: RefreshCw },
  { href: '/equipos', label: 'Equipos', icon: Users },
  { href: '/ciclos', label: 'Ciclos', icon: CalendarRange },
  { href: '/feedback', label: 'Feedback', icon: MessageSquare },
  { href: '/reconocimientos', label: 'Reconocimientos', icon: Award },
  { href: '/pedidos-adaptacion', label: 'Documentos adaptados', icon: FileText },
  { href: '/ayuda', label: 'Ayuda', icon: BookOpen },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Shield, adminOnly: true },
  {
    href: '/admin/asistente',
    label: 'Asistente',
    icon: Bot,
    adminOnly: true,
    adminOnlyReason: 'Solo administración puede usar el asistente.',
  },
  {
    href: '/admin/uso-ia',
    label: 'Uso de IA',
    icon: Sparkles,
    adminOnly: true,
    adminOnlyReason: 'Solo administración puede ver el uso de IA.',
  },
  {
    href: '/admin/pedidos-adaptacion',
    label: 'Pedidos de adaptación',
    icon: ClipboardList,
    adminOnly: true,
    adminOnlyReason: 'Solo administración puede gestionar los pedidos de adaptación.',
  },
  {
    href: '/admin/auditoria',
    label: 'Auditoría',
    icon: ScrollText,
    adminOnly: true,
    adminOnlyReason: 'Solo administración puede ver la auditoría.',
  },
];
