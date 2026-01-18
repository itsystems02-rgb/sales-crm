'use client';

import { useEffect, useState } from 'react';
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
    } else {
      setSales(data || []);
    }

    setLoading(false);
  }

  /* =====================
     Filter
  ===================== */

  const filteredSales = sales.filter(s =>
    s.client?.[0]?.name?.includes(filter) ||
    s.unit?.[0]?.unit_code?.includes(filter)
  );

  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">

      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button variant="primary">التنفيذات</Button>
        <Button onClick={() => router.push('/dashboard/sales/new')}>
          تنفيذ جديد
        </Button>
      </div>

      <div className="details-layout">
        <Card title="قائمة التنفيذات">

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
                        {sale.price_before_tax
                          ? sale.price_before_tax.toLocaleString()
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