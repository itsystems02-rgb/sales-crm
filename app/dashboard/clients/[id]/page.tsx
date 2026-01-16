'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FollowUps from './followups';

/* =====================
   Types
===================== */

type Ref = {
  name: string;
};

type Client = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;

  identity_type: string | null;
  identity_no: string | null;

  eligible: boolean;
  nationality: 'saudi' | 'non_saudi';
  residency_type: string | null;

  salary_bank: Ref[] | null;
  finance_bank: Ref[] | null;
  job_sector: Ref[] | null;

  status: string;
  created_at: string;
};

/* =====================
   Page
===================== */

export default function ClientPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'details' | 'followups'>('details');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  async function fetchClient() {
    setLoading(true);

    const { data, error } = await supabase
      .from('clients')
      .select(`
        id,
        name,
        mobile,
        email,
        identity_type,
        identity_no,
        eligible,
        nationality,
        residency_type,
        status,
        created_at,
        salary_bank:banks(name),
        finance_bank:banks(name),
        job_sector:job_sectors(name)
      `)
      .eq('id', clientId)
      .maybeSingle(); // 👈 مهم جدًا

    if (error) {
      console.error(error);
      setClient(null);
    } else {
      setClient(data);
    }

    setLoading(false);
  }

  if (loading) {
    return <div className="page">جاري التحميل...</div>;
  }

  if (!client) {
    return <div className="page">العميل غير موجود</div>;
  }

  return (
    <div className="page">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Button onClick={() => setTab('details')} disabled={tab === 'details'}>
          البيانات
        </Button>
        <Button onClick={() => setTab('followups')} disabled={tab === 'followups'}>
          المتابعات
        </Button>
      </div>

      {tab === 'details' && (
        <>
          <Card title="البيانات الأساسية">
            <p><strong>الاسم:</strong> {client.name}</p>
            <p><strong>الجوال:</strong> {client.mobile}</p>
            <p><strong>الإيميل:</strong> {client.email || '-'}</p>
            <p><strong>الحالة:</strong> {client.status}</p>
            <p>
              <strong>تاريخ التسجيل:</strong>{' '}
              {new Date(client.created_at).toLocaleDateString()}
            </p>
          </Card>

          <Card title="الهوية والاستحقاق">
            <p><strong>مستحق:</strong> {client.eligible ? 'نعم' : 'لا'}</p>
            <p><strong>الجنسية:</strong> {client.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'}</p>
            <p><strong>نوع الهوية:</strong> {client.identity_type || '-'}</p>
            <p><strong>رقم الهوية:</strong> {client.identity_no || '-'}</p>
            <p><strong>نوع الإقامة:</strong> {client.residency_type || '-'}</p>
          </Card>

          <Card title="العمل والبنوك">
            <p><strong>القطاع الوظيفي:</strong> {client.job_sector?.[0]?.name || '-'}</p>
            <p><strong>بنك الراتب:</strong> {client.salary_bank?.[0]?.name || '-'}</p>
            <p><strong>بنك التمويل:</strong> {client.finance_bank?.[0]?.name || '-'}</p>
          </Card>
        </>
      )}

      {tab === 'followups' && <FollowUps clientId={client.id} />}
    </div>
  );
}