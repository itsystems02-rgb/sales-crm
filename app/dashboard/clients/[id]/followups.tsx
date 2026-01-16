'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

type FollowUp = {
  id: string;
  type: 'call' | 'whatsapp' | 'visit';
  notes: string | null;
  next_follow_up_date: string | null;
  visit_location: string | null;
  created_at: string;
};

const TYPES = [
  { value: 'call', label: 'مكالمة' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'visit', label: 'زيارة' },
];

export default function FollowUps({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [type, setType] = useState<'call' | 'whatsapp' | 'visit'>('call');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [visitLocation, setVisitLocation] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* =========================
     LOAD DATA
  ========================= */

  useEffect(() => {
    fetchFollowUps();
  }, [clientId]);

  useEffect(() => {
    getEmployee();
  }, []);

  async function getEmployee() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) return;

    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('email', user.email)
      .single();

    if (data) setEmployeeId(data.id);
  }

  async function fetchFollowUps() {
    const { data } = await supabase
      .from('client_followups')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    setItems((data as FollowUp[]) || []);
  }

  /* =========================
     ADD FOLLOW UP
  ========================= */

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

    const { error } = await supabase.from('client_followups').insert({
      client_id: clientId,
      employee_id: employeeId,
      type,
      notes: notes || null,
      next_follow_up_date: nextDate || null,
      visit_location: type === 'visit' ? visitLocation : null,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    // تحديث حالة العميل تلقائي
    const status = type === 'visit' ? 'visited' : 'interested';

    await supabase.from('clients').update({ status }).eq('id', clientId);

    // reset
    setNotes('');
    setNextDate('');
    setVisitLocation('');
    setType('call');
    setLoading(false);

    fetchFollowUps();
  }

  /* =========================
     UI
  ========================= */

  return (
    <>
      <Card title="إضافة متابعة">
        <div className="form-col">
          <select value={type} onChange={(e) => setType(e.target.value as any)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
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
            placeholder="ملاحظات"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ minHeight: 80 }}
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
        <Table
          headers={[
            'النوع',
            'الملاحظات',
            'مكان الزيارة',
            'المتابعة القادمة',
            'التاريخ',
          ]}
        >
          {items.map((f) => (
            <tr key={f.id}>
              <td>{f.type}</td>
              <td>{f.notes || '-'}</td>
              <td>{f.visit_location || '-'}</td>
              <td>{f.next_follow_up_date || '-'}</td>
              <td>{new Date(f.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}