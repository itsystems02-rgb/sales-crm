'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';
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

type Employee = {
  id: string;
  role: 'admin' | 'sales';
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
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [clients, setClients] = useState<ClientListItem[]>([]);
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
     INIT
  ===================== */
  useEffect(() => {
    async function init() {
      const emp = await getCurrentEmployee();
      setEmployee(emp);
      fetchClients();
      fetchBanks();
      fetchJobSectors();
    }
    init();
  }, []);

  useEffect(() => {
    if (nationality !== 'non_saudi') {
      setResidencyType('');
    }
  }, [nationality]);

  /* =====================
     LOAD DATA
  ===================== */
  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,eligible,status,created_at')
      .order('created_at', { ascending: false });
    if (error) { alert(error.message); return; }
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
     FORM HANDLERS
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
    if (!name || !mobile) { alert('الاسم ورقم الجوال مطلوبين'); return; }

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
      status: 'lead',
    };

    const res = await supabase.from('clients').insert(payload);
    if (res.error) { alert(res.error.message); return; }

    resetForm();
    fetchClients();
  }

  /* =====================
     UI
  ===================== */
  return (
    <RequireAuth>
      <div className="page">
        {/* فقط يمكن إضافة عملاء */}
        {employee?.role === 'admin' || employee?.role === 'sales' ? (
          <Card title="إضافة عميل">
            <div className="form-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Input placeholder="اسم العميل" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="رقم الجوال" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              <Input placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select value={identityType} onChange={(e) => setIdentityType(e.target.value)}>
                {IDENTITY_TYPES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
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
              {nationality === 'non_saudi' && (
                <select value={residencyType} onChange={(e) => setResidencyType(e.target.value)}>
                  <option value="">نوع الإقامة</option>
                  {RESIDENCY_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
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
              <Button onClick={handleSubmit}>حفظ</Button>
            </div>
          </Card>
        ) : null}

        {/* جدول العملاء */}
        <Card title="قائمة العملاء">
          <Table headers={['الاسم','مستحق','الحالة','إجراء']}>
            {clients.length === 0 ? (
              <tr><td colSpan={4} style={{textAlign:'center'}}>لا يوجد عملاء</td></tr>
            ) : clients.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.eligible ? 'مستحق' : 'غير مستحق'}</td>
                <td>{c.status}</td>
                <td>
                  <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>فتح</Button>
                  {employee?.role === 'admin' && (
                    <>
                      <Button onClick={() => alert('Admin: تعديل العميل')}>تعديل</Button>
                      <Button onClick={() => alert('Admin: حذف العميل')} variant="danger">حذف</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </RequireAuth>
  );
}