'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    if (!email || !password) {
      setError('من فضلك أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError('بيانات الدخول غير صحيحة');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Sales CRM</h1>
        <p className="auth-subtitle">
          تسجيل دخول الموظفين للوصول إلى لوحة التحكم
        </p>

        <div className="auth-form">
          <Input
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            type="password"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <div
              style={{
                background: '#fef2f2',
                color: '#b91c1c',
                padding: '12px',
                borderRadius: 8,
                fontSize: 13,
                border: '1px solid #fecaca',
              }}
            >
              {error}
            </div>
          )}

          <Button onClick={login} disabled={loading}>
            {loading ? 'جاري الدخول...' : 'دخول'}
          </Button>
        </div>
      </div>
    </div>
  );
}