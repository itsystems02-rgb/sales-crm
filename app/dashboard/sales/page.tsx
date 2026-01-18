'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type ClientRef = { name: string };
type UnitRef = { unit_code: string };
type EmployeeRef = { name: string };

type Sale = {
  id: string;
  sale_date: string | null;
  price_before_tax: number | null;
  finance_type: string | null;

  client: ClientRef | null;
  unit: UnitRef | null;
  employee: EmployeeRef | null;
};

/* =====================
   Helpers (نفس الوحدات)
===================== */

function normalizeRel<T>(val: unknown): T | null {
  if (!val) return null;
  if (Array.isArray(val)) return (val[0] ?? null) as T | null;
  if (typeof val === 'object') return val as T;
  return null;
}

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

        client:clients!sales_client_id_fkey (
          name
        ),
        unit:units!sales_unit_id_fkey (
          unit_code
        ),
        employee:employees!sales_sales_employee_id_fkey (
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('FETCH SALES ERROR:', error);
      setSales([]);
      setLoading(false);
      return;
    }

    const normalized: Sale[] = (data || []).map((r: any) => ({
      id: r.id,
      sale_date: r.sale_date,
      price_before_tax:
        r.price_before_tax === null ? null : Number(r.price_before_tax),
      finance_type: r.finance_type,

      client: normalizeRel<ClientRef>(r.client),
      unit: normalizeRel<UnitRef>(r.unit),
      employee: normalizeRel<EmployeeRef>(r.employee),
    }));

    setSales(normalized);
    setLoading(false);
  }

  /* =====================
     Filter
  ===================== */

  const filteredSales = useMemo(() => {
    const q = filter.trim();
    if (!q) return sales;

    return sales.filter(s =>
      (s.client?.name ?? '').includes(q) ||
      (s.unit?.unit_code ?? '').includes(q)
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

          {/* Filter */}
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
                    <th>إجراء</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredSales.map(sale => (
                    <tr key={sale.id}>
                      <td>{sale.client?.name || '-'}</td>
                      <td>{sale.unit?.unit_code || '-'}</td>
                      <td>
                        {sale.sale_date
                          ? new Date(sale.sale_date).toLocaleDateString()
                          : '-'}
                      </td>
                      <td>
                        {sale.price_before_tax !== null
                          ? sale.price_before_tax.toLocaleString()
                          : '-'}
                      </td>
                      <td>{sale.finance_type || '-'}</td>
                      <td>{sale.employee?.name || '-'}</td>

                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button
                            onClick={() =>
                              router.push(`/dashboard/sales/${sale.id}`)
                            }
                          >
                            عرض
                          </Button>

                          <Button
                            variant="danger"
                            onClick={() =>
                              router.push(`/dashboard/sales/${sale.id}/delete`)
                            }
                          >
                            حذف
                          </Button>
                        </div>
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