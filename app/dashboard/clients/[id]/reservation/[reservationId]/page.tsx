'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Reservation = {
  id: string;
  reservation_date: string;
  bank_name: string | null;
  bank_employee_name: string | null;
  bank_employee_mobile: string | null;
  notes: string | null;
  status: string;

  client_id: string;
  unit_id: string;
  employee_id: string | null;

  follow_employee_id: string | null;
  last_follow_up_at: string | null;
  follow_up_details: string | null;
};

type Client = {
  name: string;
  mobile: string;
  identity_no: string | null;
  status: string;
};

type Unit = {
  unit_code: string;
  block_no: string | null;
};

type Employee = {
  name: string;
};

/* =====================
   Page
===================== */

export default function ReservationViewPage() {
  const params = useParams();
  const router = useRouter();

  const clientId = params.id as string;
  const reservationId = params.reservationId as string;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);

  const [salesEmployee, setSalesEmployee] = useState<Employee | null>(null);
  const [followEmployee, setFollowEmployee] = useState<Employee | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  async function fetchAll() {
    setLoading(true);

    /* ========= Reservation ========= */
    const { data: r } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .maybeSingle();

    if (!r) {
      setLoading(false);
      return;
    }

    setReservation(r);

    /* ========= Client ========= */
    const { data: c } = await supabase
      .from('clients')
      .select('name, mobile, identity_no, status')
      .eq('id', r.client_id)
      .maybeSingle();

    setClient(c || null);

    /* ========= Unit ========= */
    const { data: u } = await supabase
      .from('units')
      .select('unit_code, block_no')
      .eq('id', r.unit_id)
      .maybeSingle();

    setUnit(u || null);

    /* ========= Sales Employee ========= */
    if (r.employee_id) {
      const { data } = await supabase
        .from('employees')
        .select('name')
        .eq('id', r.employee_id)
        .maybeSingle();

      setSalesEmployee(data || null);
    }

    /* ========= Follow-up Employee ========= */
    if (r.follow_employee_id) {
      const { data } = await supabase
        .from('employees')
        .select('name')
        .eq('id', r.follow_employee_id)
        .maybeSingle();

      setFollowEmployee(data || null);
    }

    setLoading(false);
  }

  if (loading) return <div className="page">جاري التحميل...</div>;
  if (!reservation || !client) return <div className="page">الحجز غير موجود</div>;

  return (
    <div className="page">

      {/* ===== TOP ACTION ===== */}
      <div style={{ marginBottom: 20 }}>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}`)}>
          رجوع للعميل
        </Button>
      </div>

      {/* ================= CLIENT ================= */}
      <Card title="بيانات العميل">
        <div className="details-grid">
          <Detail label="اسم العميل" value={client.name} />
          <Detail label="رقم الجوال" value={client.mobile} />
          <Detail label="رقم الهوية" value={client.identity_no || '-'} />
          <Detail label="حالة العميل" value={client.status} badge />
        </div>
      </Card>

      {/* ================= RESERVATION ================= */}
      <Card title="بيانات الحجز">
        <div className="details-grid">
          <Detail label="رقم الوحدة" value={unit?.unit_code || '-'} />
          <Detail label="رقم البلوك" value={unit?.block_no || '-'} />
          <Detail
            label="تاريخ الحجز"
            value={new Date(reservation.reservation_date).toLocaleDateString()}
          />
          <Detail label="حالة الحجز" value={reservation.status} badge />
        </div>
      </Card>

      {/* ================= BANK ================= */}
      <Card title="بيانات البنك">
        <div className="details-grid">
          <Detail label="اسم البنك" value={reservation.bank_name || '-'} />
          <Detail label="اسم موظف البنك" value={reservation.bank_employee_name || '-'} />
          <Detail label="رقم موظف البنك" value={reservation.bank_employee_mobile || '-'} />
        </div>
      </Card>

      {/* ================= NOTES ================= */}
      <Card title="ملاحظات">
        <div>{reservation.notes || '-'}</div>
      </Card>

      {/* ================= EMPLOYEES ================= */}
      <Card title="بيانات الموظفين">
        <div className="details-grid">
          <Detail label="الموظف القائم بالحجز" value={salesEmployee?.name || '-'} />
          <Detail
            label="تاريخ آخر متابعة"
            value={
              reservation.last_follow_up_at
                ? new Date(reservation.last_follow_up_at).toLocaleDateString()
                : '-'
            }
          />
          <Detail label="موظف المتابعة" value={followEmployee?.name || '-'} />
        </div>
      </Card>

      {/* ================= FOLLOW DETAILS ================= */}
      <Card title="تفاصيل المتابعة">
        <div>{reservation.follow_up_details || '-'}</div>
      </Card>

    </div>
  );
}

/* =====================
   Small UI Component
===================== */

function Detail({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="detail-row">
      <span className="label">{label}</span>
      <span className={badge ? 'value badge' : 'value'}>{value}</span>
    </div>
  );
}