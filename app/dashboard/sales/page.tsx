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

  contract_support_no: string | null;
  contract_talad_no: string | null;

  client_id: string;
  unit_id: string;
  reservation_id: string | null;

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
        client_id,
        unit_id,
        reservation_id,

        client:clients!sales_client_id_fkey(name),
        unit:units!sales_unit_id_fkey(unit_code),
        employee:employees!sales_sales_employee_id_fkey(name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setSales([]);
    } else {
      setSales((data ?? []) as Sale[]);
    }

    setLoading(false);
  }

  /* =====================
     Delete Sale
  ===================== */

  async function deleteSale(sale: Sale) {
    const ok = confirm('هل أنت متأكد من حذف التنفيذ؟ سيتم إرجاع حالة العميل والوحدة.');
    if (!ok) return;

    setLoading(true);

    // 1️⃣ حذف التنفيذ
    const { error: deleteError } = await supabase
      .from('sales')
      .delete()
      .eq('id', sale.id);

    if (deleteError) {
      alert(deleteError.message);
      setLoading(false);
      return;
    }

    // 2️⃣ إرجاع حالة الوحدة
    await supabase
      .from('units')
      .update({ status: 'reserved' })
      .eq('id', sale.unit_id);

    // 3️⃣ إرجاع حالة العميل
    await supabase
      .from('clients')
      .update({ status: 'reserved' })
      .eq('id', sale.client_id);

    // 4️⃣ إرجاع حالة الحجز (لو موجود)
    if (sale.reservation_id) {
      await supabase
        .from('reservations')
        .update({ status: 'active' })
        .eq('id', sale.reservation_id);
    }

    fetchSales();
    setLoading(false);
  }

  /* =====================
     Filter
  ===================== */

  const filteredSales = useMemo(() => {
    const q = filter.trim();
    if (!q) return sales;

    return sales.filter(s =>
      s.client?.[0]?.name?.includes(q) ||
      s.unit?.[0]?.unit_code?.includes(q)
    );
  }, [sales, filter]);

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
                          ? sale.price_before_tax.toLocaleString()
                          : '-'}
                      </td>
                      <td>{sale.contract_support_no || '-'}</td>
                      <td>{sale.contract_talad_no || '-'}</td>
                      <td>{sale.employee?.[0]?.name || '-'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <Button
                          onClick={() =>
                            router.push(`/dashboard/sales/${sale.id}`)
                          }
                        >
                          عرض
                        </Button>

                        <Button
                          variant="danger"
                          onClick={() => deleteSale(sale)}
                        >
                          حذف
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