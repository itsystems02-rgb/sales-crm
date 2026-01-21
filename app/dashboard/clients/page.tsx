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
  mobile: string;
  email: string | null;
  eligible: boolean;
  status: string;
  nationality: 'saudi' | 'non_saudi';
  created_at: string;
  created_by: string | null;
};

type ClientDetail = ClientListItem & {
  identity_type: string | null;
  identity_no: string | null;
  residency_type: string | null;
  salary_bank_id: string | null;
  finance_bank_id: string | null;
  job_sector_id: string | null;
  bank_salary: { name: string } | null;
  bank_finance: { name: string } | null;
  job_sector: { name: string } | null;
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
    case 'completed': return 'مكتمل';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        await fetchClients(emp);
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
  async function fetchClients(emp: Employee | null = null) {
    try {
      let query = supabase
        .from('clients')
        .select('id,name,mobile,email,eligible,status,nationality,created_at,created_by')
        .order('created_at', { ascending: false });

      // إذا كان مندوب مبيعات، يرى فقط العملاء الذي أضافهم هو
      if (emp && emp.role === 'sales') {
        query = query.eq('created_by', emp.id);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching clients:', error);
        alert('حدث خطأ في تحميل العملاء');
        return;
      }
      
      setClients(data || []);
    } catch (error) {
      console.error('Error in fetchClients:', error);
      setClients([]);
    }
  }

  async function fetchClientDetails(id: string) {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          bank_salary:salary_bank_id(id, name),
          bank_finance:finance_bank_id(id, name),
          job_sector:job_sector_id(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as ClientDetail;
    } catch (error) {
      console.error('Error fetching client details:', error);
      return null;
    }
  }

  async function fetchBanks() {
    try {
      const { data, error } = await supabase
        .from('banks')
        .select('id,name')
        .order('name');
        
      if (error) throw error;
      setBanks(data || []);
    } catch (error) {
      console.error('Error fetching banks:', error);
      setBanks([]);
    }
  }

  async function fetchJobSectors() {
    try {
      const { data, error } = await supabase
        .from('job_sectors')
        .select('id,name')
        .order('name');
        
      if (error) throw error;
      setJobSectors(data || []);
    } catch (error) {
      console.error('Error fetching job sectors:', error);
      setJobSectors([]);
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

  async function startEdit(clientId: string) {
    if (!employee || employee.role !== 'admin') {
      alert('لا تملك صلاحية تعديل العملاء');
      return;
    }

    try {
      const client = await fetchClientDetails(clientId);
      if (!client) {
        alert('لم يتم العثور على بيانات العميل');
        return;
      }

      setEditingId(client.id);
      setName(client.name);
      setMobile(client.mobile);
      setEmail(client.email || '');
      setIdentityType(client.identity_type || '');
      setIdentityNo(client.identity_no || '');
      setEligible(client.eligible);
      setNationality(client.nationality);
      setResidencyType(client.residency_type || '');
      setSalaryBankId(client.salary_bank_id || '');
      setFinanceBankId(client.finance_bank_id || '');
      setJobSectorId(client.job_sector_id || '');
    } catch (error) {
      console.error('Error starting edit:', error);
      alert('حدث خطأ في تحميل بيانات العميل');
    }
  }

  function validateMobile(mobile: string): boolean {
    // تحقق من رقم الجوال السعودي (يبدأ بـ 05 ويتكون من 10 أرقام)
    return /^05\d{8}$/.test(mobile);
  }

  function validateEmail(email: string): boolean {
    if (!email) return true; // الإيميل اختياري
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async function handleSubmit() {
    // التحقق من الصلاحية للتعديل
    if (editingId && employee?.role !== 'admin') {
      alert('لا تملك صلاحية تعديل العملاء');
      return;
    }

    // التحقق من الحقول المطلوبة
    if (!name.trim()) {
      alert('اسم العميل مطلوب');
      return;
    }

    if (!mobile.trim()) {
      alert('رقم الجوال مطلوب');
      return;
    }

    // تحقق من صحة رقم الجوال
    if (!validateMobile(mobile)) {
      alert('رقم الجوال غير صحيح. يجب أن يبدأ بـ 05 ويتكون من 10 أرقام');
      return;
    }

    // تحقق من صحة الإيميل
    if (email && !validateEmail(email)) {
      alert('البريد الإلكتروني غير صحيح');
      return;
    }

    setSaving(true);

    try {
      const payload: any = {
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim() || null,
        identity_type: identityType || null,
        identity_no: identityNo.trim() || null,
        eligible,
        nationality,
        status: 'lead',
      };

      // فقط عند الإضافة، نضيف created_by
      if (!editingId && employee) {
        payload.created_by = employee.id;
      }

      // إضافة الحقول الخاصة بغير السعوديين
      if (nationality === 'non_saudi') {
        payload.residency_type = residencyType || null;
      } else {
        payload.residency_type = null;
      }

      // إضافة الحقول الاختيارية
      if (salaryBankId) payload.salary_bank_id = salaryBankId;
      if (financeBankId) payload.finance_bank_id = financeBankId;
      if (jobSectorId) payload.job_sector_id = jobSectorId;

      let res;
      if (editingId) {
        res = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editingId);
      } else {
        res = await supabase.from('clients').insert(payload);
      }

      if (res.error) {
        console.error('Error saving client:', res.error);
        alert(res.error.message);
        return;
      }

      alert(editingId ? 'تم تحديث بيانات العميل بنجاح' : 'تم إضافة العميل بنجاح');
      resetForm();
      await fetchClients(employee);
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      alert('حدث خطأ في حفظ البيانات');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClient(clientId: string) {
    if (!employee || employee.role !== 'admin') {
      alert('لا تملك صلاحية حذف العملاء');
      return;
    }

    // التحقق إذا كان العميل مرتبط بحجوزات
    try {
      const { count: reservationsCount } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId);

      if ((reservationsCount || 0) > 0) {
        alert('لا يمكن حذف عميل مرتبط بحجوزات');
        return;
      }

      // التحقق إذا كان العميل مرتبط بعمليات بيع
      const { count: salesCount } = await supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId);

      if ((salesCount || 0) > 0) {
        alert('لا يمكن حذف عميل مرتبط بعمليات بيع');
        return;
      }

      const confirmDelete = window.confirm('هل أنت متأكد من حذف العميل؟ لا يمكن التراجع عن هذا الإجراء.');
      if (!confirmDelete) return;

      setDeletingId(clientId);

      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);

      if (error) {
        console.error('Error deleting client:', error);
        alert(error.message);
        return;
      }

      alert('تم حذف العميل بنجاح');
      await fetchClients(employee);
    } catch (error) {
      console.error('Error in handleDeleteClient:', error);
      alert('حدث خطأ في حذف العميل');
    } finally {
      setDeletingId(null);
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
          <Card title={editingId ? 'تعديل عميل' : 'إضافة عميل'}>
            <div className="form-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Input
                placeholder="اسم العميل *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                placeholder="رقم الجوال * (مثال: 0512345678)"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
              />
              <Input
                type="email"
                placeholder="الإيميل (اختياري)"
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
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              
              <select 
                value={financeBankId} 
                onChange={(e) => setFinanceBankId(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="">بنك التمويل</option>
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              
              <select 
                value={jobSectorId} 
                onChange={(e) => setJobSectorId(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="">القطاع الوظيفي</option>
                {jobSectors.map(j => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
              
              <Button 
                onClick={handleSubmit} 
                disabled={saving || !name.trim() || !mobile.trim()}
              >
                {saving ? 'جاري الحفظ...' : editingId ? 'تحديث' : 'حفظ'}
              </Button>
              
              {editingId && (
                <Button 
                  onClick={resetForm} 
                  variant="danger"
                >
                  إلغاء
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* جدول العملاء */}
        <Card title="قائمة العملاء">
          <Table headers={['الاسم', 'الجوال', 'مستحق', 'الحالة', 'الجنسية', 'إجراء']}>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                  جاري تحميل العملاء...
                </td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                  {employee?.role === 'sales' 
                    ? 'لم تقم بإضافة أي عملاء بعد' 
                    : 'لا يوجد عملاء'}
                </td>
              </tr>
            ) : (
              clients.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.mobile}</td>
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
                  <td>{c.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button 
                        onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                        size="small"
                      >
                        فتح
                      </Button>
                      
                      {employee?.role === 'admin' && (
                        <>
                          <Button 
                            onClick={() => startEdit(c.id)}
                            size="small"
                          >
                            تعديل
                          </Button>
                          
                          <Button 
                            onClick={() => handleDeleteClient(c.id)}
                            variant="danger"
                            size="small"
                            disabled={deletingId === c.id}
                          >
                            {deletingId === c.id ? 'جاري الحذف...' : 'حذف'}
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