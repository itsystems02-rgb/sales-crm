'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type Unit = {
  id: string;
  name: string;
};

type Employee = {
  id: string;
  name: string;
};

export default function ReservationPage() {
  const { id: clientId } = useParams();
  const router = useRouter();

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
    const { data: u } = await supabase.from('units').select('id,name');
    const { data: e } = await supabase.from('employees').select('id,name');

    setUnits(u || []);
    setEmployees(e || []);
  }

  async function submit() {
    const { error } = await supabase.from('reservations').insert({
      client_id: clientId,
      unit_id: unitId,
      reservation_date: reservationDate,

      bank_name: bankName,
      bank_employee_name: bankEmployeeName,
      bank_employee_mobile: bankEmployeeMobile,

      status,
      notes,

      follow_employee_id: followEmployeeId || null,
      last_follow_up_at: followUpDate || null,
      follow_up_details: followUpDetails || null,
    });

    if (!error) {
      router.back();
    }
  }

  return (
    <div className="page">
      <Card title="حجز وحدة">
        <div className="form-grid">

          <select value={unitId} onChange={e => setUnitId(e.target.value)}>
            <option value="">اختر الوحدة</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <input type="date" onChange={e => setReservationDate(e.target.value)} />

          <input placeholder="اسم البنك" onChange={e => setBankName(e.target.value)} />
          <input placeholder="اسم موظف البنك" onChange={e => setBankEmployeeName(e.target.value)} />
          <input placeholder="رقم موظف البنك" onChange={e => setBankEmployeeMobile(e.target.value)} />

          <select onChange={e => setStatus(e.target.value)}>
            <option value="">حالة الطلب</option>
            <option value="تم رفع الطلب">تم رفع الطلب</option>
            <option value="قيد المراجعة">قيد المراجعة</option>
            <option value="تم القبول">تم القبول</option>
            <option value="مرفوض">مرفوض</option>
          </select>

          <textarea placeholder="ملاحظات" onChange={e => setNotes(e.target.value)} />

        </div>
      </Card>

      <Card title="المتابعة">
        <div className="form-grid">

          <select onChange={e => setFollowEmployeeId(e.target.value)}>
            <option value="">موظف المتابعة</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          <input type="date" onChange={e => setFollowUpDate(e.target.value)} />

          <textarea
            placeholder="تفاصيل المتابعة"
            onChange={e => setFollowUpDetails(e.target.value)}
          />

        </div>
      </Card>

      <Button variant="primary" onClick={submit}>
        حفظ الحجز
      </Button>
    </div>
  );
}