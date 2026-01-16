'use client';

import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/ui/Button';

const TITLES: Record<string, string> = {
  '/dashboard/projects': 'المشاريع',
  '/dashboard/units': 'الوحدات',
  '/dashboard/clients': 'العملاء',
  '/dashboard/employees': 'الموظفين',
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
    <header className="header">
      <div className="header-left">
        {/* زر الموبايل (هنفعّله بعدين لو حبيت) */}
        <button className="menu-btn">☰</button>

        <h1 className="header-title">{title || 'Dashboard'}</h1>
      </div>

      <Button variant="danger" onClick={logout}>
        تسجيل خروج
      </Button>
    </header>
  );
}