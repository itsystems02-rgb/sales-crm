'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/ui/Button';

export default function Header() {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header className="header">
      <div />
      <Button variant="danger" onClick={logout}>
        تسجيل خروج
      </Button>
    </header>
  );
}