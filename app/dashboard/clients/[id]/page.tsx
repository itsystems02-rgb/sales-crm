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

export default function ClientPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'details' | 'followups'>('details');
  const [loading, setLoading] = useState(true);

  const [salaryBankName, setSalaryBankName] = useState<string | null>(null);
  const [financeBankName, setFinanceBankName] = useState<string | null>(null);
  const [jobSectorName, setJobSectorName] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function fetchAll() {
    setLoading(true);

    // 1) fetch client
    const { data: c, error: clientErr } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr) {
      console.error('CLIENT ERROR:', clientErr);
      setClient(null);
      setLoading(false);
      return;
    }

    if (!c) {
      setClient(null);
      setLoading(false);
      return;
    }

    setClient(c);

    // 2) fetch salary bank name
    if (c.salary_bank_id) {
      const { data, error } = await supabase
        .from('banks')
        .select('name')
        .eq('id', c.salary_bank_id)
        .maybeSingle();

      if (error) console.error('SALARY BANK ERROR:', error);
      setSalaryBankName(data?.name ?? null);
    } else {
      setSalaryBankName(null);
    }

    // 3) fetch finance bank name
    if (c.finance_bank_id) {
      const { data, error } = await supabase
        .from('banks')
        .select('name')
        .eq('id', c.finance_bank_id)
        .maybeSingle();

      if (error) console.error('FINANCE BANK ERROR:', error);
      setFinanceBankName(data?.name ?? null);
    } else {
      setFinanceBankName(null);
    }

    // 4) fetch job sector name
    if (c.job_sector_id) {
      const { data, error } = await supabase
        .from('job_sectors')
        .select('name')
        .eq('id', c.job_sector_id)
        .maybeSingle();

      if (error) console.error('JOB SECTOR ERROR:', error);
      setJobSectorName(data?.name ?? null);
    } else {
      setJobSectorName(null);
    }

    setLoading(false);
  }

  if (loading) return <div className="page">جاري التحميل...</div>;
  if (!client) return <div className="page">العميل غير موجود</div>;

  return (
    <div className="page">
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
            <div className="details-grid">
              <p><strong>الاسم:</strong> {client.name}</p>
              <p><strong>الجوال:</strong> {client.mobile}</p>
              <p><strong>الإيميل:</strong> {client.email || '-'}</p>
              <p><strong>الحالة:</strong> {client.status}</p>
              <p><strong>تاريخ التسجيل:</strong> {new Date(client.created_at).toLocaleDateString()}</p>
            </div>
          </Card>

          <Card title="الهوية والاستحقاق">
            <div className="details-grid">
              <p><strong>مستحق:</strong> {client.eligible ? 'نعم' : 'لا'}</p>
              <p><strong>الجنسية:</strong> {client.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'}</p>
              <p><strong>نوع الهوية:</strong> {client.identity_type || '-'}</p>
              <p><strong>رقم الهوية:</strong> {client.identity_no || '-'}</p>
              <p><strong>نوع الإقامة:</strong> {client.residency_type || '-'}</p>
            </div>
          </Card>

          <Card title="العمل والبنوك">
            <div className="details-grid">
              <p><strong>القطاع الوظيفي:</strong> {jobSectorName || '-'}</p>
              <p><strong>بنك الراتب:</strong> {salaryBankName || '-'}</p>
              <p><strong>بنك التمويل:</strong> {financeBankName || '-'}</p>
            </div>
          </Card>
        </>
      )}

      {tab === 'followups' && <FollowUps clientId={client.id} />}
    </div>
  );
}