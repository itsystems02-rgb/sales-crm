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
  sale_date: string;
  price_before_tax: number;
  finance_type: string | null;

  client: { id: string; name: string } | null;
  unit: { id: string; unit_code: string } | null;
  employee: { id: string; name: string } | null;
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
     Fetch Sales (✔️ صح)
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

        client:clients!sales_client_id_fkey (
          id,
          name
        ),
        unit:units!sales_unit_id_fkey (
          id,
          unit_code
        ),
        employee:employees!sales_sales_employee_id_fkey (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('FETCH SALES ERROR:', error);
      setSales([]);
    } else {
      setSales(data || []);
    }

    setLoading(false);
  }

  /* =====================
     Delete Sale
  ===================== */

  async function deleteSale(sale: Sale) {
    if (!confirm('هل أنت متأكد من حذف التنفيذ؟')) return;

    // حذف التنفيذ
    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', sale.id);

    if (error) {
      alert(error.message);
      return;
    }

    // إرجاع حالة الوحدة
    if (sale.unit?.id) {
      await supabase
        .from('units')
        .update({ status: 'reserved' })
        .eq('id', sale.unit.id);
    }

    // إرجاع حالة العميل
    if (sale.client?.id) {
      await supabase
        .from('clients')
        .update({ status: 'reserved' })
        .eq('id', sale.client.id);
    }

    fetchSales();
  }

  /* =====================
     Filter
  ===================== */

  const filteredSales = useMemo(() => {
    if (!filter.trim()) return sales;

    return sales.filter(s =>
      s.client?.name.includes(filter) ||
      s.unit?.unit_code.includes(filter)
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
                    <th>نوع التمويل</th>
                    <th>الموظف</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSales.map(sale => (
                    <tr key={sale.id}>
                      <td>{sale.client?.name || '-'}</td>
                      <td>{sale.unit?.unit_code || '-'}</td>
                      <td>
                        {new Date(sale.sale_date).toLocaleDateString()}
                      </td>
                      <td>
                        {sale.price_before_tax.toLocaleString()}
                      </td>
                      <td>{sale.finance_type || '-'}</td>
                      <td>{sale.employee?.name || '-'}</td>
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