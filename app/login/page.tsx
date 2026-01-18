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
    <div
      className="page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Card>
          {/* ===== Header ===== */}
          <div
            style={{
              textAlign: 'center',
              marginBottom: 32,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              تسجيل دخول الموظفين
            </h2>

            <p
              style={{
                marginTop: 8,
                fontSize: 14,
                color: '#64748b',
              }}
            >
              أدخل بياناتك للوصول إلى لوحة التحكم
            </p>
          </div>

          {/* ===== Form ===== */}
          <div
            className="form-col"
            style={{
              gap: 20, // 👈 حل مشكلة اللزق
            }}
          >
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
                  padding: '12px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  border: '1px solid #fecaca',
                }}
              >
                {error}
              </div>
            )}

            <Button onClick={login} disabled={loading}>
              {loading ? 'جاري تسجيل الدخول...' : 'دخول'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}