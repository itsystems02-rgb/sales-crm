'use client';

import { useEffect, useMemo, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Client = {
  id: string;
  name: string;
};

type Reservation = {
  id: string;
  unit_id: string;
  reservation_date: string;
  status: string;
  project_id?: string;
};

type Unit = {
  id: string;
  unit_code: string;
  project_id: string;
  status: string;
};

type Project = {
  id: string;
  name: string;
};

/* =====================
   Constants
===================== */

const CONTRACT_TYPES = [
  { value: '', label: 'اختر نوع العقد' },
  { value: 'direct', label: 'مباشر' },
  { value: 'mortgage', label: 'رهن' },
  { value: 'installment', label: 'تقسيط' },
];

const FINANCE_TYPES = [
  { value: '', label: 'اختر نوع التمويل' },
  { value: 'cash', label: 'نقدي' },
  { value: 'bank', label: 'بنكي' },
  { value: 'mortgage', label: 'رهن عقاري' },
];

/* =====================
   Page
===================== */

export default function NewSalePage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [employee, setEmployee] = useState<{ id: string; role: string; project_id?: string } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  const [clientId, setClientId] = useState('');
  const [reservationId, setReservationId] = useState('');

  const [form, setForm] = useState({
    contract_support_no: '',
    contract_talad_no: '',
    contract_type: '',
    finance_type: '',
    finance_entity: '',
    sale_date: '',
    price_before_tax: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebugInfo = (info: string) => {
    setDebugInfo(prev => [...prev.slice(-5), info]); // حفظ آخر 5 رسائل فقط
  };

  /* =====================
     Initial Load
  ===================== */

  useEffect(() => {
    initializePage();
  }, []);

  async function initializePage() {
    try {
      setLoading(true);
      addDebugInfo('بدء تهيئة الصفحة...');
      
      // 1. جلب بيانات الموظف
      addDebugInfo('جاري جلب بيانات الموظف...');
      const emp = await getCurrentEmployee();
      if (!emp) {
        setError('لم يتم العثور على بيانات الموظف');
        addDebugInfo('خطأ: لم يتم العثور على بيانات الموظف');
        return;
      }
      setEmployee(emp);
      addDebugInfo(`تم جلب بيانات الموظف: ${emp.role}`);
      
      // 2. جلب جميع العملاء الذين لديهم حجوزات في المشاريع المسموحة
      addDebugInfo('جاري جلب العملاء...');
      await fetchAllClientsWithReservations(emp);
      
      // 3. محاولة جلب المشاريع
      try {
        let query = supabase
          .from('projects')
          .select('id, name')
          .eq('status', 'active');

        // تطبيق الفلترة حسب الدور
        if (emp?.role === 'sales' || emp?.role === 'sales_manager') {
          const { data: employeeProjects } = await supabase
            .from('employee_projects')
            .select('project_id')
            .eq('employee_id', emp.id);

          const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
          if (allowedProjectIds.length > 0) {
            query = query.in('id', allowedProjectIds);
          } else {
            setProjects([]);
            addDebugInfo('لا توجد مشاريع مسموحة للموظف');
            return;
          }
        }

        const { data: projectsData, error: projectsError } = await query.limit(10);

        if (projectsError) {
          addDebugInfo(`تحذير: حدث خطأ في جلب المشاريع: ${projectsError.message}`);
          console.warn('Error fetching projects:', projectsError);
        } else {
          setProjects(projectsData || []);
          addDebugInfo(`تم جلب ${projectsData?.length || 0} مشروع`);
        }
      } catch (projectsErr) {
        addDebugInfo(`تحذير: استثناء في جلب المشاريع: ${projectsErr}`);
        console.warn('Exception fetching projects:', projectsErr);
      }
      
    } catch (error) {
      console.error('Error in initializePage:', error);
      setError(`حدث خطأ في تهيئة الصفحة: ${error}`);
      addDebugInfo(`خطأ في التهيئة: ${error}`);
    } finally {
      setLoading(false);
      addDebugInfo('اكتمل التحميل');
    }
  }

  async function fetchAllClientsWithReservations(emp: any) {
    try {
      addDebugInfo('بدء جلب العملاء...');
      
      // جلب المشاريع المسموحة للموظف أولاً
      let allowedProjectIds: string[] = [];
      
      if (emp?.role === 'sales' || emp?.role === 'sales_manager') {
        const { data: employeeProjects, error: projectsError } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        if (projectsError) {
          console.error('Error fetching employee projects:', projectsError);
          setError('حدث خطأ في تحميل المشاريع المسموحة');
          addDebugInfo(`خطأ في جلب مشاريع الموظف: ${projectsError.message}`);
          return;
        }

        allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        
        if (allowedProjectIds.length === 0) {
          setClients([]);
          addDebugInfo('لا توجد مشاريع مسموحة للموظف');
          return;
        }
        
        addDebugInfo(`المشاريع المسموحة: ${allowedProjectIds.length} مشروع`);
      }

      // جلب كل العملاء النشطين
      const { data: allClients, error: clientsError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
        .limit(100);

      if (clientsError) {
        console.error('Error fetching clients:', clientsError);
        setError('حدث خطأ في تحميل العملاء');
        addDebugInfo(`خطأ في جلب العملاء: ${clientsError.message}`);
        return;
      }

      if (!allClients || allClients.length === 0) {
        setClients([]);
        addDebugInfo('لم يتم العثور على عملاء');
        return;
      }

      addDebugInfo(`تم العثور على ${allClients.length} عميل`);

      // جلب الحجوزات مع فلترة بالمشاريع المسموحة
      let query = supabase
        .from('reservations')
        .select('client_id, unit_id, units!inner(project_id)')
        .eq('status', 'active');

      // تطبيق فلترة المشاريع للموظفين
      if (emp?.role === 'sales' || emp?.role === 'sales_manager') {
        query = query.in('units.project_id', allowedProjectIds);
      }

      const { data: reservationsData, error: reservationsError } = await query;

      if (reservationsError) {
        console.error('Error checking reservations:', reservationsError);
        // في حالة الخطأ، عرض كل العملاء للمسؤول فقط
        if (emp?.role === 'admin') {
          setClients(allClients);
          addDebugInfo(`عرض كل العملاء (${allClients.length}) للمسؤول`);
        } else {
          setClients([]);
          addDebugInfo('لا يمكن جلب الحجوزات للمشاريع المسموحة');
        }
        return;
      }

      // استخراج العملاء الذين لديهم حجوزات
      const uniqueClientIds = [...new Set(reservationsData?.map(r => r.client_id) || [])];
      const clientsWithReservations = allClients.filter(client => 
        uniqueClientIds.includes(client.id)
      );

      setClients(clientsWithReservations);
      addDebugInfo(`العملاء الذين لديهم حجوزات في مشاريعي: ${clientsWithReservations.length}`);
      
    } catch (error) {
      console.error('Error in fetchAllClientsWithReservations:', error);
      setError('حدث خطأ في تحميل العملاء');
      addDebugInfo(`خطأ: ${error}`);
    }
  }

  async function fetchReservations(cid: string) {
    try {
      setLoading(true);
      addDebugInfo(`جاري جلب حجوزات العميل ${cid}...`);
      
      let query = supabase
        .from('reservations')
        .select(`
          id, 
          unit_id, 
          reservation_date, 
          status,
          unit:units(project_id, unit_code)
        `)
        .eq('client_id', cid)
        .eq('status', 'active');

      // فلترة الحجوزات بالمشاريع المسموحة للموظفين
      if (employee?.role === 'sales' || employee?.role === 'sales_manager') {
        // جلب المشاريع المسموحة للموظف
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', employee.id);
        
        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        
        if (allowedProjectIds.length > 0) {
          query = query.in('units.project_id', allowedProjectIds);
          addDebugInfo(`فلترة الحجوزات ب ${allowedProjectIds.length} مشروع`);
        } else {
          setReservations([]);
          addDebugInfo('لا توجد مشاريع مسموحة للموظف');
          return;
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching reservations:', error);
        setReservations([]);
        setError('حدث خطأ في تحميل الحجوزات');
        addDebugInfo(`خطأ في جلب الحجوزات: ${error.message}`);
      } else {
        // تحويل البيانات
        const formattedData = (data || []).map((item: any) => ({
          id: item.id,
          unit_id: item.unit_id,
          reservation_date: item.reservation_date,
          status: item.status,
          project_id: item.unit?.[0]?.project_id || item.unit?.project_id,
          unit_code: item.unit?.[0]?.unit_code || ''
        }));
        
        setReservations(formattedData);
        addDebugInfo(`تم جلب ${formattedData.length} حجز للعميل في مشاريعي`);
      }

      // reset
      setReservationId('');
      setUnit(null);
      
    } catch (error) {
      console.error('Error in fetchReservations:', error);
      setReservations([]);
      setError('حدث خطأ في تحميل الحجوزات');
      addDebugInfo(`خطأ في جلب الحجوزات: ${error}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUnit(unitId: string) {
    try {
      setLoading(true);
      addDebugInfo(`جاري جلب بيانات الوحدة ${unitId}...`);
      
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_code, project_id, status')
        .eq('id', unitId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching unit:', error);
        setUnit(null);
        setError('حدث خطأ في تحميل بيانات الوحدة');
        addDebugInfo(`خطأ في جلب الوحدة: ${error.message}`);
        return;
      }

      setUnit(data || null);
      if (data) {
        addDebugInfo(`تم جلب الوحدة: ${data.unit_code} (${data.status})`);
      }
      
    } catch (error) {
      console.error('Error in fetchUnit:', error);
      setUnit(null);
      setError('حدث خطأ في تحميل بيانات الوحدة');
      addDebugInfo(`خطأ في جلب الوحدة: ${error}`);
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     Validation
  ===================== */

  function validateForm(): boolean {
    if (!clientId) {
      setError('الرجاء اختيار العميل');
      return false;
    }

    if (!reservationId) {
      setError('الرجاء اختيار الحجز');
      return false;
    }

    if (!unit) {
      setError('الرجاء اختيار الحجز أولاً');
      return false;
    }

    if (!form.sale_date) {
      setError('تاريخ البيع مطلوب');
      return false;
    }

    // التحقق من أن التاريخ ليس مستقبلياً
    const today = new Date().toISOString().split('T')[0];
    if (form.sale_date > today) {
      setError('لا يمكن اختيار تاريخ مستقبلي');
      return false;
    }

    if (!form.price_before_tax || Number(form.price_before_tax) <= 0) {
      setError('سعر البيع يجب أن يكون أكبر من صفر');
      return false;
    }

    return true;
  }

  function getUnitStatusText(status: string): string {
    switch (status) {
      case 'available': return 'متاحة';
      case 'reserved': return 'محجوزة';
      case 'sold': return 'مباعة';
      default: return status;
    }
  }

  /* =====================
     Submit
  ===================== */

  const clientHasActiveReservations = useMemo(
    () => clientId ? reservations.length > 0 : true,
    [clientId, reservations.length]
  );

  const canSubmit =
    !!clientId &&
    !!reservationId &&
    !!unit &&
    !!unit.project_id &&
    !!employee?.id &&
    clientHasActiveReservations &&
    !!form.sale_date &&
    !!form.price_before_tax &&
    Number(form.price_before_tax) > 0;

  async function handleSubmit() {
    if (!validateForm() || !unit || !employee) return;

    setSubmitting(true);
    setError(null);
    addDebugInfo('بدء عملية البيع...');

    try {
      // التحقق من أن الوحدة محجوزة
      if (unit.status !== 'reserved') {
        setError('الوحدة ليست محجوزة. لا يمكن بيع وحدة غير محجوزة');
        setSubmitting(false);
        addDebugInfo('فشل: الوحدة ليست محجوزة');
        return;
      }

      // التحقق من عدم وجود عملية بيع سابقة للوحدة
      const { data: existingSale } = await supabase
        .from('sales')
        .select('id')
        .eq('unit_id', unit.id)
        .maybeSingle();

      if (existingSale) {
        setError('هذه الوحدة تم بيعها مسبقاً');
        setSubmitting(false);
        addDebugInfo('فشل: الوحدة مباعة مسبقاً');
        return;
      }

      // 1) insert sale
      const { error: saleError } = await supabase.from('sales').insert({
        client_id: clientId,
        unit_id: unit.id,
        project_id: unit.project_id,
        sales_employee_id: employee.id,

        contract_support_no: form.contract_support_no.trim() || null,
        contract_talad_no: form.contract_talad_no.trim() || null,
        contract_type: form.contract_type.trim() || null,
        finance_type: form.finance_type.trim() || null,
        finance_entity: form.finance_entity.trim() || null,

        sale_date: form.sale_date,
        price_before_tax: Number(form.price_before_tax),
      });

      if (saleError) {
        console.error('Sale insert error:', saleError);
        if (saleError.code === '23505') { // unique violation
          setError('هذه الوحدة تم بيعها مسبقاً');
        } else {
          setError(`حدث خطأ في حفظ عملية البيع: ${saleError.message}`);
        }
        setSubmitting(false);
        addDebugInfo(`فشل في إدراج البيع: ${saleError.message}`);
        return;
      }

      // 2) update statuses (بعد نجاح insert فقط)
      const updates = [];
      
      // تحديث حالة الحجز
      const { error: resErr } = await supabase
        .from('reservations')
        .update({ status: 'converted' })
        .eq('id', reservationId);
      
      if (resErr) {
        console.error('Reservation update error:', resErr);
        updates.push('الحجز');
        addDebugInfo(`تحذير: فشل تحديث الحجز: ${resErr.message}`);
      }

      // تحديث حالة الوحدة
      const { error: unitErr } = await supabase
        .from('units')
        .update({ status: 'sold' })
        .eq('id', unit.id);

      if (unitErr) {
        console.error('Unit update error:', unitErr);
        updates.push('الوحدة');
        addDebugInfo(`تحذير: فشل تحديث الوحدة: ${unitErr.message}`);
      }

      // تحديث حالة العميل
      const { error: clientErr } = await supabase
        .from('clients')
        .update({ status: 'converted' })
        .eq('id', clientId);

      if (clientErr) {
        console.error('Client update error:', clientErr);
        updates.push('العميل');
        addDebugInfo(`تحذير: فشل تحديث العميل: ${clientErr.message}`);
      }

      // إذا كانت هناك أخطاء في التحديثات
      if (updates.length > 0) {
        console.warn(`Failed to update: ${updates.join(', ')}`);
      }

      addDebugInfo('تم تنفيذ عملية البيع بنجاح!');
      alert('تم تنفيذ عملية البيع بنجاح!');
      router.push('/dashboard/sales');

    } catch (error: any) {
      console.error('Error in handleSubmit:', error);
      setError(error.message || 'حدث خطأ غير متوقع');
      addDebugInfo(`خطأ في التنفيذ: ${error}`);
    } finally {
      setSubmitting(false);
    }
  }

  /* =====================
     Handlers
  ===================== */

  function handleClientChange(e: ChangeEvent<HTMLSelectElement>) {
    const cid = e.target.value;
    setClientId(cid);
    setError(null);
    addDebugInfo(`تم اختيار العميل: ${cid}`);
    if (cid) {
      fetchReservations(cid);
    } else {
      setReservations([]);
      setReservationId('');
      setUnit(null);
    }
  }

  function handleReservationChange(e: ChangeEvent<HTMLSelectElement>) {
    const rid = e.target.value;
    setReservationId(rid);
    setError(null);
    addDebugInfo(`تم اختيار الحجز: ${rid}`);
    const r = reservations.find(x => x.id === rid);
    if (r) {
      fetchUnit(r.unit_id);
    } else {
      setUnit(null);
    }
  }

  function handleFormChange(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  }

  // معالجة تغيير تاريخ البيع مع التحقق
  function handleSaleDateChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const today = new Date().toISOString().split('T')[0];
    
    if (value > today) {
      setError('لا يمكن اختيار تاريخ مستقبلي');
    } else {
      setError(null);
    }
    
    setForm(prev => ({ ...prev, sale_date: value }));
  }

  function handleCancel() {
    if (window.confirm('هل تريد إلغاء عملية البيع؟ سيتم فقدان جميع البيانات المدخلة.')) {
      router.push('/dashboard/sales');
    }
  }

  function handleRefresh() {
    if (window.confirm('هل تريد تحديث البيانات؟')) {
      initializePage();
    }
  }

  /* =====================
     UI
  ===================== */

  return (
    <div className="page">
      {/* ===== TABS ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10, marginBottom: '20px', alignItems: 'center' }}>
        <Button onClick={() => router.push('/dashboard/sales')}>
          التنفيذات
        </Button>
        <Button variant="primary">تنفيذ جديد</Button>
        <div style={{ marginLeft: 'auto' }}>
          <Button 
            onClick={handleRefresh}
            variant="secondary"
          >
            تحديث البيانات
          </Button>
        </div>
      </div>

      {/* ===== معلومات المشاريع المسموحة ===== */}
      {employee && (employee.role === 'sales' || employee.role === 'sales_manager') && (
        <div style={{ 
          marginTop: '10px', 
          padding: '10px', 
          backgroundColor: '#e6f4ea', 
          borderRadius: '4px',
          fontSize: '13px',
          color: '#0d8a3e',
          border: '1px solid #c6f6d5'
        }}>
          <strong>ملاحظة:</strong> يتم عرض العملاء الذين لديهم حجوزات في المشاريع المسموحة لك فقط.
          {projects.length > 0 && (
            <div style={{ marginTop: '5px', fontSize: '12px' }}>
              المشاريع المسموحة لك: {projects.map(p => p.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* ===== ERROR MESSAGE ===== */}
      {error && (
        <div style={{
          backgroundColor: '#ffebee',
          color: '#c62828',
          padding: '12px 16px',
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #ffcdd2',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      <div className="details-layout">
        <Card title="تنفيذ بيع وحدة">
          <div className="details-grid" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
            padding: '20px'
          }}>

            {/* العميل */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                العميل *
              </label>
              <select
                value={clientId}
                onChange={handleClientChange}
                disabled={loading}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: clientId ? '#fff' : '#f9f9f9',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                <option value="">
                  {loading ? 'جاري التحميل...' : 
                   employee?.role === 'sales' || employee?.role === 'sales_manager' ? 
                   'اختر العميل (من مشاريعك فقط)' : 
                   'اختر العميل'}
                </option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {!loading && clients.length === 0 && (
                <small style={{ color: '#c00', fontSize: '12px', marginTop: '4px' }}>
                  {employee?.role === 'sales' || employee?.role === 'sales_manager' 
                    ? 'لا توجد عملاء لديهم حجوزات في المشاريع المسموحة لك' 
                    : 'لم يتم العثور على عملاء لديهم حجوزات نشطة'}
                </small>
              )}

              {clientId && !clientHasActiveReservations && (
                <small style={{ color: '#c00', fontSize: '12px', marginTop: '4px' }}>
                  هذا العميل لا يمتلك حجوزات نشطة
                </small>
              )}
            </div>

            {/* الحجز */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                الحجز *
              </label>
              <select
                value={reservationId}
                disabled={!clientId || reservations.length === 0 || loading}
                onChange={handleReservationChange}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: !clientId || reservations.length === 0 ? '#f9f9f9' : '#fff',
                  cursor: !clientId || reservations.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: !clientId || reservations.length === 0 ? 0.7 : 1
                }}
              >
                <option value="">
                  {!clientId ? 'اختر العميل أولاً' : 
                   loading ? 'جاري التحميل...' :
                   reservations.length === 0 ? 'لا توجد حجوزات نشطة' : 
                   'اختر الحجز'}
                </option>
                {reservations.map(r => {
                  return (
                    <option key={r.id} value={r.id}>
                      حجز بتاريخ {new Date(r.reservation_date).toLocaleDateString('ar-SA')} 
                      {r.project_id && ` (مشروع ID: ${r.project_id})`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* الوحدة */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                الوحدة
              </label>
              <input 
                value={unit ? `${unit.unit_code} ${unit.status ? `(${getUnitStatusText(unit.status)})` : ''}` : ''} 
                disabled
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#f9f9f9',
                  color: unit?.status === 'sold' ? '#c00' : '#666'
                }}
              />
            </div>

            {/* رقم عقد الدعم */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                رقم عقد الدعم
              </label>
              <input
                type="text"
                value={form.contract_support_no}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('contract_support_no', e.target.value)}
                placeholder="اختياري"
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  width: '100%'
                }}
              />
            </div>

            {/* رقم عقد تلاد */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                رقم عقد تلاد
              </label>
              <input
                type="text"
                value={form.contract_talad_no}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('contract_talad_no', e.target.value)}
                placeholder="اختياري"
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  width: '100%'
                }}
              />
            </div>

            {/* نوع العقد */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                نوع العقد
              </label>
              <select
                value={form.contract_type}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => handleFormChange('contract_type', e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                {CONTRACT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* نوع التمويل */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                نوع التمويل
              </label>
              <select
                value={form.finance_type}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => handleFormChange('finance_type', e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                {FINANCE_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* اسم الجهة التمويلية */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                اسم الجهة التمويلية
              </label>
              <input
                type="text"
                value={form.finance_entity}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('finance_entity', e.target.value)}
                placeholder="مثال: البنك الأهلي"
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  width: '100%'
                }}
              />
            </div>

            {/* تاريخ بيع الوحدة */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                تاريخ بيع الوحدة *
              </label>
              <input
                type="date"
                value={form.sale_date}
                onChange={handleSaleDateChange}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  width: '100%'
                }}
              />
            </div>

            {/* سعر بيع الوحدة قبل الضريبة */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                سعر بيع الوحدة قبل الضريبة *
              </label>
              <input
                type="number"
                value={form.price_before_tax}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('price_before_tax', e.target.value)}
                min="0"
                step="0.01"
                placeholder="0.00"
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  width: '100%'
                }}
              />
            </div>

          </div>
        </Card>
      </div>

      {/* ===== ACTIONS ===== */}
      <div style={{ 
        display: 'flex', 
        gap: 10, 
        marginTop: '30px',
        padding: '20px',
        backgroundColor: '#f9f9f9',
        borderRadius: '4px',
        border: '1px solid #eee',
        flexWrap: 'wrap'
      }}>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting || loading}
          variant="primary"
        >
          {submitting ? 'جاري الحفظ...' : 'تأكيد التنفيذ'}
        </Button>
        
        <Button
          onClick={handleCancel}
          variant="danger"
        >
          إلغاء
        </Button>
      </div>

      {/* ===== INFO BOX ===== */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px 20px', 
        backgroundColor: '#f0f7ff', 
        borderRadius: '4px',
        border: '1px solid #d0e7ff',
        fontSize: '14px',
        color: '#0056b3'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#0056b3' }}>معلومات هامة:</h4>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li>بعد تأكيد البيع سيتم تغيير حالة الوحدة إلى "مباعة"</li>
          <li>سيتم تغيير حالة العميل إلى "تم البيع"</li>
          <li>سيتم تغيير حالة الحجز إلى "تم التحويل"</li>
          <li>لا يمكن التراجع عن عملية البيع بعد تأكيدها</li>
          <li>الحقول المميزة بعلامة (*) إجبارية</li>
          <li>لا يمكن اختيار تاريخ بيع مستقبلي</li>
          <li>تأكد من أن الوحدة محجوزة قبل عملية البيع</li>
          <li>تأكد من عدم وجود عملية بيع سابقة للوحدة</li>
          <li>يتم عرض العملاء الذين لديهم حجوزات نشطة فقط</li>
          <li>يتم عرض العملاء من المشاريع المسموحة لك فقط</li>
        </ul>
      </div>

      {/* ===== DEBUG INFO (للأغراض التنفيذية فقط) ===== */}
      <div style={{ 
        marginTop: '10px', 
        padding: '10px 15px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '4px',
        fontSize: '12px',
        color: '#666',
        maxHeight: '200px',
        overflowY: 'auto'
      }}>
        <h5 style={{ margin: '0 0 5px 0', color: '#333' }}>معلومات التصحيح:</h5>
        <div style={{ fontFamily: 'monospace' }}>
          {debugInfo.length === 0 ? (
            <div>جاري التحميل...</div>
          ) : (
            debugInfo.map((info, index) => (
              <div key={index} style={{ marginBottom: '2px' }}>
                [{new Date().toLocaleTimeString()}] {info}
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #ddd' }}>
          <div><strong>حالة التحميل:</strong> {loading ? 'جاري التحميل...' : 'مكتمل'}</div>
          <div><strong>العملاء المتاحين:</strong> {clients.length} عميل</div>
          <div><strong>الحجوزات المتاحة:</strong> {reservations.length} حجز</div>
          <div><strong>الوحدة المختارة:</strong> {unit ? unit.unit_code : 'لا يوجد'}</div>
          <div><strong>دور الموظف:</strong> {employee?.role || 'غير محدد'}</div>
          <div><strong>المشاريع المسموحة:</strong> {projects.length} مشروع</div>
        </div>
      </div>

    </div>
  );
}