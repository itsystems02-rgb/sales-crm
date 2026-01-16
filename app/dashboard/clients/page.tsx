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

  created_at: string;

  salary_bank: { name: string }[] | null;
  finance_bank: { name: string }[] | null;
  job_sector: { name: string }[] | null;
};

type Option = { id: string; name: string };

/* =====================
   Constants
===================== */

const IDENTITY_TYPES = [
  { value: '', label: 'اختر نوع الهوية' },
  { value: 'national_id', label: 'الهوية' }, // ✅ اتعدلت
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
  const [banks, setBanks] = useState<Option[]>([]);
  const [jobSectors, setJobSectors] = useState<Option[]>([]);
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
    fetchBanks();
    fetchJobSectors();
  }, []);

  // ✅ لو الجنسية غير سعودي نقفل نوع الإقامة ونفضّيها
  useEffect(() => {
    if (nationality !== 'saudi') setResidencyType('');
  }, [nationality]);

  async function fetchClients() {
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
        salary_bank_id,
        finance_bank_id,
        job_sector_id,
        created_at,
        salary_bank:banks!clients_salary_bank_id_fkey(name),
        finance_bank:banks!clients_finance_bank_id_fkey(name),
        job_sector:job_sectors(name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setClients((data ?? []) as Client[]);
  }

  async function fetchBanks() {
    const { data, error } = await supabase.from('banks').select('id,name').order('name');
    if (error) {
      console.error(error);
      return;
    }
    setBanks(data ?? []);
  }

  async function fetchJobSectors() {
    const { data, error } = await supabase.from('job_sectors').select('id,name').order('name');
    if (error) {
      console.error(error);
      return;
    }
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
      residency_type: nationality === 'saudi' ? (residencyType || null) : null,

      salary_bank_id: salaryBankId || null,
      finance_bank_id: financeBankId || null,
      job_sector_id: jobSectorId || null,
    };

    if (editingId) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editingId);
      if (error) alert(error.message);
    } else {
      const { error } = await supabase.from('clients').insert(payload);
      if (error) alert(error.message);
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

    setEligible(Boolean(c.eligible));
    setNationality(c.nationality || 'saudi');
    setResidencyType(c.residency_type || '');

    // ✅ دول كانوا ناقصين
    setSalaryBankId(c.salary_bank_id || '');
    setFinanceBankId(c.finance_bank_id || '');
    setJobSectorId(c.job_sector_id || '');
  }

  async function deleteClient(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;

    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) alert(error.message);

    fetchClients();
  }

  /* =====================
     UI
  ===================== */

  return (
    <RequireAuth>
      <div className="page">
        {/* Add / Edit */}
        <Card title={editingId ? 'تعديل عميل' : 'إضافة عميل'}>
          <div className="form-col">
            <Input placeholder="اسم العميل" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="رقم الجوال" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <Input placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />

            <select value={identityType} onChange={(e) => setIdentityType(e.target.value)}>
              {IDENTITY_TYPES.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>

            <Input placeholder="رقم الهوية" value={identityNo} onChange={(e) => setIdentityNo(e.target.value)} />

            {/* مستحق / غير مستحق */}
            <select value={eligible ? 'yes' : 'no'} onChange={(e) => setEligible(e.target.value === 'yes')}>
              <option value="yes">مستحق</option>
              <option value="no">غير مستحق</option>
            </select>

            {/* الجنسية */}
            <select value={nationality} onChange={(e) => setNationality(e.target.value as any)}>
              <option value="saudi">سعودي</option>
              <option value="non_saudi">غير سعودي</option>
            </select>

            {/* ✅ نوع الإقامة يظهر للسعودي فقط */}
            {nationality === 'saudi' && (
              <select value={residencyType} onChange={(e) => setResidencyType(e.target.value)}>
                <option value="">نوع الإقامة</option>
                {RESIDENCY_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}

            {/* بنك الراتب */}
            <select value={salaryBankId} onChange={(e) => setSalaryBankId(e.target.value)}>
              <option value="">بنك الراتب</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {/* بنك التمويل */}
            <select value={financeBankId} onChange={(e) => setFinanceBankId(e.target.value)}>
              <option value="">بنك التمويل</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            {/* القطاع الوظيفي */}
            <select value={jobSectorId} onChange={(e) => setJobSectorId(e.target.value)}>
              <option value="">القطاع الوظيفي</option>
              {jobSectors.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={handleSubmit} disabled={loading}>
                {editingId ? 'تعديل' : 'حفظ'}
              </Button>

              {editingId && <Button onClick={resetForm}>إلغاء</Button>}
            </div>
          </div>
        </Card>

        {/* List */}
        <Card title="قائمة العملاء">
          <Table
            headers={[
              'الاسم',
              'الجوال',
              'مستحق',
              'الجنسية',
              'نوع الإقامة',
              'بنك الراتب',
              'بنك التمويل',
              'القطاع',
              'تاريخ الإضافة',
              'إجراء',
            ]}
          >
            {clients.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center' }}>
                  لا يوجد عملاء
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id}>
                  <td data-label="الاسم">{c.name}</td>
                  <td data-label="الجوال">{c.mobile}</td>

                  <td data-label="مستحق">
                    <span className={`badge ${c.eligible ? 'available' : 'sold'}`}>
                      {c.eligible ? 'مستحق' : 'غير مستحق'}
                    </span>
                  </td>

                  <td data-label="الجنسية">{c.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'}</td>
                  <td data-label="نوع الإقامة">{c.residency_type || '-'}</td>

                  <td data-label="بنك الراتب">{c.salary_bank?.[0]?.name || '-'}</td>
                  <td data-label="بنك التمويل">{c.finance_bank?.[0]?.name || '-'}</td>
                  <td data-label="القطاع">{c.job_sector?.[0]?.name || '-'}</td>

                  <td data-label="تاريخ الإضافة">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>

                  <td data-label="إجراء">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>فتح</Button>
                      <Button onClick={() => startEdit(c)}>تعديل</Button>
                      <button className="btn-danger" onClick={() => deleteClient(c.id)}>
                        حذف
                      </button>
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