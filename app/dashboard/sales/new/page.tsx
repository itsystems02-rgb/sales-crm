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
};

type Reservation = {
  id: string;
  unit_id: string;
  reservation_date: string;
};

type Unit = {
  id: string;
  unit_code: string;
  project_id: string;
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

  /* =====================
     Initial Load
  ===================== */

  useEffect(() => {
    fetchClients();
    fetchCurrentEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .order('name');

    if (error) {
      console.error(error);
      setClients([]);
      return;
    }

    setClients(data || []);
  }

  async function fetchCurrentEmployee() {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error(authErr);
    if (!user?.email) return;

    const { data, error } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (error) console.error(error);
    if (data?.id) setEmployeeId(data.id);
  }

  async function fetchReservations(cid: string) {
    const { data, error } = await supabase
      .from('reservations')
      .select('id, unit_id, reservation_date')
      .eq('client_id', cid)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setReservations([]);
    } else {
      setReservations(data || []);
    }

    // reset
    setReservationId('');
    setUnit(null);
  }

  async function fetchUnit(unitId: string) {
    const { data, error } = await supabase
      .from('units')
      .select('id, unit_code, project_id')
      .eq('id', unitId)
      .maybeSingle();

    if (error) {
      console.error(error);
      setUnit(null);
      return;
    }

    setUnit(data || null);
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

    // 1) insert sale
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

      sale_date: form.sale_date, // NOT NULL في DB
      price_before_tax: Number(form.price_before_tax), // NOT NULL في DB
    });

    if (saleError) {
      console.error(saleError);
      alert(saleError.message);
      setLoading(false);
      return;
    }

    // 2) update statuses (بعد نجاح insert فقط)
    const { error: resErr } = await supabase
      .from('reservations')
      .update({ status: 'converted' })
      .eq('id', reservationId);

    if (resErr) console.error(resErr);

    const { error: unitErr } = await supabase
      .from('units')
      .update({ status: 'sold' })
      .eq('id', unit.id);

    if (unitErr) console.error(unitErr);

    const { error: clientErr } = await supabase
      .from('clients')
      .update({ status: 'converted' })
      .eq('id', clientId);

    if (clientErr) console.error(clientErr);

    setLoading(false);
    router.push('/dashboard/sales');
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
                    {c.name}
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
                  const r = reservations.find(x => x.id === rid);
                  if (r) fetchUnit(r.unit_id);
                  else setUnit(null);
                }}
              >
                <option value="">اختر الحجز</option>
                {reservations.map(r => (
                  <option key={r.id} value={r.id}>
                    حجز بتاريخ {new Date(r.reservation_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>الوحدة</label>
              <input value={unit?.unit_code || ''} disabled />
            </div>

            <div className="form-field">
              <label>رقم عقد الدعم</label>
              <input
                value={form.contract_support_no}
                onChange={e => setForm({ ...form, contract_support_no: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>رقم عقد تلاد</label>
              <input
                value={form.contract_talad_no}
                onChange={e => setForm({ ...form, contract_talad_no: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>نوع العقد</label>
              <input
                value={form.contract_type}
                onChange={e => setForm({ ...form, contract_type: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>نوع التمويل</label>
              <input
                value={form.finance_type}
                onChange={e => setForm({ ...form, finance_type: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>اسم الجهة التمويلية</label>
              <input
                value={form.finance_entity}
                onChange={e => setForm({ ...form, finance_entity: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>تاريخ بيع الوحدة</label>
              <input
                type="date"
                value={form.sale_date}
                onChange={e => setForm({ ...form, sale_date: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label>سعر بيع الوحدة قبل الضريبة</label>
              <input
                type="number"
                value={form.price_before_tax}
                onChange={e => setForm({ ...form, price_before_tax: e.target.value })}
              />
            </div>

          </div>
        </Card>
      </div>

      {/* ===== ACTIONS ===== */}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
        >
          {loading ? 'جاري الحفظ...' : 'تأكيد التنفيذ'}
        </Button>
      </div>

    </div>
  );
}