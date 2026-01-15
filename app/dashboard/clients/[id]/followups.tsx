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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFollowUps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function fetchFollowUps() {
    const { data } = await supabase
      .from('client_followups')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    setItems((data as FollowUp[]) || []);
  }

  async function addFollowUp() {
    setLoading(true);

    const { error } = await supabase.from('client_followups').insert({
      client_id: clientId,
      type,
      notes: notes || null,
      next_follow_up_date: nextDate || null,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    // تحديث حالة العميل تلقائي
    const status = type === 'visit' ? 'visited' : 'interested';

    await supabase
      .from('clients')
      .update({ status })
      .eq('id', clientId);

    setNotes('');
    setNextDate('');
    setLoading(false);
    fetchFollowUps();
  }

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
        <Table headers={['النوع', 'الملاحظات', 'المتابعة القادمة', 'التاريخ']}>
          {items.map((f) => (
            <tr key={f.id}>
              <td>{f.type}</td>
              <td>{f.notes || '-'}</td>
              <td>{f.next_follow_up_date || '-'}</td>
              <td>{new Date(f.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}