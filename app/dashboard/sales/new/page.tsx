'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

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
};

type Unit = {
  id: string;
  unit_code: string;
  project_id: string;
  status: string;
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
  const [employee, setEmployee] = useState<{ id: string; role: string } | null>(null);

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

  /* =====================
     Initial Load
  ===================== */

  useEffect(() => {
    fetchClients();
    fetchCurrentEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchClients() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');

      if (error) {
        console.error(error);
        setError('حدث خطأ في تحميل العملاء');
        setClients([]);
        return;
      }

      setClients(data || []);
    } catch (error) {
      console.error(error);
      setError('حدث خطأ في تحميل العملاء');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCurrentEmployee() {
    try {
      const emp = await getCurrentEmployee();
      setEmployee(emp);
    } catch (error) {
      console.error('Error fetching employee:', error);
      setError('حدث خطأ في جلب بيانات الموظف');
    }
  }

  async function fetchReservations(cid: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reservations')
        .select('id, unit_id, reservation_date, status')
        .eq('client_id', cid)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        setReservations([]);
        setError('حدث خطأ في تحميل الحجوزات');
      } else {
        setReservations(data || []);
      }

      // reset
      setReservationId('');
      setUnit(null);
    } catch (error) {
      console.error(error);
      setReservations([]);
      setError('حدث خطأ في تحميل الحجوزات');
    } finally {
      setLoading(false);
    }
  }

  async function fetchUnit(unitId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_code, project_id, status')
        .eq('id', unitId)
        .maybeSingle();

      if (error) {
        console.error(error);
        setUnit(null);
        setError('حدث خطأ في تحميل بيانات الوحدة');
        return;
      }

      setUnit(data || null);
    } catch (error) {
      console.error(error);
      setUnit(null);
      setError('حدث خطأ في تحميل بيانات الوحدة');
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

    try {
      // التحقق من أن الوحدة محجوزة
      if (unit.status !== 'reserved') {
        setError('الوحدة ليست محجوزة. لا يمكن بيع وحدة غير محجوزة');
        setSubmitting(false);
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
        console.error(saleError);
        if (saleError.code === '23505') { // unique violation
          setError('هذه الوحدة تم بيعها مسبقاً');
        } else {
          setError(`حدث خطأ في حفظ عملية البيع: ${saleError.message}`);
        }
        setSubmitting(false);
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
        console.error(resErr);
        updates.push('الحجز');
      }

      // تحديث حالة الوحدة
      const { error: unitErr } = await supabase
        .from('units')
        .update({ status: 'sold' })
        .eq('id', unit.id);

      if (unitErr) {
        console.error(unitErr);
        updates.push('الوحدة');
      }

      // تحديث حالة العميل
      const { error: clientErr } = await supabase
        .from('clients')
        .update({ status: 'converted' })
        .eq('id', clientId);

      if (clientErr) {
        console.error(clientErr);
        updates.push('العميل');
      }

      // إذا كانت هناك أخطاء في التحديثات
      if (updates.length > 0) {
        console.warn(`Failed to update: ${updates.join(', ')}`);
      }

      alert('تم تنفيذ عملية البيع بنجاح!');
      router.push('/dashboard/sales');

    } catch (error: any) {
      console.error('Error in handleSubmit:', error);
      setError(error.message || 'حدث خطأ غير متوقع');
    } finally {
      setSubmitting(false);
    }
  }

  /* =====================
     Handlers
  ===================== */

  function handleClientChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const cid = e.target.value;
    setClientId(cid);
    setError(null);
    if (cid) {
      fetchReservations(cid);
    } else {
      setReservations([]);
      setReservationId('');
      setUnit(null);
    }
  }

  function handleReservationChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const rid = e.target.value;
    setReservationId(rid);
    setError(null);
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
  function handleSaleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
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

  /* =====================
     UI
  ===================== */

  return (
    <div className="page">
      {/* ===== TABS ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10, marginBottom: '20px' }}>
        <Button onClick={() => router.push('/dashboard/sales')}>
          التنفيذات
        </Button>
        <Button variant="primary">تنفيذ جديد</Button>
      </div>

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
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: clientId ? '#fff' : '#f9f9f9',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
                disabled={loading}
              >
                <option value="">اختر العميل</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

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
                <option value="">اختر الحجز</option>
                {reservations.map(r => (
                  <option key={r.id} value={r.id}>
                    حجز بتاريخ {new Date(r.reservation_date).toLocaleDateString('ar-SA')}
                  </option>
                ))}
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
              <Input
                value={form.contract_support_no}
                onChange={(e) => handleFormChange('contract_support_no', e.target.value)}
                placeholder="اختياري"
              />
            </div>

            {/* رقم عقد تلاد */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                رقم عقد تلاد
              </label>
              <Input
                value={form.contract_talad_no}
                onChange={(e) => handleFormChange('contract_talad_no', e.target.value)}
                placeholder="اختياري"
              />
            </div>

            {/* نوع العقد */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                نوع العقد
              </label>
              <select
                value={form.contract_type}
                onChange={(e) => handleFormChange('contract_type', e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  cursor: 'pointer'
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
                onChange={(e) => handleFormChange('finance_type', e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                  cursor: 'pointer'
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
              <Input
                value={form.finance_entity}
                onChange={(e) => handleFormChange('finance_entity', e.target.value)}
                placeholder="مثال: البنك الأهلي"
              />
            </div>

            {/* تاريخ بيع الوحدة */}
            <div className="form-field" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                تاريخ بيع الوحدة *
              </label>
              <Input
                type="date"
                value={form.sale_date}
                onChange={handleSaleDateChange}
                placeholder="YYYY-MM-DD"
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
                onChange={(e) => handleFormChange('price_before_tax', e.target.value)}
                min="0"
                step="0.01"
                placeholder="0.00"
                style={{
                  padding: '10px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: '#fff'
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
        border: '1px solid #eee'
      }}>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting || loading}
          style={{ padding: '12px 24px', fontSize: '16px' }}
        >
          {submitting ? 'جاري الحفظ...' : 'تأكيد التنفيذ'}
        </Button>
        
        <Button
          onClick={handleCancel}
          variant="danger"
          style={{ padding: '12px 24px', fontSize: '16px' }}
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
        </ul>
      </div>

    </div>
  );
}