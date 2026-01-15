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
  setLoading(true);

  const res = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  console.log('LOGIN RESULT:', res);

  setLoading(false);

  if (res.error) {
    alert(res.error.message);
    return;
  }

  router.push('/projects');
}

  return (
    <div className="page" style={{ maxWidth: 420, margin: '60px auto' }}>
      <Card title="تسجيل الدخول">
        <div className="form-col">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <Button disabled={loading}>
            {loading ? 'جاري الدخول...' : 'دخول'}
          </Button>
        </div>
      </Card>
    </div>
  );
}