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
};

/* =====================
   Page
===================== */

export default function NewSalePage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const [clientId, setClientId] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [unitId, setUnitId] = useState('');

  const [form, setForm] = useState({
    contract_support_no: '',
    contract_talad_no: '',
    contract_type: '',
    finance_type: '',
    finance_entity: '',
    sale_date: '',
    price_before_tax: '',
  });

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* =====================
     Fetch initial data
  ===================== */

  useEffect(() => {
    fetchClients();
    fetchEmployee();
  }, []);

  async function fetchClients() {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .order('name');

    setClients(data || []);
  }

  async function fetchEmployee() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) setEmployeeId(user.id);
  }

  async function fetchReservations(clientId: string) {
    const { data } = await supabase
      .from('reservations')
      .select('id, unit_id, reservation_date')
      .eq('client_id', clientId)
      .eq('status', 'active');

    setReservations(data || []);
  }

  async function fetchUnit(unitId: string) {
    const { data } = await supabase
      .from('units')
      .select('id, unit_code')
      .eq('id', unitId)
      .maybeSingle();

    setUnits(data ? [data] : []);
  }

  /* =====================
     Submit
  ===================== */

  async function handleSubmit() {
    if (!clientId || !reservationId || !unitId || !employeeId) return;

    setLoading(true);

    /* === Insert Sale === */
    await supabase.from('sales').insert({
      client_id: clientId,
      unit_id: unitId,
      contract_support_no: form.contract_support_no,
      contract_talad_no: form.contract_talad_no,
      contract_type: form.contract_type,
      finance_type: form.finance_type,
      finance_entity: form.finance_entity,
      sale_date: form.sale_date,
      price_before_tax: Number(form.price_before_tax),
      sales_employee_id: employeeId,
    });

    /* === Update statuses === */
    await supabase
      .from('reservations')
      .update({ status: 'converted' })
      .eq('id', reservationId);

    await supabase
      .from('clients')
      .update({ status: 'converted' })
      .eq('id', clientId);

    await supabase
      .from('units')
      .update({ status: 'sold' })
      .eq('id', unitId);

    setLoading(false);
    router.push('/dashboard/sales');
  }

  return (
    <div className="page">
      <Card title="تنفيذ بيع وحدة">

        {/* العميل */}
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
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* الحجز */}
        <label>الحجز</label>
        <select
          value={reservationId}
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

        {/* بيانات العقد */}
        <input placeholder="رقم عقد الدعم" onChange={e => setForm({ ...form, contract_support_no: e.target.value })} />
        <input placeholder="رقم عقد تلاد" onChange={e => setForm({ ...form, contract_talad_no: e.target.value })} />
        <input placeholder="نوع العقد" onChange={e => setForm({ ...form, contract_type: e.target.value })} />
        <input placeholder="نوع التمويل" onChange={e => setForm({ ...form, finance_type: e.target.value })} />
        <input placeholder="الجهة التمويلية" onChange={e => setForm({ ...form, finance_entity: e.target.value })} />
        <input type="date" onChange={e => setForm({ ...form, sale_date: e.target.value })} />
        <input type="number" placeholder="سعر البيع قبل الضريبة" onChange={e => setForm({ ...form, price_before_tax: e.target.value })} />

        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? 'جاري الحفظ...' : 'تأكيد التنفيذ'}
        </Button>

      </Card>
    </div>
  );
}