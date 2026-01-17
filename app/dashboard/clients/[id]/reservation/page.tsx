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
  name: string;
};

type Employee = {
  id: string;
  name: string;
};

/* =====================
   Page
===================== */

export default function ReservationPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [units, setUnits] = useState<Unit[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [unitId, setUnitId] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankEmployeeName, setBankEmployeeName] = useState('');
  const [bankEmployeeMobile, setBankEmployeeMobile] = useState('');
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');

  const [followEmployeeId, setFollowEmployeeId] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpDetails, setFollowUpDetails] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: u } = await supabase
      .from('units')
      .select('id, name');

    const { data: e } = await supabase
      .from('employees')
      .select('id, name');

    setUnits(u || []);
    setEmployees(e || []);
  }

  async function submit() {
    if (!unitId || !reservationDate) {
      alert('من فضلك اختر الوحدة وتاريخ الحجز');
      return;
    }

    const { error } = await supabase.from('reservations').insert({
      client_id: clientId,
      unit_id: unitId,
      reservation_date: reservationDate,

      bank_name: bankName || null,
      bank_employee_name: bankEmployeeName || null,
      bank_employee_mobile: bankEmployeeMobile || null,

      status: status || null,
      notes: notes || null,

      follow_employee_id: followEmployeeId || null,
      last_follow_up_at: followUpDate || null,
      follow_up_details: followUpDetails || null,
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.back();
  }

  return (
    <div className="page">

      {/* ===== TOP TABS ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button
          onClick={() => router.push(`/dashboard/clients/${clientId}`)}
        >
          البيانات
        </Button>

        <Button
          onClick={() =>
            router.push(`/dashboard/clients/${clientId}?tab=followups`)
          }
        >
          المتابعات
        </Button>

        <Button variant="primary">
          حجز
        </Button>
      </div>

      {/* ================= RESERVATION ================= */}
      <div className="details-layout">

        <Card title="بيانات الحجز">
          <div className="details-grid">

            <div className="form-field">
              <label>الوحدة</label>
              <select value={unitId} onChange={e => setUnitId(e.target.value)}>
                <option value="">اختر الوحدة</option>
                {units.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
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
              <input
                value={bankName}
                onChange={e => setBankName(e.target.value)}
              />
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
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

          </div>
        </Card>

        {/* ================= FOLLOW ================= */}
        <Card title="بيانات المتابعة">
          <div className="details-grid">

            <div className="form-field">
              <label>موظف المتابعة</label>
              <select
                value={followEmployeeId}
                onChange={e => setFollowEmployeeId(e.target.value)}
              >
                <option value="">اختر الموظف</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>تاريخ آخر متابعة</label>
              <input
                type="date"
                value={followUpDate}
                onChange={e => setFollowUpDate(e.target.value)}
              />
            </div>

            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label>تفاصيل المتابعة</label>
              <textarea
                value={followUpDetails}
                onChange={e => setFollowUpDetails(e.target.value)}
              />
            </div>

          </div>
        </Card>

      </div>

      <Button variant="primary" onClick={submit}>
        حفظ الحجز
      </Button>
    </div>
  );
}