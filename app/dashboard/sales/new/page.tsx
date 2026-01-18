'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

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

export default function NewSalePage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [unit, setUnit] = useState<Unit | null>(null);

  const [clientId, setClientId] = useState('');
  const [reservationId, setReservationId] = useState('');
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (data?.id) setEmployeeId(data.id);
  }

  async function fetchReservations(cid: string) {
    const { data } = await supabase
      .from('reservations')
      .select('id, unit_id, reservation_date')
      .eq('client_id', cid)
      .eq('status', 'active');

    setReservations(data || []);
    setReservationId('');
    setUnit(null);
  }

  async function fetchUnit(unitId: string) {
    const { data } = await supabase
      .from('units')
      .select('id, unit_code, project_id')
      .eq('id', unitId)
      .maybeSingle();

    setUnit(data || null);
  }

  async function handleSubmit() {
    if (!clientId || !reservationId || !unit || !employeeId) return;

    setLoading(true);

    const { error } = await supabase.from('sales').insert({
      client_id: clientId,
      unit_id: unit.id,
      project_id: unit.project_id, // ✅ الحل الأساسي
      sales_employee_id: employeeId,

      contract_support_no: form.contract_support_no,
      contract_talad_no: form.contract_talad_no,
      contract_type: form.contract_type,
      finance_type: form.finance_type,
      finance_entity: form.finance_entity,
      sale_date: form.sale_date,
      price_before_tax: Number(form.price_before_tax),
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
      .eq('id', unit.id);

    await supabase.from('clients')
      .update({ status: 'converted' })
      .eq('id', clientId);

    router.push('/dashboard/sales');
  }

  return (
    <div className="page">
      <Card title="تنفيذ بيع وحدة">
        <div className="details-grid">

          <div className="form-field">
            <label>العميل</label>
            <select value={clientId} onChange={e => {
              setClientId(e.target.value);
              fetchReservations(e.target.value);
            }}>
              <option value="">اختر العميل</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>الحجز</label>
            <select value={reservationId} onChange={e => {
              setReservationId(e.target.value);
              const r = reservations.find(x => x.id === e.target.value);
              if (r) fetchUnit(r.unit_id);
            }}>
              <option value="">اختر الحجز</option>
              {reservations.map(r => (
                <option key={r.id} value={r.id}>
                  {new Date(r.reservation_date).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>الوحدة</label>
            <input value={unit?.unit_code || ''} disabled />
          </div>

          {Object.keys(form).map(key => (
            <div className="form-field" key={key}>
              <label>{key}</label>
              <input
                value={(form as any)[key]}
                onChange={e => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}

        </div>

        <Button variant="primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'جاري الحفظ...' : 'تأكيد التنفيذ'}
        </Button>
      </Card>
    </div>
  );
}