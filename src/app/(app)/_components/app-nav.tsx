'use client';

import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';
import { Sidebar, SidebarItem } from '@/components/ui/sidebar';

export function AppNav() {
  const pathname = usePathname();
  return (
    <Sidebar>
      {NAV_ITEMS.map(({ href, label, icon: Icon, unavailableReason }) => (
        <SidebarItem
          key={href}
          href={href}
          icon={<Icon size={20} strokeWidth={1.75} />}
          current={href === '/' ? pathname === '/' : pathname.startsWith(href)}
          unavailableReason={unavailableReason}
        >
          {label}
        </SidebarItem>
      ))}
    </Sidebar>
  );
}
