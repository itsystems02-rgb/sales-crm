'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard/projects', label: 'المشاريع', icon: '🏗️' },
  { href: '/dashboard/units', label: 'الوحدات', icon: '🏠' },
  { href: '/dashboard/clients', label: 'العملاء', icon: '👥' },
  { href: '/dashboard/reservations', label: 'الحجوزات', icon: '📌' },
  { href: '/dashboard/sales', label: 'التنفيذات', icon: '💰' },
  { href: '/dashboard/employees', label: 'الموظفين', icon: '🧑‍💼' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar pro-sidebar">
      {/* ===== Brand ===== */}
      <div className="sidebar-brand">
        <div className="logo">CRM</div>
        <div className="sub">Management System</div>
      </div>

      {/* ===== Nav ===== */}
      <nav>
        {LINKS.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? 'active' : ''}
            >
              <span className="icon">{link.icon}</span>
              <span className="text">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ===== Footer ===== */}
      <div className="sidebar-footer">
        <small>© 2026 CRM</small>
      </div>
    </aside>
  );
}