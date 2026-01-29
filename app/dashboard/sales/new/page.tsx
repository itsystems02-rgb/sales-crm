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
  unit_code?: string;
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
    setDebugInfo(prev => [...prev.slice(-10), info]); // حفظ آخر 10 رسائل
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
      setDebugInfo([]);
      addDebugInfo('🚀 بدء تهيئة الصفحة...');
      
      // 1. جلب بيانات الموظف
      addDebugInfo('👤 جاري جلب بيانات الموظف...');
      const emp = await getCurrentEmployee();
      if (!emp) {
        setError('لم يتم العثور على بيانات الموظف');
        addDebugInfo('❌ خطأ: لم يتم العثور على بيانات الموظف');
        return;
      }
      setEmployee(emp);
      addDebugInfo(`✅ تم جلب بيانات الموظف: ${emp.role} (ID: ${emp.id})`);
      
      // 2. جلب المشاريع المسموحة أولاً
      addDebugInfo('🏗️ جاري جلب المشاريع المسموحة...');
      const allowedProjects = await loadAllowedProjects(emp);
      setProjects(allowedProjects);
      addDebugInfo(`✅ تم جلب ${allowedProjects.length} مشروع مسموح`);
      if (allowedProjects.length > 0) {
        allowedProjects.forEach(p => {
          addDebugInfo(`   - ${p.name} (ID: ${p.id})`);
        });
      }
      
      // 3. جلب العملاء الذين لديهم حجوزات - طريقة بديلة
      addDebugInfo('👥 جاري جلب العملاء مع الحجوزات...');
      await fetchClientsWithReservationsAlt(emp, allowedProjects);
      
    } catch (error) {
      console.error('Error in initializePage:', error);
      setError(`حدث خطأ في تهيئة الصفحة: ${error}`);
      addDebugInfo(`❌ خطأ في التهيئة: ${error}`);
    } finally {
      setLoading(false);
      addDebugInfo('🏁 اكتمل التحميل');
    }
  }

  // دالة جلب المشاريع المسموحة
  async function loadAllowedProjects(emp: any): Promise<Project[]> {
    try {
      let query = supabase
        .from('projects')
        .select('id, name')
        .eq('status', 'active')
        .order('name');

      // تطبيق الفلترة حسب الدور
      if (emp?.role === 'sales' || emp?.role === 'sales_manager') {
        addDebugInfo(`🔍 جاري جلب مشاريع الموظف ${emp.id}...`);
        const { data: employeeProjects, error: empError } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        if (empError) {
          addDebugInfo(`⚠️ خطأ في جلب مشاريع الموظف: ${empError.message}`);
          console.error('Error fetching employee projects:', empError);
          return [];
        }

        addDebugInfo(`📊 عدد مشاريع الموظف في employee_projects: ${employeeProjects?.length || 0}`);
        
        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        if (allowedProjectIds.length > 0) {
          query = query.in('id', allowedProjectIds);
          addDebugInfo(`✅ فلترة المشاريع: ${allowedProjectIds.length} مشروع مسموح`);
        } else {
          addDebugInfo('⚠️ تحذير: لا توجد مشاريع مسموحة للموظف في جدول employee_projects');
          return [];
        }
      } else {
        addDebugInfo('👑 مسؤول النظام - يرى جميع المشاريع');
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Error loading projects:', error);
        addDebugInfo(`❌ خطأ في جلب المشاريع: ${error.message}`);
        return [];
      }
      
      return data || [];
    } catch (err) {
      console.error('Error loading projects:', err);
      addDebugInfo(`❌ خطأ في جلب المشاريع: ${err}`);
      return [];
    }
  }

  // طريقة بديلة لجلب العملاء - مشابهة لكود الحجوزات
  async function fetchClientsWithReservationsAlt(emp: any, allowedProjects: Project[]) {
    try {
      addDebugInfo('🔍 بدء جلب العملاء (الطريقة البديلة)...');
      
      // خطوة 1: جلب الحجوزات أولاً
      let reservationsQuery = supabase
        .from('reservations')
        .select(`
          id,
          client_id,
          unit_id,
          reservation_date,
          status,
          units!inner (
            id,
            project_id,
            unit_code
          )
        `)
        .eq('status', 'active');

      // تطبيق فلترة المشاريع للموظفين
      if (emp?.role === 'sales' || emp?.role === 'sales_manager') {
        const allowedProjectIds = allowedProjects.map(p => p.id);
        if (allowedProjectIds.length > 0) {
          reservationsQuery = reservationsQuery.in('units.project_id', allowedProjectIds);
          addDebugInfo(`🔧 فلترة الحجوزات بمشاريع: ${allowedProjectIds.join(', ')}`);
        } else {
          setClients([]);
          addDebugInfo('❌ لا توجد مشاريع مسموحة - لن يتم عرض أي عملاء');
          return;
        }
      }

      const { data: reservationsData, error: resError } = await reservationsQuery;

      if (resError) {
        console.error('Error fetching reservations:', resError);
        addDebugInfo(`❌ خطأ في جلب الحجوزات: ${resError.message}`);
        return;
      }

      addDebugInfo(`📊 عدد الحجوزات المطلوبة: ${reservationsData?.length || 0}`);
      
      if (!reservationsData || reservationsData.length === 0) {
        setClients([]);
        addDebugInfo('ℹ️ لم يتم العثور على حجوزات نشطة');
        return;
      }

      // استخراج ID العملاء الفريدة
      const clientIds = [...new Set(reservationsData.map((r: any) => r.client_id))];
      addDebugInfo(`👥 عدد العملاء الفريدين من الحجوزات: ${clientIds.length}`);
      
      if (clientIds.length === 0) {
        setClients([]);
        addDebugInfo('ℹ️ لم يتم العثور على عملاء من الحجوزات');
        return;
      }

      // خطوة 2: جلب بيانات العملاء
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, name, status')
        .in('id', clientIds)
        .eq('status', 'active')
        .order('name');

      if (clientsError) {
        console.error('Error fetching clients:', clientsError);
        addDebugInfo(`❌ خطأ في جلب العملاء: ${clientsError.message}`);
        return;
      }

      addDebugInfo(`📊 عدد العملاء النشطين: ${clientsData?.length || 0}`);
      
      if (!clientsData || clientsData.length === 0) {
        setClients([]);
        addDebugInfo('ℹ️ لم يتم العثور على عملاء نشطين');
        return;
      }

      // تحويل البيانات
      const clientsList: Client[] = clientsData.map(client => ({
        id: client.id,
        name: client.name
      }));

      setClients(clientsList);
      addDebugInfo(`✅ تم العثور على ${clientsList.length} عميل نشط لديهم حجوزات`);
      
      // عرض بعض الأمثلة للتصحيح
      clientsList.slice(0, 3).forEach((client, index) => {
        addDebugInfo(`   ${index + 1}. ${client.name} (ID: ${client.id})`);
      });
      
    } catch (error) {
      console.error('Error in fetchClientsWithReservationsAlt:', error);
      setError('حدث خطأ في تحميل العملاء');
      addDebugInfo(`❌ خطأ: ${error}`);
    }
  }

  // دالة جلب الحجوزات لعميل معين
  async function fetchReservations(cid: string) {
    try {
      setLoading(true);
      addDebugInfo(`🔍 جاري جلب حجوزات العميل ${cid}...`);
      
      let query = supabase
        .from('reservations')
        .select(`
          id, 
          unit_id, 
          reservation_date, 
          status,
          units!inner (
            id,
            project_id,
            unit_code,
            status
          )
        `)
        .eq('client_id', cid)
        .eq('status', 'active');

      // فلترة الحجوزات بالمشاريع المسموحة للموظفين
      if (employee?.role === 'sales' || employee?.role === 'sales_manager') {
        const allowedProjectIds = projects.map(p => p.id);
        if (allowedProjectIds.length > 0) {
          query = query.in('units.project_id', allowedProjectIds);
          addDebugInfo(`🔧 فلترة الحجوزات بالمشاريع المسموحة: ${allowedProjectIds.length} مشروع`);
        } else {
          setReservations([]);
          addDebugInfo('❌ لا توجد مشاريع مسموحة للموظف');
          return;
        }
      }

      const { data, error } = await query.order('reservation_date', { ascending: false });

      if (error) {
        console.error('Error fetching reservations:', error);
        setReservations([]);
        setError('حدث خطأ في تحميل الحجوزات');
        addDebugInfo(`❌ خطأ في جلب الحجوزات: ${error.message}`);
      } else {
        // تحويل البيانات بشكل صحيح
        const formattedData: Reservation[] = (data || []).map((item: any) => {
          const unit = Array.isArray(item.units) ? item.units[0] : item.units;
          return {
            id: item.id,
            unit_id: item.unit_id,
            reservation_date: item.reservation_date,
            status: item.status,
            project_id: unit?.project_id,
            unit_code: unit?.unit_code || ''
          };
        });
        
        setReservations(formattedData);
        addDebugInfo(`✅ تم جلب ${formattedData.length} حجز للعميل`);
        
        // عرض تفاصيل الحجوزات للتصحيح
        if (formattedData.length > 0) {
          formattedData.forEach((res, index) => {
            addDebugInfo(`   📅 حجز ${index + 1}: ${res.unit_code || 'بدون كود'} - ${new Date(res.reservation_date).toLocaleDateString('ar-SA')}`);
          });
        } else {
          addDebugInfo('ℹ️ لا توجد حجوزات نشطة لهذا العميل');
        }
      }

      // reset
      setReservationId('');
      setUnit(null);
      
    } catch (error) {
      console.error('Error in fetchReservations:', error);
      setReservations([]);
      setError('حدث خطأ في تحميل الحجوزات');
      addDebugInfo(`❌ خطأ في جلب الحجوزات: ${error}`);
    } finally {
      setLoading(false);
    }
  }

  // دالة جلب بيانات الوحدة
  async function fetchUnit(unitId: string) {
    try {
      setLoading(true);
      addDebugInfo(`🔍 جاري جلب بيانات الوحدة ${unitId}...`);
      
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_code, project_id, status')
        .eq('id', unitId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching unit:', error);
        setUnit(null);
        setError('حدث خطأ في تحميل بيانات الوحدة');
        addDebugInfo(`❌ خطأ في جلب الوحدة: ${error.message}`);
        return;
      }

      setUnit(data || null);
      if (data) {
        addDebugInfo(`✅ تم جلب الوحدة: ${data.unit_code} (${data.status}) - مشروع: ${data.project_id}`);
      }
      
    } catch (error) {
      console.error('Error in fetchUnit:', error);
      setUnit(null);
      setError('حدث خطأ في تحميل بيانات الوحدة');
      addDebugInfo(`❌ خطأ في جلب الوحدة: ${error}`);
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
    addDebugInfo('🚀 بدء عملية البيع...');

    try {
      // التحقق من أن الوحدة محجوزة
      if (unit.status !== 'reserved') {
        setError('الوحدة ليست محجوزة. لا يمكن بيع وحدة غير محجوزة');
        setSubmitting(false);
        addDebugInfo('❌ فشل: الوحدة ليست محجوزة');
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
        addDebugInfo('❌ فشل: الوحدة مباعة مسبقاً');
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
        addDebugInfo(`❌ فشل في إدراج البيع: ${saleError.message}`);
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
        addDebugInfo(`⚠️ فشل تحديث الحجز: ${resErr.message}`);
      }

      // تحديث حالة الوحدة
      const { error: unitErr } = await supabase
        .from('units')
        .update({ status: 'sold' })
        .eq('id', unit.id);

      if (unitErr) {
        console.error('Unit update error:', unitErr);
        updates.push('الوحدة');
        addDebugInfo(`⚠️ فشل تحديث الوحدة: ${unitErr.message}`);
      }

      // تحديث حالة العميل
      const { error: clientErr } = await supabase
        .from('clients')
        .update({ status: 'converted' })
        .eq('id', clientId);

      if (clientErr) {
        console.error('Client update error:', clientErr);
        updates.push('العميل');
        addDebugInfo(`⚠️ فشل تحديث العميل: ${clientErr.message}`);
      }

      // إذا كانت هناك أخطاء في التحديثات
      if (updates.length > 0) {
        console.warn(`Failed to update: ${updates.join(', ')}`);
      }

      addDebugInfo('✅ تم تنفيذ عملية البيع بنجاح!');
      alert('تم تنفيذ عملية البيع بنجاح!');
      router.push('/dashboard/sales');

    } catch (error: any) {
      console.error('Error in handleSubmit:', error);
      setError(error.message || 'حدث خطأ غير متوقع');
      addDebugInfo(`❌ خطأ في التنفيذ: ${error}`);
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
    addDebugInfo(`👤 تم اختيار العميل: ${cid}`);
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
    addDebugInfo(`📅 تم اختيار الحجز: ${rid}`);
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
            🔄 تحديث البيانات
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
          <strong>📋 ملاحظة:</strong> يتم عرض العملاء الذين لديهم حجوزات نشطة في المشاريع المسموحة لك فقط.
          {projects.length > 0 && (
            <div style={{ marginTop: '5px', fontSize: '12px' }}>
              المشاريع المسموحة لك: {projects.map(p => p.name).join(', ')}
            </div>
          )}
          {projects.length === 0 && employee.role !== 'admin' && (
            <div style={{ marginTop: '5px', fontSize: '12px', color: '#d32f2f' }}>
              ⚠️ لم يتم تعيين أي مشاريع لك. يرجى التواصل مع المسؤول.
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
          ❌ {error}
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
                  {loading ? '🔄 جاري التحميل...' : 
                   employee?.role === 'sales' || employee?.role === 'sales_manager' ? 
                   '👥 اختر العميل (من مشاريعك فقط)' : 
                   '👥 اختر العميل'}
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
                    ? '⚠️ لا توجد عملاء لديهم حجوزات نشطة في المشاريع المسموحة لك' 
                    : '⚠️ لم يتم العثور على عملاء لديهم حجوزات نشطة'}
                </small>
              )}

              {clientId && !clientHasActiveReservations && (
                <small style={{ color: '#c00', fontSize: '12px', marginTop: '4px' }}>
                  ⚠️ هذا العميل لا يمتلك حجوزات نشطة في المشاريع المسموحة لك
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
                  {!clientId ? '👥 اختر العميل أولاً' : 
                   loading ? '🔄 جاري التحميل...' :
                   reservations.length === 0 ? '📭 لا توجد حجوزات نشطة' : 
                   '📅 اختر الحجز'}
                </option>
                {reservations.map(r => {
                  return (
                    <option key={r.id} value={r.id}>
                      {r.unit_code ? `🏠 ${r.unit_code}` : '📅 حجز'} بتاريخ {new Date(r.reservation_date).toLocaleDateString('ar-SA')}
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

            {/* باقي الحقول كما هي */}
            {/* ... */}
            
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
          {submitting ? '🔄 جاري الحفظ...' : '✅ تأكيد التنفيذ'}
        </Button>
        
        <Button
          onClick={handleCancel}
          variant="danger"
        >
          ❌ إلغاء
        </Button>
      </div>

      {/* ===== DEBUG INFO ===== */}
      <div style={{ 
        marginTop: '10px', 
        padding: '10px 15px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '4px',
        fontSize: '12px',
        color: '#666',
        maxHeight: '300px',
        overflowY: 'auto',
        fontFamily: 'monospace'
      }}>
        <h5 style={{ margin: '0 0 5px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span>🐞</span> معلومات التصحيح:
        </h5>
        <div>
          {debugInfo.length === 0 ? (
            <div>🔄 جاري التحميل...</div>
          ) : (
            debugInfo.map((info, index) => (
              <div key={index} style={{ 
                marginBottom: '2px', 
                padding: '2px 0',
                borderBottom: index < debugInfo.length - 1 ? '1px dotted #ddd' : 'none'
              }}>
                [{new Date().toLocaleTimeString('ar-SA')}] {info}
              </div>
            ))
          )}
        </div>
        <div style={{ 
          marginTop: '10px', 
          paddingTop: '10px', 
          borderTop: '1px solid #ddd',
          backgroundColor: '#e8f4fd',
          padding: '8px',
          borderRadius: '4px'
        }}>
          <div><strong>📊 حالة التحميل:</strong> {loading ? '🔄 جاري التحميل...' : '✅ مكتمل'}</div>
          <div><strong>👥 العملاء المتاحين:</strong> {clients.length} عميل</div>
          <div><strong>📅 الحجوزات المتاحة:</strong> {reservations.length} حجز</div>
          <div><strong>🏠 الوحدة المختارة:</strong> {unit ? unit.unit_code : 'لا يوجد'}</div>
          <div><strong>👔 دور الموظف:</strong> {employee?.role || 'غير محدد'}</div>
          <div><strong>🏗️ المشاريع المسموحة:</strong> {projects.length} مشروع</div>
          <div><strong>🆔 ID الموظف:</strong> {employee?.id || 'غير معروف'}</div>
          <div><strong>👑 حالة الموظف:</strong> {employee?.role === 'admin' ? '👑 مسؤول - يرى كل العملاء' : '👤 موظف - يرى من مشاريعه فقط'}</div>
        </div>
      </div>

    </div>
  );
}