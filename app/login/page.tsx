'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function login() {
    if (!email || !password) {
      alert('الإيميل وكلمة المرور مطلوبين');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    // نجاح تسجيل الدخول
    router.push('/dashboard');
  }

  return (
    <div className="page" style={{ maxWidth: 420, margin: '80px auto' }}>
      <Card title="تسجيل دخول الموظفين">
        <div className="form-col">
          <Input
            placeholder="الإيميل"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button onClick={login} disabled={loading}>
            {loading ? 'جاري الدخول...' : 'دخول'}
          </Button>
        </div>
      </Card>
    </div>
  );
}