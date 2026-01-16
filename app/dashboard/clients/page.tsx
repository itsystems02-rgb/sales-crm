'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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

  status: string;
  eligible: boolean;

  nationality: string | null;
  residency_type: string | null;

  created_at: string;

  salary_bank: { name: string }[] | null;
  finance_bank: { name: string }[] | null;
  job_sector: { name: string }[] | null;
};

/* =====================
   Constants
===================== */

const IDENTITY_TYPES = [
  { value: '', label: 'اختر نوع الهوية' },
  { value: 'national_id', label: 'بطاقة شخصية' },
  { value: 'passport', label: 'جواز سفر' },
  { value: 'residence', label: 'إقامة' },
];

const RESIDENCY_TYPES = [
  { value: 'residence', label: 'إقامة' },
  { value: 'golden', label: 'إقامة ذهبية' },
  { value: 'premium', label: 'إقامة مميزة' },
  { value: 'passport', label: 'جواز سفر' },
];

/* =====================
   Page
===================== */

export default function ClientsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);
  const [jobSectors, setJobSectors] = useState<{ id: string; name: string }[]>([]);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  const [identityType, setIdentityType] = useState('');
  const [identityNo, setIdentityNo] = useState('');

  const [eligible, setEligible] = useState<boolean>(true);

  const [nationality, setNationality] = useState<'saudi' | 'non_saudi'>('saudi');
  const [residencyType, setResidencyType] = useState('');

  const [salaryBankId, setSalaryBankId] = useState('');
  const [financeBankId, setFinanceBankId] = useState('');
  const [jobSectorId, setJobSectorId] = useState('');

  /* =====================
     LOAD DATA
  ===================== */

  useEffect(() => {
    fetchClients();
    fetchBanks();
    fetchJobSectors();
  }, []);

  async function fetchClients() {
    const { data } = await supabase
      .from('clients')
      .select(`
        id,
        name,
        mobile,
        email,
        identity_type,
        identity_no,
        status,
        eligible,
        nationality,
        residency_type,
        created_at,
        salary_bank:banks!clients_salary_bank_id_fkey(name),
        finance_bank:banks!clients_finance_bank_id_fkey(name),
        job_sector:job_sectors(name)
      `)
      .order('created_at', { ascending: false });

    setClients(data ?? []);
  }

  async function fetchBanks() {
    const { data } = await supabase.from('banks').select('id,name').order('name');
    setBanks(data ?? []);
  }

  async function fetchJobSectors() {
    const { data } = await supabase.from('job_sectors').select('id,name').order('name');
    setJobSectors(data ?? []);
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
      residency_type: nationality === 'non_saudi' ? residencyType || null : null,
      salary_bank_id: salaryBankId || null,
      finance_bank_id: financeBankId || null,
      job_sector_id: jobSectorId || null,
    };

    if (editingId) {
      await supabase.from('clients').update(payload).eq('id', editingId);
    } else {
      await supabase.from('clients').insert({
        ...payload,
        status: 'lead',
      });
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
    setNationality((c.nationality as any) || 'saudi');
    setResidencyType(c.residency_type || '');
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
    <div className="page">
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

          <label>
            <input
              type="checkbox"
              checked={eligible}
              onChange={(e) => setEligible(e.target.checked)}
            /> مستحق
          </label>

          <select value={nationality} onChange={(e) => setNationality(e.target.value as any)}>
            <option value="saudi">سعودي</option>
            <option value="non_saudi">غير سعودي</option>
          </select>

          {nationality === 'non_saudi' && (
            <select value={residencyType} onChange={(e) => setResidencyType(e.target.value)}>
              <option value="">اختر نوع الإقامة</option>
              {RESIDENCY_TYPES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          )}

          <select value={salaryBankId} onChange={(e) => setSalaryBankId(e.target.value)}>
            <option value="">بنك الراتب</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select value={financeBankId} onChange={(e) => setFinanceBankId(e.target.value)}>
            <option value="">بنك التمويل</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select value={jobSectorId} onChange={(e) => setJobSectorId(e.target.value)}>
            <option value="">القطاع الوظيفي</option>
            {jobSectors.map((j) => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleSubmit} disabled={loading}>
              {editingId ? 'تعديل' : 'حفظ'}
            </Button>
            {editingId && <Button onClick={resetForm}>إلغاء</Button>}
          </div>
        </div>
      </Card>

      <Card title="قائمة العملاء">
        <Table headers={['الاسم','الجوال','المستحق','بنك الراتب','إجراء']}>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.mobile}</td>
              <td>{c.eligible ? 'مستحق' : 'غير مستحق'}</td>
              <td>{c.salary_bank?.[0]?.name || '-'}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>فتح</Button>
                  <Button onClick={() => startEdit(c)}>تعديل</Button>
                  <button className="btn-danger" onClick={() => deleteClient(c.id)}>حذف</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}