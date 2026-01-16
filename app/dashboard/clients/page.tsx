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
  { value: 'passport', label: 'جواز سفر' },
];

export default function ClientsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);

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
  }, []);

  useEffect(() => {
    if (nationality !== 'saudi') {
      setResidencyType('');
    }
  }, [nationality]);

  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setClients(data ?? []);
  }

  /* =====================
     FORM
  ===================== */

  function resetForm() {
    setEditingId(null);
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
      status: 'lead', // مهم
    };

    const res = editingId
      ? await supabase.from('clients').update(payload).eq('id', editingId)
      : await supabase.from('clients').insert(payload);

    if (res.error) {
      alert(res.error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    resetForm();
    fetchClients();
  }

  function startEdit(c: Client) {
    setEditingId(c.id);
    setName(c.name);
    setMobile(c.mobile);
    setEmail(c.email || '');
    setIdentityType(c.identity_type || '');
    setIdentityNo(c.identity_no || '');
    setEligible(c.eligible);
    setNationality(c.nationality);
    setResidencyType(c.residency_type || '');
    setSalaryBankId(c.salary_bank_id || '');
    setFinanceBankId(c.finance_bank_id || '');
    setJobSectorId(c.job_sector_id || '');
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
        {/* FORM */}
        <Card title={editingId ? 'تعديل عميل' : 'إضافة عميل'}>
          <div className="form-col">
            <Input placeholder="اسم العميل" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="رقم الجوال" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <Input placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />

            <select value={identityType} onChange={(e) => setIdentityType(e.target.value)}>
              {IDENTITY_TYPES.map((i) => (
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
                {RESIDENCY_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            )}

            <Input placeholder="بنك الراتب (ID)" value={salaryBankId} onChange={(e) => setSalaryBankId(e.target.value)} />
            <Input placeholder="بنك التمويل (ID)" value={financeBankId} onChange={(e) => setFinanceBankId(e.target.value)} />
            <Input placeholder="القطاع الوظيفي (ID)" value={jobSectorId} onChange={(e) => setJobSectorId(e.target.value)} />

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={handleSubmit} disabled={loading}>
                {editingId ? 'تعديل' : 'حفظ'}
              </Button>
              {editingId && <Button onClick={resetForm}>إلغاء</Button>}
            </div>
          </div>
        </Card>

        {/* LIST */}
        <Card title="قائمة العملاء">
          <Table headers={['الاسم','مستحق','الحالة','إجراء']}>
            {clients.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center' }}>لا يوجد عملاء</td></tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.eligible ? 'مستحق' : 'غير مستحق'}</td>
                  <td>{c.status}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>فتح</Button>
                      <Button onClick={() => startEdit(c)}>تعديل</Button>
                      <button className="btn-danger" onClick={() => deleteClient(c.id)}>حذف</button>
                    </div>
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