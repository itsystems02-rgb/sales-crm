'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FollowUps from './followups';

type Client = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  status: string;
};

export default function ClientPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'details' | 'followups'>('details');

  useEffect(() => {
    fetchClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function fetchClient() {
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,mobile,email,status')
      .eq('id', clientId)
      .single();

    if (!error) setClient(data);
  }

  if (!client) return <div>جاري التحميل...</div>;

  return (
    <div className="page">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button onClick={() => setTab('details')}>البيانات</Button>
        <Button onClick={() => setTab('followups')}>المتابعات</Button>
      </div>

      {/* Details */}
      {tab === 'details' && (
        <Card title="بيانات العميل">
          <p><strong>الاسم:</strong> {client.name}</p>
          <p><strong>الجوال:</strong> {client.mobile}</p>
          <p><strong>الإيميل:</strong> {client.email || '-'}</p>
          <p><strong>الحالة:</strong> {client.status}</p>
        </Card>
      )}

      {/* Follow-ups */}
      {tab === 'followups' && (
        <FollowUps clientId={client.id} />
      )}
    </div>
  );
}