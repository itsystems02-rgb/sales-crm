'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/ui/Button';

const TITLES: Record<string, string> = {
  '/dashboard': 'لوحة التحكم',
  '/dashboard/projects': 'المشاريع',
  '/dashboard/units': 'الوحدات',
  '/dashboard/clients': 'العملاء',
  '/dashboard/reservations': 'الحجوزات',
  '/dashboard/sales': 'التنفيذات',
  '/dashboard/employees': 'الموظفين',
};

type UserProfile = {
  name: string;
  role: string;
};

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // لو عندك جدول employees
    const { data } = await supabase
      .from('employees')
      .select('name, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (data) {
      setUser({
        name: data.name,
        role: data.role || 'Employee',
      });
    } else {
      setUser({
        name: user.email || 'User',
        role: 'User',
      });
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const title =
    Object.keys(TITLES).find((key) => pathname.startsWith(key)) &&
    TITLES[Object.keys(TITLES).find((key) => pathname.startsWith(key))!];

  return (
    <header className="header pro-header">
      {/* ===== Left ===== */}
      <div className="header-left">
      
        <div className="header-text">
          <span className="header-breadcrumb">Dashboard</span>
          
        </div>
      </div>

      {/* ===== Right ===== */}
      <div className="header-right">
        {/* User Profile */}
        {user && (
          <div className="user-profile">
            <div className="avatar">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role}</div>
            </div>
          </div>
        )}

       

        <Button variant="danger" onClick={logout}>
          تسجيل خروج
        </Button>
      </div>
    </header>
  );
}