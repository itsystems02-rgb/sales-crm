'use client';

import { useEffect, useState } from 'react';
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
  const [unitId, setUnitId] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  /* ✅ form state ثابت */
  const [form, setForm] = useState({
    contract_support_no: '',
    contract_talad_no: '',
    contract_type: '',
    finance_type: '',
    finance_entity: '',
    sale_date: '',
    price_before_tax: '',
  });

  /* =====================
     Helpers
  ===================== */

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
    }));
  }

  /* =====================
     Initial Load
  ===================== */

  useEffect(() => {
    fetchClients();
    fetchCurrentEmployee();
  }, []);

  async function fetchClients() {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .order('name');

    setClients(data || []);
  }

  async function fetchCurrentEmployee() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (data?.id) setEmployeeId(data.id);
  }

  async function fetchReservations(clientId: string) {
    const { data } = await supabase
      .from('reservations')
      .select('id, unit_id, reservation_date')
      .eq('client_id', clientId)
      .eq('status', 'active');

    setReservations(data || []);
    setReservationId('');
    setUnit(null);
    setUnitId('');
  }

  async function fetchUnit(unitId: string) {
    const { data } = await supabase
      .from('units')
      .select('id, unit_code, project_id')
      .eq('id', unitId)
      .maybeSingle();

    setUnit(data || null);
  }

  /* =====================
     Submit
  ===================== */

  const canSubmit =
    clientId &&
    reservationId &&
    unit &&
    employeeId;

  async function handleSubmit() {
    if (!canSubmit) return;

    setLoading(true);

    const { error } = await supabase.from('sales').insert({
      client_id: clientId,
      unit_id: unit!.id,
      project_id: unit!.project_id,

      contract_support_no: form.contract_support_no || null,
      contract_talad_no: form.contract_talad_no || null,
      contract_type: form.contract_type || null,
      finance_type: form.finance_type || null,
      finance_entity: form.finance_entity || null,
      sale_date: form.sale_date || null,
      price_before_tax: form.price_before_tax
        ? Number(form.price_before_tax)
        : null,

      sales_employee_id: employeeId,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    await supabase.from('reservations')
      .update({ status: 'converted' })
      .eq('id', reservationId);

    await supabase.from('units')
      .update({ status: 'sold' })
      .eq('id', unit!.id);

    await supabase.from('clients')
      .update({ status: 'converted' })
      .eq('id', clientId);

    setLoading(false);
    router.push('/dashboard/sales');
  }

  /* =====================
     UI
  ===================== */

  return (
    <div className="page">

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
                  setClientId(e.target.value);
                  fetchReservations(e.target.value);
                }}
              >
                <option value="">اختر العميل</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>الحجز</label>
              <select
                value={reservationId}
                disabled={!reservations.length}
                onChange={e => {
                  const r = reservations.find(x => x.id === e.target.value);
                  setReservationId(e.target.value);
                  if (r) {
                    setUnitId(r.unit_id);
                    fetchUnit(r.unit_id);
                  }
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

            {/* ✅ inputs شغالة */}
            <div className="form-field">
              <label>رقم عقد الدعم</label>
              <input name="contract_support_no" value={form.contract_support_no} onChange={handleChange} />
            </div>

            <div className="form-field">
              <label>رقم عقد تلاد</label>
              <input name="contract_talad_no" value={form.contract_talad_no} onChange={handleChange} />
            </div>

            <div className="form-field">
              <label>نوع العقد</label>
              <input name="contract_type" value={form.contract_type} onChange={handleChange} />
            </div>

            <div className="form-field">
              <label>نوع التمويل</label>
              <input name="finance_type" value={form.finance_type} onChange={handleChange} />
            </div>

            <div className="form-field">
              <label>الجهة التمويلية</label>
              <input name="finance_entity" value={form.finance_entity} onChange={handleChange} />
            </div>

            <div className="form-field">
              <label>تاريخ البيع</label>
              <input type="date" name="sale_date" value={form.sale_date} onChange={handleChange} />
            </div>

            <div className="form-field">
              <label>سعر البيع قبل الضريبة</label>
              <input type="number" name="price_before_tax" value={form.price_before_tax} onChange={handleChange} />
            </div>

          </div>
        </Card>
      </div>

      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
      >
        {loading ? 'جاري الحفظ...' : 'تأكيد التنفيذ'}
      </Button>
    </div>
  );
}