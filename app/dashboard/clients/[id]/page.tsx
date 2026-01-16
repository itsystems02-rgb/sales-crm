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

  salary_bank_id: string | null;
  finance_bank_id: string | null;
  job_sector_id: string | null;

  status: string;
  created_at: string;
};

type RefName = string | null;

/* =====================
   Page
===================== */

export default function ClientPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [salaryBank, setSalaryBank] = useState<RefName>(null);
  const [financeBank, setFinanceBank] = useState<RefName>(null);
  const [jobSector, setJobSector] = useState<RefName>(null);

  const [tab, setTab] = useState<'details' | 'followups'>('details');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  async function fetchClient() {
    setLoading(true);

    // 1️⃣ العميل نفسه
    const { data: clientData, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();

    if (error || !clientData) {
      setClient(null);
      setLoading(false);
      return;
    }

    setClient(clientData);

    // 2️⃣ بنك الراتب
    if (clientData.salary_bank_id) {
      const { data } = await supabase
        .from('banks')
        .select('name')
        .eq('id', clientData.salary_bank_id)
        .single();
      setSalaryBank(data?.name ?? null);
    }

    // 3️⃣ بنك التمويل
    if (clientData.finance_bank_id) {
      const { data } = await supabase
        .from('banks')
        .select('name')
        .eq('id', clientData.finance_bank_id)
        .single();
      setFinanceBank(data?.name ?? null);
    }

    // 4️⃣ القطاع الوظيفي
    if (clientData.job_sector_id) {
      const { data } = await supabase
        .from('job_sectors')
        .select('name')
        .eq('id', clientData.job_sector_id)
        .single();
      setJobSector(data?.name ?? null);
    }

    setLoading(false);
  }

  if (loading) return <div className="page">جاري التحميل...</div>;
  if (!client) return <div className="page">العميل غير موجود</div>;

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
            <p><strong>القطاع الوظيفي:</strong> {jobSector || '-'}</p>
            <p><strong>بنك الراتب:</strong> {salaryBank || '-'}</p>
            <p><strong>بنك التمويل:</strong> {financeBank || '-'}</p>
          </Card>
        </>
      )}

      {tab === 'followups' && <FollowUps clientId={client.id} />}
    </div>
  );
}