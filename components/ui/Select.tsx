'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data } = await supabase.auth.getSession();

    // لو مسجل دخول → روح الداشبورد
    if (data.session) {
      router.replace('/dashboard');
      return;
    }

    // مش مسجل
    setLoading(false);
  }

  if (loading) {
    return <div className="page">جاري التحميل...</div>;
  }

  return (
    <div className="page" style={{ maxWidth: 520, margin: '80px auto' }}>
      <Card title="Sales CRM 🚀">
        <p style={{ marginBottom: 20, color: '#64748b' }}>
          نظام إدارة مبيعات احترافي لإدارة المشاريع، الوحدات، العملاء والتنفيذات.
        </p>

        <div style={{ display: 'flex', gap: 12 }}>
          <Button onClick={() => router.push('/login')}>
            تسجيل الدخول
          </Button>

          <Button
            variant="danger"
            onClick={() => router.push('/register')}
          >
            إنشاء حساب
          </Button>
        </div>
      </Card>
    </div>
  );
}