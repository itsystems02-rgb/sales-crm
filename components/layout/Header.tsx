'use client';

import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/ui/Button';

const TITLES: Record<string, string> = {
  '/dashboard/projects': 'المشاريع',
  '/dashboard/units': 'الوحدات',
  '/dashboard/clients': 'العملاء',
  '/dashboard/employees': 'الموظفين',
  '/dashboard/reservations': 'الحجوزات',
  '/dashboard/sales': 'التنفيذات',
};

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const title =
    Object.keys(TITLES).find((key) => pathname.startsWith(key)) &&
    TITLES[Object.keys(TITLES).find((key) => pathname.startsWith(key))!];

  return (
    <header className="header pro-header">
      <div className="header-left">
        {/* زر الموبايل */}
        <button className="menu-btn">☰</button>

        <div>
          <div className="header-breadcrumb">Dashboard</div>
          <h1 className="header-title">{title || 'لوحة التحكم'}</h1>
        </div>
      </div>

      <div className="header-actions">
        {/* Dark mode */}
        <button
          className="icon-btn"
          onClick={() =>
            document.documentElement.classList.toggle('dark')
          }
          title="الوضع الليلي"
        >
          🌙
        </button>

        <Button variant="danger" onClick={logout}>
          تسجيل خروج
        </Button>
      </div>
    </header>
  );
}