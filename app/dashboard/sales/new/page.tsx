'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Client = {
  id: string;
  name: string;
  status: string; // إضافة status
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
   Page
===================== */

export default function NewSalePage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [unit, setUnit] = useState<Unit | null>(null);

  const [clientId, setClientId] = useState('');
  const [reservationId, setReservationId] = useState('');

  // الموظف الحالي من جدول employees (مش auth user id)
  const [employeeId, setEmployeeId] = useState<string | null>(null);

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
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status')
        .order('name');

      if (error) {
        console.error(error);
        setClients([]);
        setError('حدث خطأ في تحميل العملاء');
        return;
      }

      setClients(data || []);
    } catch (error) {
      console.error(error);
      setClients([]);
      setError('حدث خطأ في تحميل العملاء');
    }
  }

  async function fetchCurrentEmployee() {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        console.error(authErr);
        setError('حدث خطأ في جلب بيانات الموظف');
        return;
      }
      if (!user?.email) return;

      const { data, error } = await supabase
        .from('employees')
        .select('id')
        .eq('email', user.email)
        .maybeSingle();

      if (error) {
        console.error(error);
        setError('حدث خطأ في جلب بيانات الموظف');
      }
      if (data?.id) setEmployeeId(data.id);
    } catch (error) {
      console.error(error);
      setError('حدث خطأ في جلب بيانات الموظف');
    }
  }

  async function fetchReservations(cid: string) {
    try {
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
    }
  }

  async function fetchUnit(unitId: string) {
    try {
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
    !!employeeId &&
    clientHasActiveReservations &&
    !!form.sale_date &&
    !!form.price_before_tax;

  async function handleSubmit() {
    if (!canSubmit || !unit) return;

    setLoading(true);
    setError(null);

    try {
      // 1) التحقق من أن الوحدة متاحة للبيع (محجوزة)
      if (unit.status !== 'reserved') {
        setError('الوحدة ليست محجوزة. لا يمكن بيع وحدة غير محجوزة');
        setLoading(false);
        return;
      }

      // 2) insert sale
      const { error: saleError } = await supabase.from('sales').insert({
        client_id: clientId,
        unit_id: unit.id,
        project_id: unit.project_id,
        sales_employee_id: employeeId,

        contract_support_no: form.contract_support_no || null,
        contract_talad_no: form.contract_talad_no || null,
        contract_type: form.contract_type || null,
        finance_type: form.finance_type || null,
        finance_entity: form.finance_entity || null,

        sale_date: form.sale_date,
        price_before_tax: Number(form.price_before_tax),
      });

      if (saleError) {
        console.error(saleError);
        setError(saleError.message);
        setLoading(false);
        return;
      }

      // 3) تحديث حالة الحجز
      const { error: resErr } = await supabase
        .from('reservations')
        .update({ 
          status: 'converted',
          converted_at: new Date().toISOString()
        })
        .eq('id', reservationId);

      if (resErr) {
        console.error(resErr);
        setError('حدث خطأ في تحديث حالة الحجز');
        setLoading(false);
        return;
      }

      // 4) تحديث حالة الوحدة
      const { error: unitErr } = await supabase
        .from('units')
        .update({ 
          status: 'sold',
          sold_at: new Date().toISOString()
        })
        .eq('id', unit.id);

      if (unitErr) {
        console.error(unitErr);
        setError('حدث خطأ في تحديث حالة الوحدة');
        setLoading(false);
        return;
      }

      // 5) تحديث حالة العميل
      // أولاً: تحقق إذا كان العمود status موجود في جدول clients
      const { data: clientData, error: clientCheckError } = await supabase
        .from('clients')
        .select('status')
        .eq('id', clientId)
        .single();

      if (clientCheckError) {
        console.error('العميل غير موجود أو لا يحتوي على عمود status:', clientCheckError);
        // إذا لم يكن العمود موجوداً، نستخدم عمود آخر أو نكتفي بتحديث الحجز والوحدة
      } else {
        // تحديث حالة العميل إذا كان العمود موجوداً
        const { error: clientErr } = await supabase
          .from('clients')
          .update({ 
            status: 'converted',
            converted_at: new Date().toISOString()
          })
          .eq('id', clientId);

        if (clientErr) {
          console.error(clientErr);
          setError('حدث خطأ في تحديث حالة العميل');
          setLoading(false);
          return;
        }
      }

      // 6) إذا تم كل شيء بنجاح
      alert('تم تنفيذ عملية البيع بنجاح!');
      router.push('/dashboard/sales');

    } catch (error: any) {
      console.error(error);
      setError(error.message || 'حدث خطأ غير متوقع أثناء التنفيذ');
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     UI
  ===================== */

  return (
    <div className="page">

      {/* ===== TABS ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
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
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #ffcdd2'
        }}>
          {error}
        </div>
      )}

      <div className="details-layout">
        <Card title="تنفيذ بيع وحدة">
          <div className="details-grid">

            <div className="form-field">
              <label>العميل</label>
              <select
                value={clientId}
                onChange={e => {
                  const cid = e.target.value;
                  setClientId(cid);
                  setError(null);
                  if (cid) fetchReservations(cid);
                  else {
                    setReservations([]);
                    setReservationId('');
                    setUnit(null);
                  }
                }}
              >
                <option value="">اختر العميل</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.status ? `(${c.status === 'lead' ? 'متابعة' : c.status === 'reserved' ? 'محجوز' : c.status})` : ''}
                  </option>
                ))}
              </select>

              {clientId && !clientHasActiveReservations && (
                <small style={{ color: '#c00' }}>
                  هذا العميل لا يمتلك حجوزات نشطة
                </small>
              )}
            </div>

            <div className="form-field">
              <label>الحجز</label>
              <select
                value={reservationId}
                disabled={!clientId || reservations.length === 0}
                onChange={e => {
                  const rid = e.target.value;
                  setReservationId(rid);
                  setError(null);
                  const r = reservations.find(x => x.id === rid);
                  if (r) fetchUnit(r.unit_id);
                  else setUnit(null);
                }}
              >
                <option value="">اختر الحجز</option>
                {reservations.map(r => (
                  <option key={r.id} value={r.id}>
                    حجز بتاريخ {new Date(r.reservation_date).toLocaleDateString('ar-SA')} 
                    {r.status ? ` (${r.status === 'active' ? 'نشط' : r.status})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>الوحدة</label>
              <input 
                value={unit ? `${unit.unit_code} ${unit.status ? `(${unit.status === 'available' ? 'متاحة' : unit.status === 'reserved' ? 'محجوزة' : unit.status === 'sold' ? 'مباعة' : unit.status})` : ''}` : ''} 
                disabled 
              />
            </div>

            <div className="form-field">
              <label>رقم عقد الدعم</label>
              <input
                value={form.contract_support_no}
                onChange={e => setForm({ ...form, contract_support_no: e.target.value })}
                placeholder="اختياري"
              />
            </div>

            <div className="form-field">
              <label>رقم عقد تلاد</label>
              <input
                value={form.contract_talad_no}
                onChange={e => setForm({ ...form, contract_talad_no: e.target.value })}
                placeholder="اختياري"
              />
            </div>

            <div className="form-field">
              <label>نوع العقد</label>
              <select
                value={form.contract_type}
                onChange={e => setForm({ ...form, contract_type: e.target.value })}
              >
                <option value="">اختر نوع العقد</option>
                <option value="direct">مباشر</option>
                <option value="mortgage">رهن</option>
                <option value="installment">تقسيط</option>
              </select>
            </div>

            <div className="form-field">
              <label>نوع التمويل</label>
              <select
                value={form.finance_type}
                onChange={e => setForm({ ...form, finance_type: e.target.value })}
              >
                <option value="">اختر نوع التمويل</option>
                <option value="cash">نقدي</option>
                <option value="bank">بنكي</option>
                <option value="mortgage">رهن عقاري</option>
              </select>
            </div>

            <div className="form-field">
              <label>اسم الجهة التمويلية</label>
              <input
                value={form.finance_entity}
                onChange={e => setForm({ ...form, finance_entity: e.target.value })}
                placeholder="مثال: البنك الأهلي"
              />
            </div>

            <div className="form-field">
              <label>تاريخ بيع الوحدة *</label>
              <input
                type="date"
                value={form.sale_date}
                onChange={e => setForm({ ...form, sale_date: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>سعر بيع الوحدة قبل الضريبة *</label>
              <input
                type="number"
                value={form.price_before_tax}
                onChange={e => setForm({ ...form, price_before_tax: e.target.value })}
                min="0"
                step="0.01"
                required
              />
            </div>

          </div>
        </Card>
      </div>

      {/* ===== ACTIONS ===== */}
      <div style={{ display: 'flex', gap: 10, marginTop: '20px' }}>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
        >
          {loading ? 'جاري الحفظ...' : 'تأكيد التنفيذ'}
        </Button>
        
        <Button
          onClick={() => router.push('/dashboard/sales')}
          variant="danger"
        >
          إلغاء
        </Button>
      </div>

      {/* ===== STATUS INFO ===== */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#f5f5f5', 
        borderRadius: '4px',
        fontSize: '14px'
      }}>
        <h4>معلومات عن العملية:</h4>
        <p>بعد تنفيذ عملية البيع سيتم:</p>
        <ul>
          <li>تسجيل عملية البيع في جدول sales</li>
          <li>تغيير حالة الحجز من "نشط" إلى "تم التحويل"</li>
          <li>تغيير حالة الوحدة من "محجوزة" إلى "مباعة"</li>
          <li>تغيير حالة العميل من "محجوز" إلى "تم التحويل" (إذا كان العمود موجوداً)</li>
        </ul>
      </div>

    </div>
  );
}