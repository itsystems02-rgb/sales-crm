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
  mobile?: string;
  status?: string;
};

type Unit = {
  id: string;
  unit_code: string;
  project_id: string;
  status: string;
  unit_type?: string;
  project_name?: string;
};

type Reservation = {
  id: string;
  client_id: string;
  unit_id: string;
  reservation_date: string;
  status: string;
  created_at?: string;
  bank_name?: string | null;
  employee_id?: string | null;
  clients?: Client;
  units?: Unit;
  employees?: {
    name: string;
    role: string;
  };
};

type Project = {
  id: string;
  name: string;
  code?: string;
};

type Employee = {
  id: string;
  role: 'admin' | 'sales' | 'sales_manager';
  name?: string;
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
  const [employee, setEmployee] = useState<Employee | null>(null);
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
    setDebugInfo(prev => [...prev.slice(-10), info]);
  };

  /* =====================
     Initial Load
  ===================== */

  useEffect(() => {
    initializePage();
  }, []);

  // جلب المشاريع المسموحة - من كود الحجوزات
  async function fetchAllowedProjects(employee: any): Promise<Project[]> {
    try {
      // إذا كان ادمن، اجلب جميع المشاريع
      if (employee?.role === 'admin') {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name, code')
          .order('name');
        
        if (error) throw error;
        return data || [];
      }
      
      // إذا كان sales أو sales_manager، اجلب المشاريع المخصصة له فقط
      if (employee?.role === 'sales' || employee?.role === 'sales_manager') {
        // جلب المشاريع المسموحة من جدول employee_projects
        const { data: employeeProjects, error: empError } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', employee.id);

        if (empError) throw empError;

        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        
        if (allowedProjectIds.length > 0) {
          const { data: projectsData, error: projectsError } = await supabase
            .from('projects')
            .select('id, name, code')
            .in('id', allowedProjectIds)
            .order('name');
          
          if (projectsError) throw projectsError;
          return projectsData || [];
        } else {
          return [];
        }
      }
      
      return [];
    } catch (err) {
      console.error('Error fetching allowed projects:', err);
      return [];
    }
  }

  // جلب الحجوزات - منطق مشابه لصفحة الحجوزات
  async function fetchReservationsForSale(employee: any, allowedProjects: Project[]) {
    try {
      let query = supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false });

      // تطبيق الصلاحيات بناءً على دور المستخدم
      if (employee?.role === 'sales') {
        // الموظف العادي: يشاهد حجوزاته فقط
        query = query.eq('employee_id', employee.id);
      } else if (employee?.role === 'sales_manager') {
        // مدير المبيعات: يشاهد حجوزات المشاريع المسموحة له
        const allowedProjectIds = allowedProjects.map(p => p.id);
        
        if (allowedProjectIds.length > 0) {
          // الحصول على الوحدات في المشاريع المسموحة
          const { data: unitsData } = await supabase
            .from('units')
            .select('id')
            .in('project_id', allowedProjectIds);
          
          const unitIds = unitsData?.map(u => u.id) || [];
          
          if (unitIds.length > 0) {
            query = query.in('unit_id', unitIds);
          } else {
            // لا توجد وحدات في المشاريع المسموحة
            return [];
          }
        } else {
          // لا توجد مشاريع مسموحة
          return [];
        }
      }
      // إذا كان admin: لا نضيف فلتر، يشاهد جميع الحجوزات

      // فلتر الحجوزات النشطة فقط
      query = query.eq('status', 'active');

      const { data: reservationsData, error: reservationsError } = await query;

      if (reservationsError) {
        console.error('Error fetching reservations:', reservationsError);
        throw reservationsError;
      }

      if (!reservationsData || reservationsData.length === 0) {
        return [];
      }

      // جلب التفاصيل لكل حجز
      const reservationsWithDetails: Reservation[] = await Promise.all(
        reservationsData.map(async (reservation: any) => {
          const reservationWithDetails: Reservation = { ...reservation };
          
          // جلب بيانات العميل
          if (reservation.client_id) {
            const { data: clientData } = await supabase
              .from('clients')
              .select('id, name, mobile, status')
              .eq('id', reservation.client_id)
              .single();
            
            if (clientData) {
              reservationWithDetails.clients = clientData;
            }
          }
          
          // جلب بيانات الوحدة
          if (reservation.unit_id) {
            const { data: unitData } = await supabase
              .from('units')
              .select('id, unit_code, unit_type, project_id, status')
              .eq('id', reservation.unit_id)
              .single();
            
            if (unitData) {
              const unitInfo: Unit = {
                id: unitData.id,
                unit_code: unitData.unit_code,
                unit_type: unitData.unit_type,
                project_id: unitData.project_id,
                status: unitData.status
              };
              
              // جلب اسم المشروع
              if (unitData.project_id) {
                const { data: projectData } = await supabase
                  .from('projects')
                  .select('name')
                  .eq('id', unitData.project_id)
                  .single();
                
                if (projectData) {
                  unitInfo.project_name = projectData.name;
                }
              }
              
              reservationWithDetails.units = unitInfo;
            }
          }
          
          return reservationWithDetails;
        })
      );

      return reservationsWithDetails;
      
    } catch (error) {
      console.error('Error in fetchReservationsForSale:', error);
      return [];
    }
  }

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
      
      // 2. جلب المشاريع المسموحة
      addDebugInfo('🏗️ جاري جلب المشاريع المسموحة...');
      const allowedProjects = await fetchAllowedProjects(emp);
      setProjects(allowedProjects);
      addDebugInfo(`✅ تم جلب ${allowedProjects.length} مشروع مسموح`);
      
      if (allowedProjects.length > 0) {
        allowedProjects.forEach(p => {
          addDebugInfo(`   - ${p.name} (ID: ${p.id})`);
        });
      }
      
      // 3. جلب الحجوزات النشطة
      addDebugInfo('📅 جاري جلب الحجوزات النشطة...');
      const reservationsData = await fetchReservationsForSale(emp, allowedProjects);
      
      // 4. استخراج العملاء الفريدين من الحجوزات
      addDebugInfo('👥 استخراج العملاء من الحجوزات...');
      const uniqueClients: Client[] = [];
      const clientMap = new Map<string, boolean>();
      
      if (reservationsData && reservationsData.length > 0) {
        addDebugInfo(`📊 عدد الحجوزات المطلوبة: ${reservationsData.length}`);
        
        // تصفية الحجوزات التي تحتوي على بيانات عملاء ووحدات
        const validReservations = reservationsData.filter(r => 
          r.clients && 
          r.units && 
          r.units.status === 'reserved'
        );
        
        addDebugInfo(`✅ عدد الحجوزات الصالحة: ${validReservations.length}`);
        
        validReservations.forEach(reservation => {
          if (reservation.clients && !clientMap.has(reservation.clients.id)) {
            clientMap.set(reservation.clients.id, true);
            uniqueClients.push({
              id: reservation.clients.id,
              name: reservation.clients.name || 'غير محدد',
              mobile: reservation.clients.mobile,
              status: reservation.clients.status
            });
          }
        });
        
        // حفظ الحجوزات الصالحة فقط
        setReservations(validReservations);
      } else {
        addDebugInfo('ℹ️ لم يتم العثور على حجوزات نشطة');
        setReservations([]);
      }
      
      setClients(uniqueClients);
      addDebugInfo(`✅ تم العثور على ${uniqueClients.length} عميل نشط`);
      
      // عرض بعض الأمثلة للتصحيح
      uniqueClients.slice(0, 5).forEach((client, index) => {
        addDebugInfo(`   ${index + 1}. ${client.name} (ID: ${client.id})`);
      });
      
    } catch (error) {
      console.error('Error in initializePage:', error);
      setError(`حدث خطأ في تهيئة الصفحة: ${error}`);
      addDebugInfo(`❌ خطأ في التهيئة: ${error}`);
    } finally {
      setLoading(false);
      addDebugInfo('🏁 اكتمل التحميل');
    }
  }

  // دالة جلب الحجوزات لعميل معين
  async function fetchReservationsForClient(cid: string) {
    if (!employee || !cid) return;
    
    try {
      setLoading(true);
      addDebugInfo(`🔍 جاري جلب حجوزات العميل ${cid}...`);
      
      // فلتر الحجوزات للعميل المحدد والتي تكون نشطة
      const clientReservations = reservations.filter(r => 
        r.client_id === cid && 
        r.status === 'active'
      );
      
      // إذا كان لدى الموظف مشاريع مسموحة، نقوم بفلترة إضافية
      let filteredReservations = clientReservations;
      
      if (employee.role === 'sales' || employee.role === 'sales_manager') {
        const allowedProjectIds = projects.map(p => p.id);
        if (allowedProjectIds.length > 0) {
          filteredReservations = clientReservations.filter(r => 
            r.units && allowedProjectIds.includes(r.units.project_id)
          );
          addDebugInfo(`🔧 فلترة الحجوزات بالمشاريع المسموحة: ${allowedProjectIds.length} مشروع`);
        }
      }
      
      // إرجاع فقط الحجوزات التي تحتوي على بيانات وحدات
      const validReservations = filteredReservations.filter(r => r.units);
      
      // تحديث حالة الحجوزات
      setReservations(prev => {
        // نحتفظ بجميع الحجوزات ولكن نحدد أيها للعرض
        return prev;
      });
      
      // الحجوزات المتاحة لهذا العميل
      const availableReservations = validReservations.map(r => ({
        id: r.id,
        unit_id: r.unit_id,
        reservation_date: r.reservation_date,
        status: r.status,
        project_id: r.units?.project_id,
        unit_code: r.units?.unit_code || 'بدون كود'
      }));
      
      addDebugInfo(`✅ حجوزات العميل: ${availableReservations.length} حجز متاح`);
      
      // عرض تفاصيل الحجوزات للتصحيح
      if (availableReservations.length > 0) {
        availableReservations.forEach((res, index) => {
          addDebugInfo(`   📅 حجز ${index + 1}: ${res.unit_code} - ${new Date(res.reservation_date).toLocaleDateString('ar-SA')}`);
        });
      } else {
        addDebugInfo('ℹ️ لا توجد حجوزات نشطة لهذا العميل');
      }
      
      return availableReservations;
      
    } catch (error) {
      console.error('Error in fetchReservationsForClient:', error);
      addDebugInfo(`❌ خطأ في جلب حجوزات العميل: ${error}`);
      return [];
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

  // الحصول على حجوزات العميل المحدد
  const clientReservations = useMemo(() => {
    if (!clientId) return [];
    
    const clientRes = reservations.filter(r => 
      r.client_id === clientId && 
      r.status === 'active' &&
      r.units?.status === 'reserved'
    );
    
    // إذا كان الموظف له مشاريع مسموحة، قم بالفلترة
    if (employee && (employee.role === 'sales' || employee.role === 'sales_manager')) {
      const allowedProjectIds = projects.map(p => p.id);
      if (allowedProjectIds.length > 0) {
        return clientRes.filter(r => 
          r.units && allowedProjectIds.includes(r.units.project_id)
        );
      }
    }
    
    return clientRes;
  }, [clientId, reservations, employee, projects]);

  const canSubmit =
    !!clientId &&
    !!reservationId &&
    !!unit &&
    !!unit.project_id &&
    !!employee?.id &&
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
    setReservationId('');
    setUnit(null);
    setError(null);
    addDebugInfo(`👤 تم اختيار العميل: ${cid}`);
    
    if (cid) {
      // البحث عن اسم العميل
      const selectedClient = clients.find(c => c.id === cid);
      addDebugInfo(`👤 العميل المحدد: ${selectedClient?.name || 'غير معروف'}`);
    }
  }

  function handleReservationChange(e: ChangeEvent<HTMLSelectElement>) {
    const rid = e.target.value;
    setReservationId(rid);
    setError(null);
    addDebugInfo(`📅 تم اختيار الحجز: ${rid}`);
    
    // البحث عن الحجز المحدد واستخراج بيانات الوحدة
    const selectedReservation = reservations.find(r => r.id === rid);
    if (selectedReservation && selectedReservation.units) {
      setUnit({
        id: selectedReservation.units.id,
        unit_code: selectedReservation.units.unit_code,
        project_id: selectedReservation.units.project_id,
        status: selectedReservation.units.status,
        unit_type: selectedReservation.units.unit_type,
        project_name: selectedReservation.units.project_name
      });
      
      addDebugInfo(`🏠 الوحدة المحددة: ${selectedReservation.units.unit_code} (${selectedReservation.units.status})`);
    } else {
      setUnit(null);
      addDebugInfo('❌ لم يتم العثور على بيانات الوحدة لهذا الحجز');
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

  // دالة للتسجيل في مشروع (للأغراض التنموية فقط)
  async function handleAssignToProject() {
    if (!employee) return;
    
    try {
      const projectId = prompt('أدخل ID المشروع الذي تريد التسجيل فيه:');
      if (!projectId) return;

      const { error } = await supabase
        .from('employee_projects')
        .insert({
          employee_id: employee.id,
          project_id: projectId
        });

      if (error) {
        alert(`خطأ في التسجيل بالمشروع: ${error.message}`);
      } else {
        alert('تم التسجيل بالمشروع بنجاح! قم بتحديث الصفحة.');
        initializePage();
      }
    } catch (error) {
      console.error('Error assigning to project:', error);
      alert('حدث خطأ أثناء التسجيل بالمشروع');
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <Button 
            onClick={handleRefresh}
            variant="secondary"
          >
            🔄 تحديث البيانات
          </Button>
          {employee && (employee.role === 'sales' || employee.role === 'sales_manager') && projects.length === 0 && (
            <button 
              onClick={handleAssignToProject}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ff9800',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              📋 تسجيل بمشروع
            </button>
          )}
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
          {projects.length > 0 ? (
            <div style={{ marginTop: '5px', fontSize: '12px' }}>
              المشاريع المسموحة لك: {projects.map(p => p.name).join(', ')}
            </div>
          ) : (
            <div style={{ marginTop: '5px', fontSize: '12px', color: '#d32f2f' }}>
              ⚠️ لم يتم تعيين أي مشاريع لك في جدول employee_projects.
              {employee.role === 'sales' && (
                <div style={{ marginTop: '5px' }}>
                  <button 
                    onClick={handleAssignToProject}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#ff9800',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    📋 اضغط هنا للتسجيل بمشروع
                  </button>
                </div>
              )}
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

      {/* ===== MESSAGE FOR EMPLOYEES WITHOUT PROJECTS ===== */}
      {employee && (employee.role === 'sales' || employee.role === 'sales_manager') && projects.length === 0 && (
        <div style={{
          backgroundColor: '#fff3cd',
          color: '#856404',
          padding: '15px 20px',
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #ffeaa7',
          fontSize: '14px'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#856404' }}>⚠️ تحذير: لا توجد مشاريع مسموحة</h4>
          <p style={{ margin: '0 0 10px 0' }}>
            لم يتم تعيين أي مشاريع لك في النظام. يجب أن يكون لديك مشاريع مسموحة لرؤية العملاء والحجوزات.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button 
              onClick={handleAssignToProject}
              style={{
                padding: '8px 16px',
                backgroundColor: '#ff9800',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              📋 تسجيل بمشروع جديد
            </button>
            <Button 
              onClick={() => router.push('/dashboard/projects')}
              variant="secondary"
            >
              👀 عرض جميع المشاريع
            </Button>
            <Button 
              onClick={() => router.push('/dashboard/profile')}
              variant="secondary"
            >
              👤 تحديث بياناتي
            </Button>
          </div>
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
                disabled={loading || (employee?.role !== 'admin' && projects.length === 0)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: clientId ? '#fff' : '#f9f9f9',
                  cursor: loading || (employee?.role !== 'admin' && projects.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: loading || (employee?.role !== 'admin' && projects.length === 0) ? 0.7 : 1
                }}
              >
                <option value="">
                  {loading ? '🔄 جاري التحميل...' : 
                   employee?.role === 'sales' || employee?.role === 'sales_manager' ? 
                   (projects.length === 0 ? '⚠️ سجل بمشروع أولاً' : '👥 اختر العميل') : 
                   '👥 اختر العميل'}
                </option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.mobile ? `(${c.mobile})` : ''}
                  </option>
                ))}
              </select>

              {!loading && clients.length === 0 && (
                <small style={{ color: '#c00', fontSize: '12px', marginTop: '4px' }}>
                  {employee?.role === 'sales' || employee?.role === 'sales_manager' 
                    ? (projects.length === 0 
                      ? '⚠️ يجب أن يكون لديك مشاريع مسموحة لرؤية العملاء' 
                      : '⚠️ لا توجد عملاء لديهم حجوزات نشطة في المشاريع المسموحة لك') 
                    : '⚠️ لم يتم العثور على عملاء لديهم حجوزات نشطة'}
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
                disabled={!clientId || clientReservations.length === 0 || loading}
                onChange={handleReservationChange}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: !clientId || clientReservations.length === 0 ? '#f9f9f9' : '#fff',
                  cursor: !clientId || clientReservations.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: !clientId || clientReservations.length === 0 ? 0.7 : 1
                }}
              >
                <option value="">
                  {!clientId ? '👥 اختر العميل أولاً' : 
                   loading ? '🔄 جاري التحميل...' :
                   clientReservations.length === 0 ? '📭 لا توجد حجوزات نشطة لهذا العميل' : 
                   '📅 اختر الحجز'}
                </option>
                {clientReservations.map(r => {
                  const unitCode = r.units?.unit_code || 'بدون كود';
                  const reservationDate = new Date(r.reservation_date).toLocaleDateString('ar-SA');
                  return (
                    <option key={r.id} value={r.id}>
                      🏠 {unitCode} - 📅 {reservationDate}
                    </option>
                  );
                })}
              </select>
              
              {clientId && clientReservations.length === 0 && !loading && (
                <small style={{ color: '#c00', fontSize: '12px', marginTop: '4px' }}>
                  ⚠️ هذا العميل لا يمتلك حجوزات نشطة
                </small>
              )}
            </div>

            {/* الوحدة */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                الوحدة المحددة
              </label>
              <input 
                value={unit ? `${unit.unit_code} ${unit.status ? `(${getUnitStatusText(unit.status)})` : ''}` : 'اختر حجـزاً أولاً'} 
                disabled
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#f9f9f9',
                  color: unit ? (unit.status === 'sold' ? '#c00' : '#2c3e50') : '#666',
                  fontWeight: unit ? '500' : 'normal'
                }}
              />
              {unit && (
                <small style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                  {unit.project_name ? `المشروع: ${unit.project_name}` : 'المشروع: غير محدد'}
                </small>
              )}
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
          disabled={!canSubmit || submitting || loading || (employee?.role !== 'admin' && projects.length === 0)}
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
          <div><strong>📅 الحجوزات الكلية:</strong> {reservations.length} حجز</div>
          <div><strong>📅 حجوزات العميل المحدد:</strong> {clientReservations.length} حجز</div>
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