'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Sale = {
  id: string;
  sale_date: string | null;
  price_before_tax: number | null;
  finance_type: string | null;

  // ✅ بيانات إضافية من sales
  contract_support_no: string | null;
  contract_talad_no: string | null;
  contract_type: string | null;
  finance_entity: string | null;

  // ✅ IDs مهمين للحذف وإرجاع الحالات
  client_id: string;
  unit_id: string;
  reservation_id?: string | null; // لو موجود في جدول sales

  // Supabase بيرجعها Arrays
  client: { name: string }[] | null;
  unit: { unit_code: string }[] | null;
  employee: { name: string }[] | null;
};

/* =====================
   Page
===================== */

export default function SalesPage() {
  const router = useRouter();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchSales();
  }, []);

  /* =====================
     Fetch Sales
  ===================== */

  async function fetchSales() {
    setLoading(true);

    const { data, error } = await supabase
      .from('sales')
      .select(`
        id,
        sale_date,
        price_before_tax,
        finance_type,

        contract_support_no,
        contract_talad_no,
        contract_type,
        finance_entity,

        client_id,
        unit_id,
        reservation_id,

        client:clients!sales_client_id_fkey(name),
        unit:units!sales_unit_id_fkey(unit_code),
        employee:employees!sales_sales_employee_id_fkey(name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('FETCH SALES ERROR:', error);
      setSales([]);
      setLoading(false);
      return;
    }

    // ✅ بدون cast خطر — بس data هنا متوافقة مع الـ type
    setSales((data ?? []) as Sale[]);
    setLoading(false);
  }

  /* =====================
     Filter (لو فاضي اعرض الكل)
  ===================== */

  const filteredSales = useMemo(() => {
    const q = filter.trim();
    if (!q) return sales;

    return sales.filter(s => {
      const clientName = s.client?.[0]?.name ?? '';
      const unitCode = s.unit?.[0]?.unit_code ?? '';
      return clientName.includes(q) || unitCode.includes(q);
    });
  }, [sales, filter]);

  /* =====================
     Delete + rollback statuses
  ===================== */

  async function deleteSale(sale: Sale) {
    const ok = confirm(
      'هل أنت متأكد من حذف التنفيذ؟ سيتم إرجاع حالة العميل والوحدة والحجز (إن وُجد).'
    );
    if (!ok) return;

    setDeletingId(sale.id);

    // 1) حذف التنفيذ
    const { error: delErr } = await supabase
      .from('sales')
      .delete()
      .eq('id', sale.id);

    if (delErr) {
      alert(delErr.message);
      setDeletingId(null);
      return;
    }

    // 2) رجوع حالة الوحدة (نخليها reserved)
    const { error: unitErr } = await supabase
      .from('units')
      .update({ status: 'reserved' })
      .eq('id', sale.unit_id);

    if (unitErr) console.error('UNIT ROLLBACK ERROR:', unitErr);

    // 3) رجوع حالة العميل (reserved)
    const { error: clientErr } = await supabase
      .from('clients')
      .update({ status: 'reserved' })
      .eq('id', sale.client_id);

    if (clientErr) console.error('CLIENT ROLLBACK ERROR:', clientErr);

    // 4) رجوع حالة الحجز (لو reservation_id موجود في sales)
    if (sale.reservation_id) {
      const { error: resErr } = await supabase
        .from('reservations')
        .update({ status: 'active' })
        .eq('id', sale.reservation_id);

      if (resErr) console.error('RESERVATION ROLLBACK ERROR:', resErr);
    }

    setDeletingId(null);
    fetchSales();
  }

  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">

      {/* ===== Tabs ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button variant="primary">التنفيذات</Button>

        <Button onClick={() => router.push('/dashboard/sales/new')}>
          تنفيذ جديد
        </Button>

        <Button onClick={fetchSales}>تحديث</Button>
      </div>

      <div className="details-layout">
        <Card title="قائمة التنفيذات">

          {/* ===== Filter ===== */}
          <div style={{ marginBottom: 15 }}>
            <input
              placeholder="بحث باسم العميل أو رقم الوحدة"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>

          {filteredSales.length === 0 ? (
            <div>لا توجد عمليات تنفيذ</div>
          ) : (
            <div className="units-scroll">
              <table>
                <thead>
                  <tr>
                    <th>العميل</th>
                    <th>الوحدة</th>
                    <th>تاريخ البيع</th>
                    <th>السعر</th>
                    <th>نوع التمويل</th>
                    <th>الجهة التمويلية</th>
                    <th>عقد الدعم</th>
                    <th>عقد تلاد</th>
                    <th>الموظف</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSales.map(sale => (
                    <tr key={sale.id}>
                      <td>{sale.client?.[0]?.name || '-'}</td>
                      <td>{sale.unit?.[0]?.unit_code || '-'}</td>

                      <td>
                        {sale.sale_date
                          ? new Date(sale.sale_date).toLocaleDateString()
                          : '-'}
                      </td>

                      <td>
                        {sale.price_before_tax != null
                          ? Number(sale.price_before_tax).toLocaleString()
                          : '-'}
                      </td>

                      <td>{sale.finance_type || '-'}</td>
                      <td>{sale.finance_entity || '-'}</td>
                      <td>{sale.contract_support_no || '-'}</td>
                      <td>{sale.contract_talad_no || '-'}</td>
                      <td>{sale.employee?.[0]?.name || '-'}</td>

                      <td style={{ display: 'flex', gap: 6 }}>
                        <Button onClick={() => router.push(`/dashboard/sales/${sale.id}`)}>
                          عرض
                        </Button>

                        <Button
                          variant="danger"
                          disabled={deletingId === sale.id}
                          onClick={() => deleteSale(sale)}
                        >
                          {deletingId === sale.id ? 'جاري الحذف...' : 'حذف'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </Card>
      </div>
    </div>
  );
}