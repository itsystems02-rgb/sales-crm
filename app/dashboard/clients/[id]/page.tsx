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

    const { data: c } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();

    if (!c) {
      setClient(null);
      setLoading(false);
      return;
    }

    setClient(c);

    if (c.salary_bank_id) {
      const { data } = await supabase.from('banks').select('name').eq('id', c.salary_bank_id).maybeSingle();
      setSalaryBankName(data?.name ?? null);
    }

    if (c.finance_bank_id) {
      const { data } = await supabase.from('banks').select('name').eq('id', c.finance_bank_id).maybeSingle();
      setFinanceBankName(data?.name ?? null);
    }

    if (c.job_sector_id) {
      const { data } = await supabase.from('job_sectors').select('name').eq('id', c.job_sector_id).maybeSingle();
      setJobSectorName(data?.name ?? null);
    }

    setLoading(false);
  }

  if (loading) return <div className="page">جاري التحميل...</div>;
  if (!client) return <div className="page">العميل غير موجود</div>;

  return (
    <div className="page">
      {/* Tabs */}
      <div className="tabs">
        <Button variant={tab === 'details' ? 'primary' : 'ghost'} onClick={() => setTab('details')}>
          البيانات
        </Button>
        <Button variant={tab === 'followups' ? 'primary' : 'ghost'} onClick={() => setTab('followups')}>
          المتابعات
        </Button>
      </div>

      {tab === 'details' && (
        <div className="details-layout">
          {/* Basic */}
          <Card title="البيانات الأساسية">
            <div className="details-grid">
              <Detail label="الاسم" value={client.name} />
              <Detail label="الجوال" value={client.mobile} />
              <Detail label="الإيميل" value={client.email || '-'} />
              <Detail label="الحالة" value={client.status} badge />
              <Detail
                label="تاريخ التسجيل"
                value={new Date(client.created_at).toLocaleDateString()}
              />
            </div>
          </Card>

          {/* Identity */}
          <Card title="الهوية والاستحقاق">
            <div className="details-grid">
              <Detail label="مستحق" value={client.eligible ? 'نعم' : 'لا'} badge />
              <Detail label="الجنسية" value={client.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'} />
              <Detail label="نوع الهوية" value={client.identity_type || '-'} />
              <Detail label="رقم الهوية" value={client.identity_no || '-'} />
              <Detail label="نوع الإقامة" value={client.residency_type || '-'} />
            </div>
          </Card>

          {/* Work */}
          <Card title="العمل والبنوك">
            <div className="details-grid">
              <Detail label="القطاع الوظيفي" value={jobSectorName || '-'} />
              <Detail label="بنك الراتب" value={salaryBankName || '-'} />
              <Detail label="بنك التمويل" value={financeBankName || '-'} />
            </div>
          </Card>
        </div>
      )}

      {tab === 'followups' && <FollowUps clientId={client.id} />}
    </div>
  );
}

/* =====================
   Small UI Component
===================== */

function Detail({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="detail-row">
      <span className="label">{label}</span>
      <span className={badge ? 'value badge' : 'value'}>{value}</span>
    </div>
  );
}