'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/* =====================
   Types
===================== */

type Unit = {
  id: string;
  unit_code: string;
  project_id: string;
  status: string; // ✅ إضافة حقل الحالة
};

type Bank = {
  id: string;
  name: string;
};

type FollowUp = {
  employee_id: string | null;
  created_at: string | null;
  notes: string | null;
};

// ✅ النوع ده بس عشان TypeScript
type ReservationStatus = 'active' | 'cancelled' | 'converted';

type Employee = {
  id: string;
  role: 'admin' | 'sales';
};

/* =====================
   Page
===================== */

export default function ReservationPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [units, setUnits] = useState<Unit[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [lastFollowUp, setLastFollowUp] = useState<FollowUp | null>(null);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const [unitId, setUnitId] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankEmployeeName, setBankEmployeeName] = useState('');
  const [bankEmployeeMobile, setBankEmployeeMobile] = useState('');
  const [status, setStatus] = useState<ReservationStatus | ''>('');
  const [notes, setNotes] = useState('');

  const [reservationId, setReservationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      // 1. الحصول على بيانات الموظف الحالي
      const emp = await getCurrentEmployee();
      setEmployee(emp);
      
      if (!emp) {
        setLoading(false);
        return;
      }

      // 2. تحميل البيانات حسب صلاحية الموظف
      await fetchData(emp);
      setLoading(false);
    } catch (err) {
      console.error('Error in init():', err);
      setLoading(false);
    }
  }

  /* =====================
     Fetch Data - مع تطبيق الـ Role والفلتر بالحالة
  ===================== */
  async function fetchData(emp: Employee) {
    try {
      // تحميل البنوك (نفسها للجميع)
      const { data: b } = await supabase
        .from('banks')
        .select('id, name')
        .order('name');
      setBanks(b || []);

      // تحميل آخر متابعة (نفسها للجميع)
      const { data: follow } = await supabase
        .from('client_followups')
        .select('employee_id, created_at, notes')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLastFollowUp(follow || null);

      // تحميل الوحدات مع تطبيق الـ Role والفلتر بالحالة
      let query = supabase
        .from('units')
        .select('id, unit_code, project_id, status')
        .eq('status', 'available'); // ✅ فلتر إضافي: الوحدات المتاحة فقط

      // إذا كان sales: يرى فقط وحدات المشاريع المربوطة به
      if (emp.role === 'sales') {
        // الحصول على المشاريع المسموح بها للموظف
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        
        // تطبيق التصفية إذا كان لديه مشاريع
        if (allowedProjectIds.length > 0) {
          query = query.in('project_id', allowedProjectIds);
        } else {
          // إذا لم يكن لديه أي مشاريع، لا يرى أي وحدات
          query = query.eq('project_id', 'no-projects'); // فلتر يعيد صفر نتائج
        }
      }

      const { data: unitsData, error } = await query;
      
      if (error) {
        console.error('Error loading units:', error);
        setUnits([]);
        return;
      }

      // ✅ فلتر إضافي للتأكد (رغم أن Supabase فعل الفلتر)
      const availableUnits = (unitsData || []).filter(unit => unit.status === 'available');
      setUnits(availableUnits);
      
      console.log(`تم تحميل ${availableUnits.length} وحدة متاحة`, 
        emp.role === 'sales' ? '(مشاريع الموظف فقط)' : '(كل المشاريع)');
    } catch (err) {
      console.error('Error in fetchData():', err);
      setUnits([]);
      setBanks([]);
    }
  }

  /* =====================
     Submit Reservation
  ===================== */
  async function submit() {
    if (!unitId || !reservationDate) {
      alert('من فضلك اختر الوحدة وتاريخ الحجز');
      return;
    }

    if (!employee?.id) {
      alert('لم يتم تحديد الموظف الحالي');
      return;
    }

    // ✅ تحقق إضافي: التأكد أن الوحدة مازالت متاحة قبل الحجز
    const selectedUnit = units.find(u => u.id === unitId);
    if (!selectedUnit) {
      alert('الوحدة غير موجودة أو غير متاحة');
      return;
    }

    if (selectedUnit.status !== 'available') {
      alert('عذراً، هذه الوحدة لم تعد متاحة للحجز');
      await fetchData(employee); // تحديث القائمة
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('reservations')
      .insert({
        client_id: clientId,
        unit_id: unitId,
        employee_id: employee.id,
        reservation_date: reservationDate,
        bank_name: bankName || null,
        bank_employee_name: bankEmployeeName || null,
        bank_employee_mobile: bankEmployeeMobile || null,
        status: status || 'active',
        notes: notes || null,
        follow_employee_id: lastFollowUp?.employee_id || null,
        last_follow_up_at: lastFollowUp?.created_at || null,
        follow_up_details: lastFollowUp?.notes || null,
      })
      .select('id')
      .single();

    if (error) {
      alert(error.message);
      setSaving(false);
      return;
    }

    // تحديث حالة العميل والوحدة
    await supabase.from('clients').update({ status: 'reserved' }).eq('id', clientId);
    await supabase.from('units').update({ status: 'reserved' }).eq('id', unitId);

    setReservationId(data.id);
    
    // ✅ تحديث قائمة الوحدات بعد الحجز
    await fetchData(employee);
    setUnitId(''); // إعادة تعيين اختيار الوحدة
    setSaving(false);
  }

  /* =====================
     UI
  ===================== */
  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <div>جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="page">

      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}`)}>البيانات</Button>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}?tab=followups`)}>المتابعات</Button>
        <Button variant="primary">حجز</Button>
      </div>

      {/* معلومات الصلاحية للتصحيح */}
      {employee && (
        <div style={{ 
          padding: '8px 12px', 
          marginBottom: '10px', 
          backgroundColor: employee.role === 'admin' ? '#e6f4ea' : '#fef7e6',
          borderRadius: '4px',
          borderLeft: `4px solid ${employee.role === 'admin' ? '#34a853' : '#fbbc04'}`
        }}>
          <small>
            <strong>الصلاحية:</strong> {employee.role === 'admin' ? 'مدير' : 'مندوب مبيعات'} | 
            <strong> عدد الوحدات المتاحة:</strong> {units.length} وحدة
            {employee.role === 'sales' && ' (في مشاريعك فقط)'}
          </small>
        </div>
      )}

      <div className="details-layout">
        <Card title="بيانات الحجز">
          <div className="details-grid">

            <div className="form-field">
              <label>الوحدة المتاحة {employee?.role === 'sales' && '(مشاريعك فقط)'}</label>
              <select 
                value={unitId} 
                onChange={e => setUnitId(e.target.value)}
                disabled={units.length === 0}
              >
                <option value="">
                  {units.length === 0 
                    ? (employee?.role === 'sales' 
                      ? 'لا توجد وحدات متاحة في مشاريعك' 
                      : 'لا توجد وحدات متاحة') 
                    : 'اختر الوحدة المتاحة'}
                </option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.unit_code} {employee?.role === 'admin' ? `(مشروع: ${u.project_id.substring(0, 8)}...)` : ''}
                  </option>
                ))}
              </select>
              {employee?.role === 'sales' && units.length === 0 && (
                <small style={{ color: '#666', marginTop: '5px' }}>
                  يمكنك فقط رؤية الوحدات المتاحة في المشاريع المرتبطة بك. إذا لم تكن هناك وحدات، راجع المشرف.
                </small>
              )}
              {units.length > 0 && (
                <small style={{ color: '#34a853', marginTop: '5px', display: 'block' }}>
                  ✅ {units.length} وحدة متاحة {employee?.role === 'sales' ? 'في مشاريعك' : 'في النظام'}
                </small>
              )}
            </div>

            <div className="form-field">
              <label>تاريخ الحجز</label>
              <Input 
                type="date" 
                value={reservationDate} 
                onChange={e => setReservationDate(e.target.value)} 
              />
            </div>

            <div className="form-field">
              <label>اسم البنك</label>
              <select value={bankName} onChange={e => setBankName(e.target.value)}>
                <option value="">اختر البنك</option>
                {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label>اسم موظف البنك</label>
              <Input value={bankEmployeeName} onChange={e => setBankEmployeeName(e.target.value)} />
            </div>

            <div className="form-field">
              <label>رقم موظف البنك</label>
              <Input value={bankEmployeeMobile} onChange={e => setBankEmployeeMobile(e.target.value)} />
            </div>

            <div className="form-field">
              <label>حالة الحجز</label>
              <select value={status} onChange={e => setStatus(e.target.value as ReservationStatus)}>
                <option value="">اختر الحالة</option>
                <option value="active">حجز نشط</option>
                <option value="converted">تم التحويل (بيع)</option>
                <option value="cancelled">تم الإلغاء</option>
              </select>
            </div>

            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label>ملاحظات</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

          </div>
        </Card>

        <Card title="آخر متابعة تلقائية">
          {lastFollowUp ? (
            <div className="detail-row">
              <span className="label">تفاصيل المتابعة</span>
              <span className="value">{lastFollowUp.notes || '-'}</span>
            </div>
          ) : (
            <div>لا توجد متابعات سابقة</div>
          )}
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        {!reservationId && (
          <Button 
            variant="primary" 
            onClick={submit} 
            disabled={saving || units.length === 0 || !unitId || !reservationDate}
          >
            {saving ? 'جاري الحفظ...' : 'حفظ الحجز'}
          </Button>
        )}
        {reservationId && (
          <>
            <Button onClick={() => router.push(`/dashboard/reservations/${reservationId}`)}>
              عرض الحجز
            </Button>
            <Button variant="secondary" onClick={() => {
              setReservationId(null);
              resetForm();
            }}>
              حجز جديد
            </Button>
          </>
        )}
      </div>
    </div>
  );

  /* =====================
     Reset Form
  ===================== */
  function resetForm() {
    setUnitId('');
    setReservationDate('');
    setBankName('');
    setBankEmployeeName('');
    setBankEmployeeMobile('');
    setStatus('');
    setNotes('');
  }
}