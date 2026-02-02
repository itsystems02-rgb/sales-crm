'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

type Role = 'admin' | 'sales' | 'sales_manager';

type NavLink = {
  href: string;
  label: string;
  icon: string;
  roles?: Role[]; // لو موجودة => الرابط يظهر للأدوار دي فقط
};

const LINKS: NavLink[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: '🏠' },
  { href: '/dashboard/projects', label: 'المشاريع', icon: '🏗️' },
  { href: '/dashboard/units', label: 'الوحدات', icon: '🏡' },
  { href: '/dashboard/clients', label: 'العملاء', icon: '👥' },

  // ✅ الصفحة اللي لسه عاملينها (admin + sales_manager فقط)
  { href: '/dashboard/assignments', label: 'توزيع العملاء', icon: '🧩', roles: ['admin', 'sales_manager'] },

  // ملاحظة: عندك هنا /dashboard/reservation
  // لو عندك المسار الصحيح /dashboard/reservations (زي اللي في الداشبورد) غيّره
  { href: '/dashboard/reservation', label: 'الحجوزات', icon: '📅' },

  { href: '/dashboard/sales', label: 'التنفيذات', icon: '💰' },

  // ملاحظة: ده API route غالباً مش صفحة Dashboard
  // لو عندك صفحة الموظفين في /dashboard/employees غيّرها
  { href: '/api/employees', label: 'الموظفين', icon: '👨‍💼' },

  { href: '/dashboard/Report', label: 'التقارير', icon: '📊' },
  { href: '/dashboard/ReportEmployees', label: 'تقارير الموظفين', icon: '📈' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const emp = await getCurrentEmployee();
        if (!mounted) return;
        setRole((emp?.role as Role) || null);
      } catch {
        if (!mounted) return;
        setRole(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const visibleLinks = useMemo(() => {
    return LINKS.filter((l) => {
      if (!l.roles) return true; // متاح للجميع
      if (!role) return false; // لسه محملناش الدور
      return l.roles.includes(role);
    });
  }, [role]);

  return (
    <aside className="sidebar pro-sidebar">
      {/* ===== Brand ===== */}
      <div className="sidebar-brand">
        <div className="logo">🏢 نظام المبيعات</div>
        <div className="sub">Sales Management System</div>
      </div>

      {/* ===== Nav ===== */}
      <nav>
        {visibleLinks.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} className={active ? 'active' : ''}>
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
