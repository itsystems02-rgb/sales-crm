'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Unit = {
  id: string;
  unit_code: string;
  project_id: string;
  status: 'available' | 'reserved' | 'sold';
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
  const projectId = params.projectId as string; // لازم يجي مع params

  const [units, setUnits] = useState<Unit[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [lastFollowUp, setLastFollowUp] = useState<FollowUp | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);

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
  ====================== */
  useEffect(() => {
    fetchCurrentEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (employee) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  /* =====================
     Current Employee
  ====================== */
  async function fetchCurrentEmployee() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const { data } = await supabase
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .maybeSingle();

    if (data) {
      setEmployee(data);
      setEmployeeId(data.id);
    }
  }

  /* =====================
     Fetch Data
  ====================== */
  async function fetchData() {
    if (!employee) return;

    let query = supabase
      .from('units')
      .select('id, unit_code, project_id, status')
      .eq('project_id', projectId)
      .not('status', 'in', `('reserved','sold')`)
      .order('unit_code');

    // لو الموظف sales → وحداته فقط
    if (employee.role === 'sales') {
      const { data: empProjects } = await supabase
        .from('employee_projects')
        .select('project_id')
        .eq('employee_id', employee.id);

      const allowedProjectIds = (empProjects || []).map(p => p.project_id);
      if (allowedProjectIds.length > 0) {
        query = query.in('project_id', allowedProjectIds);
      } else {
        query = query.in('project_id', ['']); // مش هتشوف أي وحدات
      }
    }

    const { data: u } = await query;
    setUnits(u || []);

    // البنوك
    const { data: b } = await supabase
      .from('banks')
      .select('id, name')
      .order('name');
    setBanks(b || []);

    // آخر متابعة للعميل
    const { data: follow } = await supabase
      .from('client_followups')
      .select('employee_id, created_at, notes')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastFollowUp(follow || null);
  }

  /* =====================
     Submit Reservation
  ====================== */
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

    // تحديث حالة العميل والوحدة
    await supabase.from('clients').update({ status: 'reserved' }).eq('id', clientId);
    await supabase.from('units').update({ status: 'reserved' }).eq('id', unitId);

    setReservationId(data.id);
    setSaving(false);
  }

  /* =====================
     UI
  ====================== */
  return (
    <div className="page">
      {/* ===== TABS ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}`)}>البيانات</Button>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}?tab=followups`)}>المتابعات</Button>
        <Button variant="primary">حجز</Button>
      </div>

      <div className="details-layout">
        <Card title="بيانات الحجز">
          <div className="details-grid" style={{ gap: 12 }}>
            {/* الوحدة */}
            <div className="form-field">
              <label>الوحدة</label>
              <select value={unitId} onChange={e => setUnitId(e.target.value)}>
                <option value="">اختر الوحدة</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.unit_code}</option>
                ))}
              </select>
            </div>

            {/* التاريخ */}
            <div className="form-field">
              <label>تاريخ الحجز</label>
              <input type="date" value={reservationDate} onChange={e => setReservationDate(e.target.value)} />
            </div>

            {/* البنك */}
            <div className="form-field">
              <label>اسم البنك</label>
              <select value={bankName} onChange={e => setBankName(e.target.value)}>
                <option value="">اختر البنك</option>
                {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label>اسم موظف البنك</label>
              <input value={bankEmployeeName} onChange={e => setBankEmployeeName(e.target.value)} />
            </div>

            <div className="form-field">
              <label>رقم موظف البنك</label>
              <input value={bankEmployeeMobile} onChange={e => setBankEmployeeMobile(e.target.value)} />
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

        {/* آخر متابعة */}
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

      {/* أزرار حفظ وعرض */}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        {!reservationId && (
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ الحجز'}
          </Button>
        )}
        {reservationId && (
          <Button onClick={() => router.push(`/dashboard/clients/${clientId}/reservations/${reservationId}`)}>
            عرض الحجز
          </Button>
        )}
      </div>
    </div>
  );
}