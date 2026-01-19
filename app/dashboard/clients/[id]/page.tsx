'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  saved_by: string | null; // id الموظف
};

export default function ClientPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'details' | 'followups'>('details');
  const [loading, setLoading] = useState(true);

  const [salaryBankName, setSalaryBankName] = useState<string | null>(null);
  const [financeBankName, setFinanceBankName] = useState<string | null>(null);
  const [jobSectorName, setJobSectorName] = useState<string | null>(null);
  const [savedByName, setSavedByName] = useState<string | null>(null);

  const [reservationId, setReservationId] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
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

    if (c.saved_by) {
      const { data } = await supabase.from('employees').select('name').eq('id', c.saved_by).maybeSingle();
      setSavedByName(data?.name ?? null);
    }

    const { data: reservation } = await supabase
      .from('reservations')
      .select('id')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setReservationId(reservation?.id ?? null);

    setLoading(false);
  }

  if (loading) return <div className="page">جاري التحميل...</div>;
  if (!client) return <div className="page">العميل غير موجود</div>;

  function translateStatus(status: string) {
    switch (status) {
      case 'lead': return 'متابعة';
      case 'reserved': return 'محجوز';
      case 'visited': return 'تمت الزيارة';
      default: return status;
    }
  }

  return (
    <div className="page">

      <div className="tabs" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant={tab === 'details' ? 'primary' : undefined} onClick={() => setTab('details')}>البيانات</Button>
        <Button variant={tab === 'followups' ? 'primary' : undefined} onClick={() => setTab('followups')}>المتابعات</Button>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}/reservation`)}>حجز</Button>
        {reservationId && <Button onClick={() => router.push(`/dashboard/clients/${clientId}/reservation/${reservationId}`)}>عرض الحجز</Button>}
      </div>

      {tab === 'details' && (
        <div className="details-layout">

          <Card title="البيانات الأساسية">
            <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px' }}>
              <Detail label="الاسم" value={client.name} />
              <Detail label="الجوال" value={client.mobile} />
              <Detail label="الإيميل" value={client.email || '-'} />
              <Detail label="الحالة" value={translateStatus(client.status)} badge />
              <Detail label="تاريخ التسجيل" value={new Date(client.created_at).toLocaleDateString()} />
              <Detail label="مسجل بواسطة" value={savedByName || '-'} />
            </div>
          </Card>

          <Card title="الهوية والاستحقاق">
            <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px' }}>
              <Detail label="مستحق" value={client.eligible ? 'نعم' : 'لا'} badge />
              <Detail label="الجنسية" value={client.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'} />
              <Detail label="نوع الهوية" value={client.identity_type || '-'} />
              <Detail label="رقم الهوية" value={client.identity_no || '-'} />
              <Detail label="نوع الإقامة" value={client.residency_type || '-'} />
            </div>
          </Card>

          <Card title="العمل والبنوك">
            <div className="details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px' }}>
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

function Detail({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="detail-row" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="label" style={{ fontWeight: 500 }}>{label}</span>
      <span className={badge ? 'value badge' : 'value'}>{value}</span>
    </div>
  );
}