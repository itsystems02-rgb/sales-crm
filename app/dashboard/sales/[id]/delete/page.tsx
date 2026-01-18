'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type SaleRow = {
  id: string;
  client_id: string;
  unit_id: string;
  project_id: string;
};

export default function DeleteSalePage() {
  const params = useParams();
  const router = useRouter();
  const saleId = params.id as string;

  const [sale, setSale] = useState<SaleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadSale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  async function loadSale() {
    setLoading(true);

    const { data, error } = await supabase
      .from('sales')
      .select('id, client_id, unit_id, project_id')
      .eq('id', saleId)
      .maybeSingle();

    if (error) console.error(error);

    setSale(data || null);
    setLoading(false);
  }

  async function handleDelete() {
    if (!sale) return;

    const ok = confirm('هل أنت متأكد من حذف التنفيذ؟');
    if (!ok) return;

    setDeleting(true);

    // 1) رجّع حالة الحجز المرتبط بالوحدة والعميل لنشط active (لو موجود)
    // بما إن جدول sales ما فيه reservation_id، هنجيب آخر حجز unit+client حالته converted
    const { data: reservation } = await supabase
      .from('reservations')
      .select('id')
      .eq('client_id', sale.client_id)
      .eq('unit_id', sale.unit_id)
      .eq('status', 'converted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reservation?.id) {
      await supabase
        .from('reservations')
        .update({ status: 'active' })
        .eq('id', reservation.id);
    }

    // 2) رجّع حالة الوحدة إلى reserved (لأنها كانت محجوزة قبل التنفيذ)
    await supabase.from('units').update({ status: 'reserved' }).eq('id', sale.unit_id);

    // 3) رجّع حالة العميل إلى reserved (لأنه كان محجوز قبل التنفيذ)
    await supabase.from('clients').update({ status: 'reserved' }).eq('id', sale.client_id);

    // 4) احذف التنفيذ
    const { error: delErr } = await supabase.from('sales').delete().eq('id', sale.id);

    if (delErr) {
      alert(delErr.message);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    router.push('/dashboard/sales');
  }

  if (loading) return <div className="page">جاري التحميل...</div>;
  if (!sale) return <div className="page">التنفيذ غير موجود</div>;

  return (
    <div className="page">
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button onClick={() => router.push('/dashboard/sales')}>رجوع</Button>
        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'جاري الحذف...' : 'تأكيد حذف التنفيذ'}
        </Button>
      </div>

      <div className="details-layout">
        <Card title="تأكيد حذف التنفيذ">
          <div style={{ lineHeight: 1.9 }}>
            <div>سيتم حذف التنفيذ نهائيًا.</div>
            <div>وسيتم إرجاع:</div>
            <ul style={{ marginTop: 10 }}>
              <li>حالة الوحدة إلى: <b>reserved</b></li>
              <li>حالة العميل إلى: <b>reserved</b></li>
              <li>حالة الحجز إلى: <b>active</b> (إن وُجد)</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}