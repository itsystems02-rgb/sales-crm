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

    setSales((data ?? []) as Sale[]);
    setLoading(false);
  }

  /* =====================
     Filter (✅ لو الفلتر فاضي اعرض الكل)
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

  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">

      {/* ===== Tabs ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button variant="primary">التنفيذات</Button>
        <Button onClick={() => router.push('/dashboard/sales/new')}>
          تنفيذ جديد
        </Button>

        {/* زر تحديث سريع */}
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
                      <td>{sale.employee?.[0]?.name || '-'}</td>
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