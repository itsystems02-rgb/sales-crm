'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MENU = [
  { href: '/dashboard/projects', label: 'المشاريع', icon: '🏗️' },
  { href: '/dashboard/units', label: 'الوحدات', icon: '🏠' },
  { href: '/dashboard/clients', label: 'العملاء', icon: '👥' },
  { href: '/api/employees', label: 'الموظفين', icon: '🧑‍💼' },
 { href: '/dashboard/sales/new', label: 'التنفيذات', icon: '👥' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <h2>Sales CRM</h2>

      <nav>
        {MENU.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname.startsWith(item.href) ? 'active' : ''}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}