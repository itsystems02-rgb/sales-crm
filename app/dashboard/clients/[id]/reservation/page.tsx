'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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

type Employee = {
  id: string;
  role: 'admin' | 'sales';
};

type ReservationStatus = 'active' | 'cancelled' | 'converted';

/* =====================
   Page
===================== */

export default function ReservationPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [lastFollowUp, setLastFollowUp] = useState<FollowUp | null>(null);
  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState<string | null>(null);
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
    setLoading(true);

    // 1️⃣ Current employee
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setLoading(false);
      return;
    }

    const { data: emp } = await supabase
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .maybeSingle();

    if (!emp?.id) {
      setLoading(false);
      return;
    }

    setEmployee(emp);
    setEmployeeId(emp.id);

    // 2️⃣ Load units
    let unitQuery = supabase
      .from('units')
      .select('id, unit_code, project_id')
      .neq('status', 'reserved')
      .neq('status', 'sold')
      .order('unit_code');

    if (emp.role === 'sales') {
      // جلب المشاريع الخاصة بالـ sales
      const { data: empProjects } = await supabase
        .from('employee_projects')
        .select('project_id')
        .eq('employee_id', emp.id);

      const allowedIds = (empProjects || []).map(p => p.project_id);
      if (allowedIds.length > 0) {
        unitQuery = unitQuery.in('project_id', allowedIds);
      } else {
        unitQuery = unitQuery.in('project_id', ['']); // لا تظهر أي وحدة لو مفيش مشاريع
      }
    }

    const { data: u, error: unitsError } = await unitQuery;
    if (unitsError) console.error('Units fetch error:', unitsError);
    setUnits(u || []);

    // 3️⃣ Load banks
    const { data: b, error: banksError } = await supabase
      .from('banks')
      .select('id,name')
      .order('name');

    if (banksError) console.error('Banks fetch error:', banksError);
    setBanks(b || []);

    // 4️⃣ Load last follow-up
    const { data: follow } = await supabase
      .from('client_followups')
      .select('employee_id, created_at, notes')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setLastFollowUp(follow || null);

    setLoading(false);
  }

  /* =====================
     Submit Reservation
  ===================== */
  async function submit() {
    if (!unitId || !reservationDate) {
      alert('من فضلك اختر الوحدة وتاريخ الحجز');
      return;
    }

    if (!employeeId) {
      alert('لم يتم تحديد الموظف الحالي');
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('reservations')
      .insert({
        client_id: clientId,
        unit_id: unitId,
        employee_id: employeeId,
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

    await supabase.from('clients').update({ status: 'reserved' }).eq('id', clientId);
    await supabase.from('units').update({ status: 'reserved' }).eq('id', unitId);

    setReservationId(data.id);
    setSaving(false);
  }

  /* =====================
     UI
  ===================== */
  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">

      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}`)}>البيانات</Button>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}?tab=followups`)}>المتابعات</Button>
        <Button variant="primary">حجز</Button>
      </div>

      <div className="details-layout">
        <Card title="بيانات الحجز">
          <div className="details-grid">

            <div className="form-field">
              <label>الوحدة</label>
              <select value={unitId} onChange={e => setUnitId(e.target.value)}>
                <option value="">اختر الوحدة</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.unit_code}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>تاريخ الحجز</label>
              <Input type="date" value={reservationDate} onChange={e => setReservationDate(e.target.value)} />
            </div>

            <div className="form-field">
              <label>اسم البنك</label>
              <select value={bankName} onChange={e => setBankName(e.target.value)}>
                <option value="">اختر البنك</option>
                {banks.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
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
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ الحجز'}
          </Button>
        )}
        {reservationId && (
          <Button onClick={() => router.push(`/dashboard/reservations/${reservationId}`)}>
            عرض الحجز
          </Button>
        )}
      </div>
    </div>
  );
}