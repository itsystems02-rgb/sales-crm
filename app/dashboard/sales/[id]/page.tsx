'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Client = {
  id: string;
  name: string;
  phone: string | null;
};

type Unit = {
  id: string;
  unit_code: string;
  unit_type: string;
  supported_price: number;
};

type Employee = {
  id: string;
  name: string;
};

type Sale = {
  id: string;
  sale_date: string;
  price_before_tax: number;
  finance_type: string | null;
  finance_entity: string | null;
  contract_support_no: string | null;
  contract_talad_no: string | null;
  contract_type: string | null;

  client: Client | null;
  unit: Unit | null;
  employee: Employee | null;
};

/* =====================
   Helpers
===================== */

function normalizeRel<T>(val: any): T | null {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] ?? null;
  return val;
}

/* =====================
   Page
===================== */

export default function SaleViewPage() {
  const { id } = useParams();
  const router = useRouter();

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadSale() {
    setLoading(true);

    const { data, error } = await supabase
      .from('sales')
      .select(`
        id,
        sale_date,
        price_before_tax,
        finance_type,
        finance_entity,
        contract_support_no,
        contract_talad_no,
        contract_type,

        client:clients!sales_client_id_fkey (
          id,
          name,
          phone
        ),
        unit:units!sales_unit_id_fkey (
          id,
          unit_code,
          unit_type,
          supported_price
        ),
        employee:employees!sales_sales_employee_id_fkey (
          id,
          name
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(error);
      setSale(null);
      setLoading(false);
      return;
    }

    if (!data) {
      setSale(null);
      setLoading(false);
      return;
    }

    const normalized: Sale = {
      id: data.id,
      sale_date: data.sale_date,
      price_before_tax: Number(data.price_before_tax),
      finance_type: data.finance_type,
      finance_entity: data.finance_entity,
      contract_support_no: data.contract_support_no,
      contract_talad_no: data.contract_talad_no,
      contract_type: data.contract_type,

      client: normalizeRel<Client>(data.client),
      unit: normalizeRel<Unit>(data.unit),
      employee: normalizeRel<Employee>(data.employee),
    };

    setSale(normalized);
    setLoading(false);
  }

  if (loading) return <div className="page">جاري التحميل...</div>;
  if (!sale) return <div className="page">التنفيذ غير موجود</div>;

  return (
    <div className="page">
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button onClick={() => router.push('/dashboard/sales')}>رجوع</Button>

        {/* PDF لاحقًا */}
        <Button onClick={() => window.print()}>
          طباعة
        </Button>
      </div>

      <div className="details-layout">

        <Card title="بيانات التنفيذ">
          <p>تاريخ البيع: {new Date(sale.sale_date).toLocaleDateString()}</p>
          <p>السعر: {sale.price_before_tax.toLocaleString()}</p>
          <p>نوع التمويل: {sale.finance_type || '-'}</p>
          <p>جهة التمويل: {sale.finance_entity || '-'}</p>
          <p>نوع العقد: {sale.contract_type || '-'}</p>
          <p>رقم دعم العقد: {sale.contract_support_no || '-'}</p>
          <p>رقم الطالاد: {sale.contract_talad_no || '-'}</p>
        </Card>

        <Card title="بيانات العميل">
          <p>الاسم: {sale.client?.name || '-'}</p>
          <p>الهاتف: {sale.client?.phone || '-'}</p>
        </Card>

        <Card title="بيانات الوحدة">
          <p>كود الوحدة: {sale.unit?.unit_code || '-'}</p>
          <p>النوع: {sale.unit?.unit_type || '-'}</p>
          <p>
            السعر المعتمد:{' '}
            {sale.unit?.supported_price
              ? sale.unit.supported_price.toLocaleString()
              : '-'}
          </p>
        </Card>

        <Card title="الموظف">
          <p>{sale.employee?.name || '-'}</p>
        </Card>

      </div>
    </div>
  );
}