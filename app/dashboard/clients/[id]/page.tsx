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

  // ✅ علاقات one-to-many = object مش array
  salary_bank: { name: string } | null;
  finance_bank: { name: string } | null;
  job_sector: { name: string } | null;

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

  useEffect(() => {
    fetchClient();
  }, [clientId]);

  async function fetchClient() {
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
        salary_bank:banks!clients_salary_bank_id_fkey(name),
        finance_bank:banks!clients_finance_bank_id_fkey(name),
        job_sector:job_sectors(name)
      `)
      .eq('id', clientId)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setClient(data as Client);
  }

  if (!client) {
    return <div className="page">جاري التحميل...</div>;
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

      {/* =====================
         DETAILS
      ===================== */}
      {tab === 'details' && (
        <>
          {/* البيانات الأساسية */}
          <Card title="البيانات الأساسية">
            <div className="details-grid">
              <p><strong>الاسم:</strong> {client.name}</p>
              <p><strong>الجوال:</strong> {client.mobile}</p>
              <p><strong>الإيميل:</strong> {client.email || '-'}</p>
              <p><strong>الحالة:</strong> {client.status}</p>
              <p>
                <strong>تاريخ التسجيل:</strong>{' '}
                {new Date(client.created_at).toLocaleDateString()}
              </p>
            </div>
          </Card>

          {/* الهوية والاستحقاق */}
          <Card title="الهوية والاستحقاق">
            <div className="details-grid">
              <p><strong>مستحق:</strong> {client.eligible ? 'نعم' : 'لا'}</p>
              <p>
                <strong>الجنسية:</strong>{' '}
                {client.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'}
              </p>
              <p><strong>نوع الهوية:</strong> {client.identity_type || '-'}</p>
              <p><strong>رقم الهوية:</strong> {client.identity_no || '-'}</p>
              <p><strong>نوع الإقامة:</strong> {client.residency_type || '-'}</p>
            </div>
          </Card>

          {/* العمل والبنوك */}
          <Card title="العمل والبنوك">
            <div className="details-grid">
              <p>
                <strong>القطاع الوظيفي:</strong>{' '}
                {client.job_sector?.name || '-'}
              </p>
              <p>
                <strong>بنك الراتب:</strong>{' '}
                {client.salary_bank?.name || '-'}
              </p>
              <p>
                <strong>بنك التمويل:</strong>{' '}
                {client.finance_bank?.name || '-'}
              </p>
            </div>
          </Card>
        </>
      )}

      {/* =====================
         FOLLOW UPS
      ===================== */}
      {tab === 'followups' && (
        <FollowUps clientId={client.id} />
      )}
    </div>
  );
}