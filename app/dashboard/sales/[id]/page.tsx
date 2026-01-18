'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  finance_entity: string | null;

  contract_support_no: string | null;
  contract_talad_no: string | null;
  contract_type: string | null;

  client_id: string;
  unit_id: string;
  project_id: string;
  sales_employee_id: string;
};

type Client = {
  name: string;
  mobile: string;
  status: string;
};

type Unit = {
  unit_code: string;
  block_no: string | null;
};

type Employee = {
  name: string;
};

/* =====================
   Page
===================== */

export default function SaleViewPage() {
  const params = useParams();
  const router = useRouter();

  // ✅ الصح
  const saleId = params.id as string;

  const [sale, setSale] = useState<Sale | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);

  /* =====================
     Fetch Data
  ===================== */

  async function fetchAll() {
    setLoading(true);

    // 1️⃣ التنفيذ
    const { data: s } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .maybeSingle();

    if (!s) {
      setSale(null);
      setLoading(false);
      return;
    }

    setSale(s);

    // 2️⃣ العميل
    const { data: c } = await supabase
      .from('clients')
      .select('name, mobile, status')
      .eq('id', s.client_id)
      .maybeSingle();

    setClient(c || null);

    // 3️⃣ الوحدة
    const { data: u } = await supabase
      .from('units')
      .select('unit_code, block_no')
      .eq('id', s.unit_id)
      .maybeSingle();

    setUnit(u || null);

    // 4️⃣ الموظف
    const { data: e } = await supabase
      .from('employees')
      .select('name')
      .eq('id', s.sales_employee_id)
      .maybeSingle();

    setEmployee(e || null);

    setLoading(false);
  }

  /* =====================
     Delete Sale
  ===================== */

  async function deleteSale() {
    if (!sale) return;
    if (!confirm('هل أنت متأكد من حذف التنفيذ؟')) return;

    // 1️⃣ حذف التنفيذ
    await supabase
      .from('sales')
      .delete()
      .eq('id', sale.id);

    // 2️⃣ رجوع حالة الوحدة
    await supabase
      .from('units')
      .update({ status: 'available' })
      .eq('id', sale.unit_id);

    // 3️⃣ هل للعميل تنفيذات أخرى؟
    const { data: otherSales } = await supabase
      .from('sales')
      .select('id')
      .eq('client_id', sale.client_id)
      .limit(1);

    if (!otherSales || otherSales.length === 0) {
      await supabase
        .from('clients')
        .update({ status: 'active' }) // عدلها حسب نظامك
        .eq('id', sale.client_id);
    }

    alert('تم حذف التنفيذ بنجاح');
    router.push('/dashboard/sales');
  }

  /* =====================
     UI
  ===================== */

  if (loading) return <div className="page">جاري التحميل...</div>;
  if (!sale || !client) return <div className="page">التنفيذ غير موجود</div>;

  return (
    <div className="page">

      {/* ===== TOP ACTIONS ===== */}
      <div className="tabs" style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <Button onClick={() => router.push('/dashboard/sales')}>
          رجوع
        </Button>

        <Button onClick={() => window.print()}>
          طباعة
        </Button>

        <Button variant="danger" onClick={deleteSale}>
          حذف التنفيذ
        </Button>
      </div>

      {/* ================= CLIENT ================= */}
      <Card title="بيانات العميل">
        <div className="details-grid">
          <Detail label="اسم العميل" value={client.name} />
          <Detail label="رقم الجوال" value={client.mobile} />
          <Detail label="حالة العميل" value={client.status} badge />
        </div>
      </Card>

      {/* ================= SALE ================= */}
      <Card title="بيانات التنفيذ">
        <div className="details-grid">
          <Detail label="رقم الوحدة" value={unit?.unit_code || '-'} />
          <Detail label="رقم البلوك" value={unit?.block_no || '-'} />
          <Detail
            label="تاريخ البيع"
            value={new Date(sale.sale_date).toLocaleDateString()}
          />
          <Detail
            label="السعر"
            value={sale.price_before_tax.toLocaleString()}
          />
          <Detail label="نوع التمويل" value={sale.finance_type || '-'} />
          <Detail label="جهة التمويل" value={sale.finance_entity || '-'} />
        </div>
      </Card>

      {/* ================= CONTRACT ================= */}
      <Card title="بيانات العقد">
        <div className="details-grid">
          <Detail label="رقم عقد الدعم" value={sale.contract_support_no || '-'} />
          <Detail label="رقم عقد تالاد" value={sale.contract_talad_no || '-'} />
          <Detail label="نوع العقد" value={sale.contract_type || '-'} />
        </div>
      </Card>

      {/* ================= EMPLOYEE ================= */}
      <Card title="بيانات الموظف">
        <div className="details-grid">
          <Detail label="الموظف" value={employee?.name || '-'} />
        </div>
      </Card>

    </div>
  );
}

/* =====================
   Small UI Component
===================== */

function Detail({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="detail-row">
      <span className="label">{label}</span>
      <span className={badge ? 'value badge' : 'value'}>{value}</span>
    </div>
  );
}