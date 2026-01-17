'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */

type FollowUp = {
  id: string;
  type: 'call' | 'whatsapp' | 'visit';
  notes: string | null;
  next_follow_up_date: string | null;
  visit_location: string | null;
  created_at: string;
  employee: { name: string } | null;
};

/* =====================
   Constants
===================== */

const TYPES = [
  { value: 'call', label: 'مكالمة' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'visit', label: 'زيارة' },
];

const DETAILS_OPTIONS = [
  'لم يتم الرد',
  'مهتم',
  'غير مهتم',
  'طلب متابعة لاحقًا',
  'تم إرسال التفاصيل',
  'تم تحديد موعد',
  'تمت الزيارة',
  'العميل غير متواجد',
];

/* =====================
   Component
===================== */

export default function FollowUps({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [type, setType] = useState<'call' | 'whatsapp' | 'visit'>('call');
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [visitLocation, setVisitLocation] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* =====================
     LOAD
  ===================== */

  useEffect(() => {
    fetchFollowUps();
  }, [clientId]);

  useEffect(() => {
    getEmployee();
  }, []);

  async function getEmployee() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (data) setEmployeeId(data.id);
  }

  async function fetchFollowUps() {
    const { data, error } = await supabase
      .from('client_followups')
      .select(`
        id,
        type,
        notes,
        next_follow_up_date,
        visit_location,
        created_at,
        employee:employees!client_followups_employee_id_fkey (
          name
        )
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setItems([]);
      return;
    }

    // 🔥 تحويل صحيح بدون Arrays
    const normalized: FollowUp[] = (data ?? []).map((f: any) => ({
      ...f,
      employee: f.employee ?? null,
    }));

    setItems(normalized);
  }

  /* =====================
     ADD
  ===================== */

  async function addFollowUp() {
    if (!employeeId) {
      alert('لم يتم تحديد الموظف');
      return;
    }

    if (type === 'visit' && !visitLocation) {
      alert('من فضلك أدخل مكان الزيارة');
      return;
    }

    setLoading(true);

    const finalNotes =
      details && notes
        ? `${details} - ${notes}`
        : details || notes || null;

    const { error } = await supabase.from('client_followups').insert({
      client_id: clientId,
      employee_id: employeeId,
      type,
      notes: finalNotes,
      next_follow_up_date: nextDate || null,
      visit_location: type === 'visit' ? visitLocation : null,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    // تحديث حالة العميل
    const status = type === 'visit' ? 'visited' : 'interested';
    await supabase.from('clients').update({ status }).eq('id', clientId);

    setDetails('');
    setNotes('');
    setNextDate('');
    setVisitLocation('');
    setType('call');
    setLoading(false);

    fetchFollowUps();
  }

  function typeLabel(t: string) {
    return TYPES.find(x => x.value === t)?.label || t;
  }

  /* =====================
     UI
  ===================== */

  return (
    <>
      <Card title="إضافة متابعة">
        <div className="form-col">
          <select value={type} onChange={(e) => setType(e.target.value as any)}>
            {TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select value={details} onChange={(e) => setDetails(e.target.value)}>
            <option value="">تفاصيل المتابعة</option>
            {DETAILS_OPTIONS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {type === 'visit' && (
            <input
              placeholder="مكان الزيارة"
              value={visitLocation}
              onChange={(e) => setVisitLocation(e.target.value)}
            />
          )}

          <textarea
            placeholder="ملاحظات إضافية"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ minHeight: 90 }}
          />

          <input
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
          />

          <Button onClick={addFollowUp} disabled={loading}>
            حفظ
          </Button>
        </div>
      </Card>

      <Card title="سجل المتابعات">
        <Table headers={['النوع','التفاصيل','مكان الزيارة','المتابعة القادمة','الموظف','التاريخ']}>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center' }}>لا توجد متابعات</td>
            </tr>
          ) : (
            items.map(f => (
              <tr key={f.id}>
                <td>{typeLabel(f.type)}</td>
                <td>{f.notes || '-'}</td>
                <td>{f.visit_location || '-'}</td>
                <td>{f.next_follow_up_date || '-'}</td>
                <td>{f.employee?.name || '-'}</td>
                <td>{new Date(f.created_at).toLocaleDateString()}</td>
              </tr>
            ))
          )}
        </Table>
      </Card>
    </>
  );
}