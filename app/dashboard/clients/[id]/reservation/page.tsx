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

  // ✅ الموظف الحالي اللي عامل الحجز
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [unitId, setUnitId] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankEmployeeName, setBankEmployeeName] = useState('');
  const [bankEmployeeMobile, setBankEmployeeMobile] = useState('');
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');

  // 🔥 ID الحجز بعد الحفظ
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
    fetchCurrentEmployee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =====================
     Fetch Current Employee
  ===================== */

  async function fetchCurrentEmployee() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return;

    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (data?.id) setEmployeeId(data.id);
  }

  /* =====================
     Fetch Data
  ===================== */

  async function fetchData() {
    // الوحدات المتاحة
    const { data: u } = await supabase
      .from('units')
      .select('id, unit_code')
      .neq('status', 'reserved');

    setUnits(u || []);

    // البنوك
    const { data: b } = await supabase
      .from('banks')
      .select('id, name')
      .order('name');

    setBanks(b || []);

    // آخر متابعة
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
     Submit
  ===================== */

  async function submit() {
    if (!unitId || !reservationDate) {
      alert('من فضلك اختر الوحدة وتاريخ الحجز');
      return;
    }

    if (!employeeId) {
      alert('لم يتم تحديد الموظف الحالي (employee_id)');
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('reservations')
      .insert({
        client_id: clientId,
        unit_id: unitId,

        // ✅ أهم سطر: الموظف اللي عمل الحجز
        employee_id: employeeId,

        reservation_date: reservationDate,

        bank_name: bankName || null,
        bank_employee_name: bankEmployeeName || null,
        bank_employee_mobile: bankEmployeeMobile || null,

        status: status || 'تم الحجز',
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

    // تحديث حالة العميل
    await supabase
      .from('clients')
      .update({ status: 'reserved' })
      .eq('id', clientId);

    // تحديث حالة الوحدة
    await supabase
      .from('units')
      .update({ status: 'reserved' })
      .eq('id', unitId);

    // حفظ ID الحجز
    setReservationId(data.id);
    setSaving(false);
  }

  /* =====================
     UI
  ===================== */

  return (
    <div className="page">
      {/* ===== TOP TABS ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}`)}>
          البيانات
        </Button>

        <Button
          onClick={() => router.push(`/dashboard/clients/${clientId}?tab=followups`)}
        >
          المتابعات
        </Button>

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
                  <option key={u.id} value={u.id}>
                    {u.unit_code}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>تاريخ الحجز</label>
              <input
                type="date"
                value={reservationDate}
                onChange={e => setReservationDate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>اسم البنك</label>
              <select value={bankName} onChange={e => setBankName(e.target.value)}>
                <option value="">اختر البنك</option>
                {banks.map(bank => (
                  <option key={bank.id} value={bank.name}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>اسم موظف البنك</label>
              <input
                value={bankEmployeeName}
                onChange={e => setBankEmployeeName(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>رقم موظف البنك</label>
              <input
                value={bankEmployeeMobile}
                onChange={e => setBankEmployeeMobile(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>حالة الطلب</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">اختر الحالة</option>
                <option value="تم رفع الطلب">تم رفع الطلب</option>
                <option value="قيد المراجعة">قيد المراجعة</option>
                <option value="تم القبول">تم القبول</option>
                <option value="مرفوض">مرفوض</option>
              </select>
            </div>

            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label>ملاحظات</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </Card>

        <Card title="آخر متابعة (تلقائي)">
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

      {/* ===== ACTIONS ===== */}
      <div style={{ display: 'flex', gap: 10 }}>
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