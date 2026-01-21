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
  eligible: boolean;
  status: string;
  created_at: string;
  saved_by: string | null;
};

type Option = {
  id: string;
  name: string;
};

type Employee = {
  id: string;
  name: string;
  role: 'admin' | 'sales';
};

/* =====================
   Custom Badge Component
===================== */

function StatusBadge({ 
  children, 
  status = 'default' 
}: { 
  children: React.ReactNode;
  status?: 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'default';
}) {
  const colors = {
    success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
    warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7' },
    danger: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
    info: { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' },
    primary: { bg: '#cce5ff', color: '#004085', border: '#b8daff' },
    default: { bg: '#e2e3e5', color: '#383d41', border: '#d6d8db' }
  };

  const color = colors[status];

  return (
    <span
      style={{
        backgroundColor: color.bg,
        color: color.color,
        border: `1px solid ${color.border}`,
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600',
        display: 'inline-block'
      }}
    >
      {children}
    </span>
  );
}

/* =====================
   Constants
===================== */
const IDENTITY_TYPES = [
  { value: '', label: 'اختر نوع الهوية' },
  { value: 'national_id', label: 'الهوية الوطنية' },
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
    case 'converted': return 'تم البيع';
    default: return status;
  }
}

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'lead':
    case 'متابعة':
      return 'warning';
    case 'reserved':
    case 'محجوز':
      return 'info';
    case 'visited':
    case 'تمت الزيارة':
      return 'success';
    case 'converted':
    case 'تم البيع':
      return 'primary';
    default:
      return 'default';
  }
};

/* =====================
   Page
===================== */
export default function ClientsPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [banks, setBanks] = useState<Option[]>([]);
  const [jobSectors, setJobSectors] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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
      setUserLoading(false);
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
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, mobile, eligible, status, created_at, saved_by')
      .order('created_at', { ascending: false });
    
    if (error) { 
      console.error('Error fetching clients:', error);
      alert(error.message); 
      setLoading(false);
      return; 
    }
    
    setClients(data || []);
    setLoading(false);
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
    if (!name || !mobile) { 
      alert('الاسم ورقم الجوال مطلوبين'); 
      return; 
    }

    // التحقق من صحة رقم الجوال
    const mobileRegex = /^05\d{8}$/;
    if (!mobileRegex.test(mobile)) {
      alert('رقم الجوال غير صحيح. يجب أن يبدأ بـ 05 ويتكون من 10 أرقام');
      return;
    }

    // التحقق من البريد الإلكتروني إذا تم إدخاله
    if (email && !/\S+@\S+\.\S+/.test(email)) {
      alert('البريد الإلكتروني غير صحيح');
      return;
    }

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
      saved_by: employee?.id || null,
    };

    const res = await supabase.from('clients').insert(payload);
    if (res.error) { 
      alert(res.error.message); 
      return; 
    }

    alert('تم إضافة العميل بنجاح');
    resetForm();
    fetchClients();
  }

  /* =====================
     DELETE CLIENT (Admin Only)
  ===================== */
  async function deleteClient(clientId: string, clientName: string) {
    // التحقق من أن المستخدم الحالي هو admin
    if (employee?.role !== 'admin') {
      alert('غير مصرح لك بحذف العملاء. هذه الميزة متاحة للإداريين فقط.');
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف العميل "${clientName}"؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;

    try {
      // التحقق من وجود حجوزات للعميل
      const { data: reservations } = await supabase
        .from('reservations')
        .select('id')
        .eq('client_id', clientId)
        .limit(1);

      if (reservations && reservations.length > 0) {
        alert('لا يمكن حذف العميل لأنه لديه حجوزات. الرجاء حذف الحجوزات أولاً.');
        return;
      }

      // التحقق من وجود مبيعات للعميل
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('client_id', clientId)
        .limit(1);

      if (sales && sales.length > 0) {
        alert('لا يمكن حذف العميل لأنه لديه مبيعات. الرجاء حذف المبيعات أولاً.');
        return;
      }

      // حذف العميل
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);

      if (error) {
        alert(`خطأ في الحذف: ${error.message}`);
        return;
      }

      alert('تم حذف العميل بنجاح');
      fetchClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('حدث خطأ أثناء حذف العميل');
    }
  }

  /* =====================
     FILTERED CLIENTS
  ===================== */
  const filteredClients = clients.filter(client => {
    const searchLower = searchTerm.toLowerCase();
    return (
      client.name.toLowerCase().includes(searchLower) ||
      client.mobile.includes(searchTerm) ||
      client.id.toLowerCase().includes(searchLower)
    );
  });

  /* =====================
     Loading State
  ===================== */
  if (userLoading) {
    return (
      <div className="page" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '50px', 
            height: '50px', 
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <div style={{ color: '#666' }}>جاري التحقق من الصلاحيات...</div>
        </div>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <RequireAuth>
      <div className="page">
        
        {/* ===== HEADER ===== */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '15px',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom: '1px solid #eee'
        }}>
          <div>
            <h1 style={{ 
              margin: '0 0 10px 0',
              color: '#2c3e50',
              fontSize: '28px'
            }}>
              إدارة العملاء
            </h1>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <StatusBadge status="info">
                إجمالي العملاء: {clients.length}
              </StatusBadge>
              {employee?.role === 'admin' && (
                <StatusBadge status="success">
                  🛡️ وضع مدير النظام
                </StatusBadge>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Input 
              placeholder="🔍 بحث بالاسم، الجوال، أو الرقم..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ minWidth: '250px' }}
            />
          </div>
        </div>

        {/* ===== ADD CLIENT FORM (Visible to all sales and admin) ===== */}
        {(employee?.role === 'admin' || employee?.role === 'sales') && (
          <div style={{ marginBottom: '30px' }}>
            <Card title="➕ إضافة عميل جديد">
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                gap: '15px',
                padding: '20px'
              }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    اسم العميل *
                  </label>
                  <Input 
                    placeholder="أدخل الاسم الكامل" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    رقم الجوال *
                  </label>
                  <Input 
                    placeholder="05xxxxxxxx" 
                    value={mobile} 
                    onChange={(e) => setMobile(e.target.value)} 
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    البريد الإلكتروني
                  </label>
                  <Input 
                    placeholder="example@email.com" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    الحالة الاستحقاقية
                  </label>
                  <select 
                    value={eligible ? 'yes' : 'no'} 
                    onChange={(e) => setEligible(e.target.value === 'yes')}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                  >
                    <option value="yes">✅ مستحق</option>
                    <option value="no">❌ غير مستحق</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    الجنسية
                  </label>
                  <select 
                    value={nationality} 
                    onChange={(e) => setNationality(e.target.value as any)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                  >
                    <option value="saudi">🇸🇦 سعودي</option>
                    <option value="non_saudi">🌍 غير سعودي</option>
                  </select>
                </div>
                
                {nationality === 'non_saudi' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                      نوع الإقامة
                    </label>
                    <select 
                      value={residencyType} 
                      onChange={(e) => setResidencyType(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                    >
                      <option value="">اختر نوع الإقامة</option>
                      {RESIDENCY_TYPES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    نوع الهوية
                  </label>
                  <select 
                    value={identityType} 
                    onChange={(e) => setIdentityType(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                  >
                    {IDENTITY_TYPES.map(i => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    رقم الهوية
                  </label>
                  <Input 
                    placeholder="رقم الهوية/الإقامة" 
                    value={identityNo} 
                    onChange={(e) => setIdentityNo(e.target.value)} 
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    بنك الراتب
                  </label>
                  <select 
                    value={salaryBankId} 
                    onChange={(e) => setSalaryBankId(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                  >
                    <option value="">اختر بنك الراتب</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    بنك التمويل
                  </label>
                  <select 
                    value={financeBankId} 
                    onChange={(e) => setFinanceBankId(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                  >
                    <option value="">اختر بنك التمويل</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    القطاع الوظيفي
                  </label>
                  <select 
                    value={jobSectorId} 
                    onChange={(e) => setJobSectorId(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                  >
                    <option value="">اختر القطاع الوظيفي</option>
                    {jobSectors.map(j => (
                      <option key={j.id} value={j.id}>{j.name}</option>
                    ))}
                  </select>
                </div>
                
                <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                  <Button 
                    onClick={handleSubmit} 
                    style={{ padding: '12px 30px', fontSize: '16px' }}
                  >
                    💾 حفظ العميل
                  </Button>
                  <Button 
                    onClick={resetForm} 
                    variant="secondary" 
                    style={{ marginLeft: '10px', padding: '12px 20px' }}
                  >
                    🔄 مسح النموذج
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ===== CLIENTS TABLE ===== */}
        <Card title={`📋 قائمة العملاء (${filteredClients.length})`}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ color: '#666' }}>جاري تحميل بيانات العملاء...</div>
            </div>
          ) : filteredClients.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px', 
              backgroundColor: '#f8f9fa', 
              borderRadius: '8px',
              border: '1px dashed #dee2e6'
            }}>
              <div style={{ fontSize: '18px', marginBottom: '10px', color: '#6c757d' }}>
                {searchTerm ? 'لا توجد نتائج للبحث' : 'لا يوجد عملاء'}
              </div>
              {searchTerm && (
                <Button 
                  onClick={() => setSearchTerm('')}
                  variant="secondary"
                  style={{ marginTop: '10px' }}
                >
                  عرض جميع العملاء
                </Button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table headers={['الاسم', 'الجوال', 'الحالة', 'تاريخ التسجيل', 'الإجراءات']}>
                {filteredClients.map(client => (
                  <tr key={client.id}>
                    <td style={{ fontWeight: '600' }}>
                      {client.name}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{client.mobile}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(client.mobile);
                            alert('تم نسخ رقم الجوال');
                          }}
                          style={{
                            padding: '2px 6px',
                            fontSize: '10px',
                            backgroundColor: '#f8f9fa',
                            border: '1px solid #dee2e6',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            color: '#495057'
                          }}
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={getStatusColor(client.status)}>
                        {translateStatus(client.status)}
                      </StatusBadge>
                    </td>
                    <td>
                      {new Date(client.created_at).toLocaleDateString('ar-SA')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <Button 
                          onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                          variant="secondary"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                          👁️ عرض
                        </Button>
                        
                        {/* عرض زر التعديل فقط للإدمن */}
                        {employee?.role === 'admin' && (
                          <Button 
                            onClick={() => router.push(`/dashboard/clients/${client.id}/edit`)}
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                          >
                            ✏️ تعديل
                          </Button>
                        )}
                        
                        {/* عرض زر الحذف فقط للإدمن */}
                        {employee?.role === 'admin' && (
                          <Button 
                            onClick={() => deleteClient(client.id, client.name)}
                            variant="danger"
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                          >
                            🗑️ حذف
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>

        {/* ===== FOOTER INFO ===== */}
        <div style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#6c757d',
          textAlign: 'center',
          border: '1px dashed #dee2e6'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <span>المستخدم الحالي: {employee?.name || 'غير معروف'}</span>
            <span>الدور: {employee?.role === 'admin' ? 'مدير النظام' : 'مندوب مبيعات'}</span>
            <span>آخر تحديث: {new Date().toLocaleString('ar-SA')}</span>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}