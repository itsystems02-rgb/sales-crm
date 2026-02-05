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
  created_at: string;
};

type Client = {
  name: string;
  mobile: string;
  status: string;
  email: string | null;
};

type Unit = {
  unit_code: string;
  block_no: string | null;
  unit_type: string | null;
  supported_price: number | null;
};

type Employee = {
  name: string;
  role: string;
};

/* =====================
   Custom Badge Component
===================== */

function StatusBadge({
  children,
  status = 'default'
}: {
  children: React.ReactNode;
  status?: 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'default';
}) {
  const colors = {
    success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
    warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7' },
    danger: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
    info: { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' },
    primary: { bg: '#cce5ff', color: '#004085', border: '#b8daff' },
    default: { bg: '#e2e3e5', color: '#383d41', border: '#d6d8db' }
  };

  const color = colors[status];

  return (
    <span
      style={{
        backgroundColor: color.bg,
        color: color.color,
        border: `1px solid ${color.border}`,
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600',
        display: 'inline-block'
      }}
    >
      {children}
    </span>
  );
}

/* =====================
   Detail Grid Component
===================== */

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        padding: '10px 0'
      }}
    >
      {children}
    </div>
  );
}

/* =====================
   Detail Item Component
===================== */

function DetailItem({
  label,
  value,
  icon,
  copyable = false
}: {
  label: string;
  value: React.ReactNode;
  icon?: string;
  copyable?: boolean;
}) {
  const handleCopy = () => {
    if (typeof value === 'string') {
      navigator.clipboard.writeText(value);
      alert('تم نسخ النص');
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '15px',
        border: '1px solid #e9ecef',
        transition: 'all 0.3s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {icon && (
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#e9ecef',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              flexShrink: 0
            }}
          >
            {icon}
          </div>
        )}

        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: '12px',
              color: '#6c757d',
              marginBottom: '8px',
              fontWeight: '500'
            }}
          >
            {label}
          </div>

          <div
            style={{
              fontSize: '16px',
              color: '#2c3e50',
              fontWeight: '600',
              wordBreak: 'break-word',
              minHeight: '24px'
            }}
          >
            {value}
          </div>

          {copyable && typeof value === 'string' && value !== 'غير محدد' && (
            <button
              onClick={handleCopy}
              style={{
                marginTop: '8px',
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#495057',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e9ecef')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f8f9fa')}
            >
              📋 نسخ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* =====================
   Page
===================== */

export default function SaleViewPage() {
  const params = useParams();
  const router = useRouter();

  const saleId = params.id as string;

  const [sale, setSale] = useState<Sale | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [projectName, setProjectName] = useState<string>('');
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

    try {
      // 1) بيانات التنفيذ
      const { data: s, error: saleErr } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .maybeSingle();

      if (saleErr) throw saleErr;

      if (!s) {
        setSale(null);
        setClient(null);
        setUnit(null);
        setEmployee(null);
        setProjectName('');
        setLoading(false);
        return;
      }

      setSale(s);

      // 2) بيانات العميل
      const { data: c, error: clientErr } = await supabase
        .from('clients')
        .select('name, mobile, status, email')
        .eq('id', s.client_id)
        .maybeSingle();

      if (clientErr) throw clientErr;

      setClient(c || null);

      // 3) بيانات الوحدة + المشروع
      const { data: u, error: unitErr } = await supabase
        .from('units')
        .select(
          `
          unit_code, 
          block_no, 
          unit_type,
          supported_price,
          project_id,
          projects (name)
        `
        )
        .eq('id', s.unit_id)
        .maybeSingle();

      if (unitErr) throw unitErr;

      if (u) {
        setUnit({
          unit_code: u.unit_code,
          block_no: u.block_no,
          unit_type: u.unit_type,
          supported_price: u.supported_price
        });

        // استخراج اسم المشروع
        if (u.projects && Array.isArray(u.projects) && u.projects.length > 0) {
          setProjectName((u.projects as any)[0]?.name || '');
        } else if (u.projects && typeof u.projects === 'object') {
          setProjectName((u.projects as any).name || '');
        } else {
          setProjectName('');
        }
      } else {
        setUnit(null);
        setProjectName('');
      }

      // 4) بيانات الموظف
      const { data: e, error: empErr } = await supabase
        .from('employees')
        .select('name, role')
        .eq('id', s.sales_employee_id)
        .maybeSingle();

      if (empErr) throw empErr;

      setEmployee(e || null);
    } catch (error) {
      console.error('Error fetching sale:', error);
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     Delete Sale
  ===================== */

  async function handleDeleteSale() {
    if (!sale) return;

    const ok = confirm('هل أنت متأكد من حذف التنفيذ؟ هذا الإجراء لا يمكن التراجع عنه.');
    if (!ok) return;

    try {
      // 1) حذف التنفيذ
      const { error: delErr } = await supabase.from('sales').delete().eq('id', sale.id);
      if (delErr) throw delErr;

      // 2) رجوع حالة الوحدة (لو عندك status فعلاً في جدول units)
      const { error: unitUpdateErr } = await supabase
        .from('units')
        .update({ status: 'available' })
        .eq('id', sale.unit_id);

      // لو العمود مش موجود/مش مسموح، اعمل تجاهل أو خليه يرمي error حسب رغبتك
      if (unitUpdateErr) throw unitUpdateErr;

      // 3) هل العميل له تنفيذات أخرى؟
      const { data: otherSales, error: otherErr } = await supabase
        .from('sales')
        .select('id')
        .eq('client_id', sale.client_id)
        .limit(1);

      if (otherErr) throw otherErr;

      if (!otherSales || otherSales.length === 0) {
        const { error: clientUpdateErr } = await supabase
          .from('clients')
          .update({ status: 'active' })
          .eq('id', sale.client_id);

        if (clientUpdateErr) throw clientUpdateErr;
      }

      alert('تم حذف التنفيذ بنجاح');
      router.push('/dashboard/sales');
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('حدث خطأ أثناء حذف التنفيذ');
    }
  }

  /* =====================
     Status Badge Colors
  ===================== */

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'completed':
      case 'converted':
        return 'success';
      case 'pending':
      case 'waiting':
        return 'warning';
      case 'cancelled':
      case 'expired':
        return 'danger';
      default:
        return 'default';
    }
  };

  const getFinanceTypeColor = (type: string | null) => {
    if (!type) return 'default';
    switch (type.toLowerCase()) {
      case 'cash':
      case 'نقدي':
        return 'success';
      case 'finance':
      case 'تمويل':
        return 'info';
      case 'installment':
      case 'تقسيط':
        return 'primary';
      default:
        return 'default';
    }
  };

  /* =====================
     Loading State
  ===================== */

  if (loading) {
    return (
      <div
        className="page"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '50px',
              height: '50px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #3498db',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}
          ></div>
          <div style={{ color: '#666' }}>جاري تحميل بيانات التنفيذ...</div>
        </div>
        <style jsx>{`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (!sale || !client) {
    return (
      <div className="page">
        <div
          style={{
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeaa7',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            marginBottom: '20px'
          }}
        >
          <h3 style={{ color: '#856404', marginBottom: '10px' }}>التنفيذ غير موجود</h3>
          <p style={{ color: '#666' }}>
            قد يكون التنفيذ قد تم حذفه أو لا يوجد لديك صلاحية للوصول إليه.
          </p>
          <div style={{ marginTop: '15px' }}>
            <Button onClick={() => router.push('/dashboard/sales')}>↩ العودة لقائمة التنفيذات</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* ===== HEADER ===== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '15px',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom: '1px solid #eee'
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 10px 0',
              color: '#2c3e50',
              fontSize: '28px'
            }}
          >
            تفاصيل التنفيذ
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}
          >
            <StatusBadge status="success">✅ تم البيع</StatusBadge>
            <span style={{ color: '#666', fontSize: '14px' }}>
              رقم التنفيذ: {sale.id.substring(0, 8).toUpperCase()}
            </span>
            <span style={{ color: '#666', fontSize: '14px' }}>
              تاريخ الإنشاء: {new Date(sale.created_at).toLocaleDateString('ar-SA')}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => window.print()}>
            🖨️ طباعة
          </Button>

          <Button onClick={() => router.push('/dashboard/sales')}>↩ العودة للقائمة</Button>

          <Button variant="danger" onClick={handleDeleteSale}>
            🗑️ حذف التنفيذ
          </Button>
        </div>
      </div>

      {/* ===== MAIN CONTENT - 2 COLUMNS ===== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: '25px',
          marginBottom: '30px'
        }}
      >
        {/* COLUMN 1 */}
        <div>
          {/* بيانات العميل */}
          <div style={{ marginBottom: '20px' }}>
            <Card title="👤 بيانات العميل">
              <DetailGrid>
                <DetailItem label="الاسم الكامل" value={client.name} icon="👤" />
                <DetailItem label="رقم الجوال" value={client.mobile} icon="📱" copyable />
                <DetailItem label="البريد الإلكتروني" value={client.email || 'غير متوفر'} icon="✉️" />
                <DetailItem
                  label="حالة العميل"
                  value={<StatusBadge status={getStatusColor(client.status)}>{client.status}</StatusBadge>}
                />
              </DetailGrid>
            </Card>
          </div>

          {/* بيانات الوحدة */}
          <div style={{ marginBottom: '20px' }}>
            <Card title="🏠 بيانات الوحدة">
              <DetailGrid>
                <DetailItem label="كود الوحدة" value={unit?.unit_code || 'غير محدد'} icon="#️⃣" />
                <DetailItem label="رقم البلوك" value={unit?.block_no || 'غير محدد'} icon="🏗️" />
                <DetailItem label="نوع الوحدة" value={unit?.unit_type || 'غير محدد'} icon="🏠" />
                <DetailItem
                  label="السعر المدعوم"
                  value={unit?.supported_price ? `${unit.supported_price.toLocaleString()} ريال` : 'غير محدد'}
                  icon="💰"
                />
                <DetailItem label="المشروع" value={projectName || 'غير محدد'} icon="🏢" />
              </DetailGrid>
            </Card>
          </div>

          {/* بيانات الموظف */}
          <Card title="👨‍💼 بيانات الموظف">
            <DetailGrid>
              <DetailItem label="اسم الموظف" value={employee?.name || 'غير محدد'} icon="👨‍💼" />
              <DetailItem
                label="الدور"
                value={
                  employee?.role ? (
                    <StatusBadge status="info">
                      {employee.role === 'admin' ? 'مدير' : 'مندوب مبيعات'}
                    </StatusBadge>
                  ) : (
                    'غير محدد'
                  )
                }
              />
            </DetailGrid>
          </Card>
        </div>

        {/* COLUMN 2 */}
        <div>
          {/* بيانات التنفيذ */}
          <div style={{ marginBottom: '20px' }}>
            <Card title="💰 بيانات التنفيذ">
              <DetailGrid>
                <DetailItem label="رقم التنفيذ" value={sale.id.substring(0, 8).toUpperCase()} icon="#️⃣" />
                <DetailItem
                  label="تاريخ البيع"
                  value={new Date(sale.sale_date).toLocaleDateString('ar-SA', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                  icon="📅"
                />
                <DetailItem
                  label="السعر قبل الضريبة"
                  value={`${sale.price_before_tax.toLocaleString()} ريال`}
                  icon="💵"
                />
                <DetailItem
                  label="نوع التمويل"
                  value={<StatusBadge status={getFinanceTypeColor(sale.finance_type)}>{sale.finance_type || 'غير محدد'}</StatusBadge>}
                />
                <DetailItem label="جهة التمويل" value={sale.finance_entity || 'غير محدد'} icon="🏦" />
                <DetailItem label="تاريخ الإنشاء" value={new Date(sale.created_at).toLocaleString('ar-SA')} icon="⏰" />
              </DetailGrid>
            </Card>
          </div>

          {/* بيانات العقد */}
          <div style={{ marginBottom: '20px' }}>
            <Card title="📝 بيانات العقد">
              <DetailGrid>
                <DetailItem label="رقم عقد الدعم" value={sale.contract_support_no || 'غير محدد'} icon="📄" />
                <DetailItem label="رقم عقد تالاد" value={sale.contract_talad_no || 'غير محدد'} icon="📋" />
                <DetailItem label="نوع العقد" value={sale.contract_type || 'غير محدد'} icon="⚖️" />
              </DetailGrid>
            </Card>
          </div>

          {/* ملخص مالي */}
          <Card title="🧮 ملخص مالي">
            <div
              style={{
                backgroundColor: '#f8f9fa',
                padding: '20px',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>القيمة الإجمالية</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#28a745' }}>
                    {sale.price_before_tax.toLocaleString()} ريال
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>تاريخ التنفيذ</div>
                  <div style={{ fontSize: '16px', fontWeight: '500' }}>
                    {new Date(sale.sale_date).toLocaleDateString('ar-SA')}
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#e9ecef', height: '1px', margin: '15px 0' }} />

              <div style={{ fontSize: '12px', color: '#6c757d', textAlign: 'center' }}>
                رقم العميل: {sale.client_id.substring(0, 8)} | رقم الوحدة: {unit?.unit_code || 'غير محدد'} | تم الإنشاء بواسطة:{' '}
                {employee?.name || 'غير محدد'}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ===== FOOTER INFO ===== */}
      <div
        style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#6c757d',
          textAlign: 'center',
          border: '1px dashed #dee2e6'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span>رقم التنفيذ: {sale.id.substring(0, 8)}</span>
          <span>رقم العميل: {sale.client_id.substring(0, 8)}</span>
          <span>آخر تحديث: {new Date().toLocaleString('ar-SA')}</span>
        </div>
      </div>
    </div>
  );
}
