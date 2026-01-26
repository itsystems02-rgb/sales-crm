'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'الرئيسية', icon: '🏠' }, 
  { href: '/dashboard/projects', label: 'المشاريع', icon: '🏗️' },
  { href: '/dashboard/units', label: 'الوحدات', icon: '🏡' },
  { href: '/dashboard/clients', label: 'العملاء', icon: '👥' },
  { href: '/dashboard/reservation', label: 'الحجوزات', icon: '📅' },
  { href: '/dashboard/sales', label: 'التنفيذات', icon: '💰' },
  { href: '/api/employees', label: 'الموظفين', icon: '👨‍💼' },
  { href: '/dashboard/reports', label: 'التقارير', icon: '📊' },
  { href: '/dashboard/employee-reports', label: 'تقارير الموظفين', icon: '📈' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar pro-sidebar">
      {/* ===== Brand ===== */}
      <div className="sidebar-brand">
        <div className="logo">🏢 نظام المبيعات</div>
        <div className="sub">Sales Management System</div>
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
              {active && <span className="active-indicator"></span>}
            </Link>
          );
        })}
      </nav>

      {/* ===== Footer ===== */}
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="avatar">👨‍💼</div>
          <div className="user-details">
            <div className="user-name">نظام الإدارة</div>
            <div className="user-role">لوحة التحكم</div>
          </div>
        </div>
        <small>© 2026 نظام CRM</small>
      </div>
    </aside>
  );
}