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
  created_by: string | null;
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

function translateStatus(status: string) {
  switch (status) {
    case 'lead': return 'متابعة';
    case 'reserved': return 'محجوز';
    case 'visited': return 'تمت الزيارة';
    default: return status;
  }
}

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
  const [saving, setSaving] = useState(false);

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
      setLoading(true);
      try {
        const emp = await getCurrentEmployee();
        setEmployee(emp);
        await fetchClients();
        await fetchBanks();
        await fetchJobSectors();
      } catch (error) {
        console.error('Error initializing page:', error);
        alert('حدث خطأ في تحميل البيانات');
      } finally {
        setLoading(false);
      }
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
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id,name,eligible,status,created_at,created_by')
        .order('created_at', { ascending: false });
      
      if (error) { 
        console.error('Error fetching clients:', error);
        alert('حدث خطأ في تحميل العملاء: ' + error.message); 
        return; 
      }
      
      // إذا كان مندوب مبيعات، نرى فقط العملاء الذي أضافهم هو
      if (employee?.role === 'sales') {
        const filteredClients = (data || []).filter(client => 
          client.created_by === employee.id
        );
        setClients(filteredClients);
      } else {
        // الأدمن يرى كل العملاء
        setClients(data || []);
      }
    } catch (error) {
      console.error('Error in fetchClients:', error);
      setClients([]);
    }
  }

  async function fetchBanks() {
    try {
      const { data, error } = await supabase.from('banks').select('id,name').order('name');
      if (error) {
        console.error('Error fetching banks:', error);
        return;
      }
      setBanks(data || []);
    } catch (error) {
      console.error('Error in fetchBanks:', error);
    }
  }

  async function fetchJobSectors() {
    try {
      const { data, error } = await supabase.from('job_sectors').select('id,name').order('name');
      if (error) {
        console.error('Error fetching job sectors:', error);
        return;
      }
      setJobSectors(data || []);
    } catch (error) {
      console.error('Error in fetchJobSectors:', error);
    }
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
    if (!name || !mobile) { 
      alert('الاسم ورقم الجوال مطلوبين'); 
      return; 
    }

    setSaving(true);

    try {
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
        created_by: employee?.id || null, // إضافة معرف المستخدم الذي أنشأ العميل
      };

      const res = await supabase.from('clients').insert(payload);
      if (res.error) { 
        alert(res.error.message); 
        return; 
      }

      alert('تم إضافة العميل بنجاح');
      resetForm();
      await fetchClients();
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      alert('حدث خطأ في حفظ البيانات');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClient(clientId: string) {
    // التحقق من الصلاحية
    if (employee?.role !== 'admin') {
      alert('لا تملك صلاحية حذف العملاء');
      return;
    }

    const confirmDelete = window.confirm('هل أنت متأكد من حذف العميل؟');
    if (!confirmDelete) return;

    try {
      // التحقق إذا كان العميل مرتبط بحجوزات
      const { count: reservationsCount } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId);

      if ((reservationsCount || 0) > 0) {
        alert('لا يمكن حذف عميل مرتبط بحجوزات');
        return;
      }

      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);

      if (error) {
        alert(error.message);
        return;
      }

      alert('تم حذف العميل بنجاح');
      await fetchClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('حدث خطأ في حذف العميل');
    }
  }

  async function handleEditClient(clientId: string) {
    // التحقق من الصلاحية
    if (employee?.role !== 'admin') {
      alert('لا تملك صلاحية تعديل العملاء');
      return;
    }

    try {
      // هنا يمكنك جلب بيانات العميل وتعبئة الفورم للتعديل
      // هذه مجرد رسالة توضيحية الآن
      alert('ميزة التعديل قيد التطوير');
    } catch (error) {
      console.error('Error editing client:', error);
    }
  }

  /* =====================
     UI
  ===================== */
  return (
    <RequireAuth>
      <div className="page">
        {/* FORM */}
        {(employee?.role === 'admin' || employee?.role === 'sales') && (
          <Card title="إضافة عميل">
            <div className="form-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Input 
                placeholder="اسم العميل" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
              />
              <Input 
                placeholder="رقم الجوال" 
                value={mobile} 
                onChange={(e) => setMobile(e.target.value)} 
              />
              <Input 
                placeholder="الإيميل" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
              />
              <select 
                value={identityType} 
                onChange={(e) => setIdentityType(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                {IDENTITY_TYPES.map(i => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
              <Input 
                placeholder="رقم الهوية" 
                value={identityNo} 
                onChange={(e) => setIdentityNo(e.target.value)} 
              />
              <select 
                value={eligible ? 'yes' : 'no'} 
                onChange={(e) => setEligible(e.target.value === 'yes')}
                style={{ minWidth: '120px' }}
              >
                <option value="yes">مستحق</option>
                <option value="no">غير مستحق</option>
              </select>
              <select 
                value={nationality} 
                onChange={(e) => setNationality(e.target.value as any)}
                style={{ minWidth: '120px' }}
              >
                <option value="saudi">سعودي</option>
                <option value="non_saudi">غير سعودي</option>
              </select>
              {nationality === 'non_saudi' && (
                <select 
                  value={residencyType} 
                  onChange={(e) => setResidencyType(e.target.value)}
                  style={{ minWidth: '150px' }}
                >
                  <option value="">نوع الإقامة</option>
                  {RESIDENCY_TYPES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              )}
              <select 
                value={salaryBankId} 
                onChange={(e) => setSalaryBankId(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="">بنك الراتب</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select 
                value={financeBankId} 
                onChange={(e) => setFinanceBankId(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="">بنك التمويل</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select 
                value={jobSectorId} 
                onChange={(e) => setJobSectorId(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="">القطاع الوظيفي</option>
                {jobSectors.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
              <Button 
                onClick={handleSubmit} 
                disabled={saving}
              >
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </Card>
        )}

        {/* جدول العملاء */}
        <Card title="قائمة العملاء">
          <Table headers={['الاسم', 'مستحق', 'الحالة', 'إجراء']}>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                  جاري تحميل العملاء...
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                  {employee?.role === 'sales' 
                    ? 'لم تقم بإضافة أي عملاء بعد' 
                    : 'لا يوجد عملاء'}
                </td>
              </tr>
            ) : (
              clients.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <span className={`badge ${c.eligible ? 'success' : 'danger'}`}>
                      {c.eligible ? 'مستحق' : 'غير مستحق'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge status-${c.status}`}>
                      {translateStatus(c.status)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button 
                        onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                      >
                        فتح
                      </Button>
                      {employee?.role === 'admin' && (
                        <>
                          <Button 
                            onClick={() => handleEditClient(c.id)}
                          >
                            تعديل
                          </Button>
                          <Button 
                            onClick={() => handleDeleteClient(c.id)}
                            variant="danger"
                          >
                            حذف
                          </Button>
                        </>
                      )}
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