'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */

type ClientListItem = {
  id: string;
  name: string;
  eligible: boolean;
  status: string;
  created_at: string;
};

type Option = {
  id: string;
  name: string;
};

/* =====================
   Constants
===================== */

const IDENTITY_TYPES = [
  { value: '', label: 'اختر نوع الهوية' },
  { value: 'national_id', label: 'الهوية' },
  { value: 'passport', label: 'جواز سفر' },
  { value: 'residence', label: 'إقامة' },
];

const RESIDENCY_TYPES = [
  { value: 'residence', label: 'إقامة' },
  { value: 'golden', label: 'إقامة ذهبية' },
  { value: 'premium', label: 'إقامة مميزة' },
];

/* =====================
   Page
===================== */

export default function ClientsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [banks, setBanks] = useState<Option[]>([]);
  const [jobSectors, setJobSectors] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  // form
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  const [identityType, setIdentityType] = useState('');
  const [identityNo, setIdentityNo] = useState('');

  const [eligible, setEligible] = useState(true);
  const [nationality, setNationality] = useState<'saudi' | 'non_saudi'>('saudi');
  const [residencyType, setResidencyType] = useState('');

  const [salaryBankId, setSalaryBankId] = useState('');
  const [financeBankId, setFinanceBankId] = useState('');
  const [jobSectorId, setJobSectorId] = useState('');

  /* =====================
     LOAD
  ===================== */

  useEffect(() => {
    fetchClients();
    fetchBanks();
    fetchJobSectors();
  }, []);

  useEffect(() => {
    if (nationality !== 'saudi') {
      setResidencyType('');
    }
  }, [nationality]);

  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,eligible,status,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setClients(data || []);
  }

  async function fetchBanks() {
    const { data } = await supabase.from('banks').select('id,name').order('name');
    setBanks(data || []);
  }

  async function fetchJobSectors() {
    const { data } = await supabase.from('job_sectors').select('id,name').order('name');
    setJobSectors(data || []);
  }

  /* =====================
     FORM
  ===================== */

  function resetForm() {
    setName('');
    setMobile('');
    setEmail('');
    setIdentityType('');
    setIdentityNo('');
    setEligible(true);
    setNationality('saudi');
    setResidencyType('');
    setSalaryBankId('');
    setFinanceBankId('');
    setJobSectorId('');
  }

  async function handleSubmit() {
    if (!name || !mobile) {
      alert('الاسم ورقم الجوال مطلوبين');
      return;
    }

    setLoading(true);

    const payload = {
      name,
      mobile,
      email: email || null,
      identity_type: identityType || null,
      identity_no: identityNo || null,
      eligible,
      nationality,
      residency_type: nationality === 'saudi' ? residencyType || null : null,
      salary_bank_id: salaryBankId || null,
      finance_bank_id: financeBankId || null,
      job_sector_id: jobSectorId || null,
      status: 'lead', // تلقائي
    };

    const { error } = await supabase.from('clients').insert(payload);

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    resetForm();
    fetchClients();
  }

  async function deleteClient(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    await supabase.from('clients').delete().eq('id', id);
    fetchClients();
  }

  /* =====================
     UI
  ===================== */

  return (
    <RequireAuth>
      <div className="page">
        <Card title="إضافة عميل">
          <div className="form-col">
            <Input placeholder="اسم العميل" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="رقم الجوال" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <Input placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />

            <select value={identityType} onChange={(e) => setIdentityType(e.target.value)}>
              {IDENTITY_TYPES.map(i => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>

            <Input placeholder="رقم الهوية" value={identityNo} onChange={(e) => setIdentityNo(e.target.value)} />

            <select value={eligible ? 'yes' : 'no'} onChange={(e) => setEligible(e.target.value === 'yes')}>
              <option value="yes">مستحق</option>
              <option value="no">غير مستحق</option>
            </select>

            <select value={nationality} onChange={(e) => setNationality(e.target.value as any)}>
              <option value="saudi">سعودي</option>
              <option value="non_saudi">غير سعودي</option>
            </select>

            {nationality === 'saudi' && (
              <select value={residencyType} onChange={(e) => setResidencyType(e.target.value)}>
                <option value="">نوع الإقامة</option>
                {RESIDENCY_TYPES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            )}

            <select value={salaryBankId} onChange={(e) => setSalaryBankId(e.target.value)}>
              <option value="">بنك الراتب</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <select value={financeBankId} onChange={(e) => setFinanceBankId(e.target.value)}>
              <option value="">بنك التمويل</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <select value={jobSectorId} onChange={(e) => setJobSectorId(e.target.value)}>
              <option value="">القطاع الوظيفي</option>
              {jobSectors.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>

            <Button onClick={handleSubmit} disabled={loading}>
              حفظ
            </Button>
          </div>
        </Card>

        <Card title="قائمة العملاء">
          <Table headers={['الاسم', 'مستحق', 'الحالة', 'إجراء']}>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center' }}>لا يوجد عملاء</td>
              </tr>
            ) : (
              clients.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.eligible ? 'مستحق' : 'غير مستحق'}</td>
                  <td>{c.status}</td>
                  <td>
                    <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>فتح</Button>
                    <button className="btn-danger" onClick={() => deleteClient(c.id)}>حذف</button>
                  </td>
                </tr>
              ))
            )}
          </Table>
        </Card>
      </div>
    </RequireAuth>
  );
}