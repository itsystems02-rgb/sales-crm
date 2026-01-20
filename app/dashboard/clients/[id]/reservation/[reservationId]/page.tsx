'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type ReservationLite = {
  id: string;
  reservation_date: string;
};

type Reservation = {
  id: string;
  reservation_date: string;
  bank_name: string | null;
  bank_employee_name: string | null;
  bank_employee_mobile: string | null;
  notes: string | null;
  status: string;
  client_id: string;
  unit_id: string;
  employee_id: string | null;
  follow_employee_id: string | null;
  last_follow_up_at: string | null;
  follow_up_details: string | null;
  created_at: string;
};

type Client = {
  name: string;
  mobile: string;
  identity_no: string | null;
  status: string;
  email: string | null;
};

type Unit = {
  unit_code: string;
  block_no: string | null;
  unit_type: string | null;
  supported_price: number | null;
  project_id: string;
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
   Page
===================== */

export default function ReservationViewPage() {
  const params = useParams();
  const router = useRouter();

  const clientId = params.id as string;
  const reservationId = params.reservationId as string;

  const [reservations, setReservations] = useState<ReservationLite[]>([]);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [salesEmployee, setSalesEmployee] = useState<Employee | null>(null);
  const [followEmployee, setFollowEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState<string>('');

  useEffect(() => {
    fetchAll();
  }, [reservationId]);

  /* =====================
     Fetch Data
  ===================== */

  async function fetchAll() {
    setLoading(true);

    try {
      // كل حجوزات العميل
      const { data: allReservations } = await supabase
        .from('reservations')
        .select('id, reservation_date')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      setReservations(allReservations || []);

      // الحجز الحالي
      const { data: r } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', reservationId)
        .maybeSingle();

      if (!r) {
        setLoading(false);
        return;
      }

      setReservation(r);

      // العميل
      const { data: c } = await supabase
        .from('clients')
        .select('name, mobile, identity_no, status, email')
        .eq('id', r.client_id)
        .maybeSingle();

      setClient(c || null);

      // الوحدة مع معلومات المشروع
      const { data: u } = await supabase
        .from('units')
        .select(`
          unit_code, 
          block_no, 
          unit_type, 
          supported_price,
          project_id,
          projects (name)
        `)
        .eq('id', r.unit_id)
        .maybeSingle();

      if (u) {
        setUnit({
          unit_code: u.unit_code,
          block_no: u.block_no,
          unit_type: u.unit_type,
          supported_price: u.supported_price,
          project_id: u.project_id
        });
        
        // استخراج اسم المشروع إذا كان موجوداً
        if (u.projects && Array.isArray(u.projects) && u.projects.length > 0) {
          setProjectName(u.projects[0].name || '');
        } else if (u.projects && typeof u.projects === 'object') {
          setProjectName((u.projects as any).name || '');
        }
      }

      // موظف الحجز
      if (r.employee_id) {
        const { data } = await supabase
          .from('employees')
          .select('name, role')
          .eq('id', r.employee_id)
          .maybeSingle();
        setSalesEmployee(data || null);
      }

      // موظف المتابعة
      if (r.follow_employee_id) {
        const { data } = await supabase
          .from('employees')
          .select('name, role')
          .eq('id', r.follow_employee_id)
          .maybeSingle();
        setFollowEmployee(data || null);
      }
    } catch (error) {
      console.error('Error fetching reservation:', error);
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     Delete Reservation
  ===================== */

  async function deleteReservation() {
    if (!reservation) return;

    if (!confirm('هل أنت متأكد من حذف الحجز؟ هذا الإجراء لا يمكن التراجع عنه.')) return;

    try {
      // 1️⃣ حذف الحجز
      await supabase
        .from('reservations')
        .delete()
        .eq('id', reservation.id);

      // 2️⃣ إعادة الوحدة Available
      await supabase
        .from('units')
        .update({ status: 'available' })
        .eq('id', reservation.unit_id);

      // 3️⃣ التحقق من وجود حجوزات أخرى للعميل
      const { data: otherReservations } = await supabase
        .from('reservations')
        .select('id')
        .eq('client_id', reservation.client_id)
        .limit(1);

      if (!otherReservations || otherReservations.length === 0) {
        await supabase
          .from('clients')
          .update({ status: 'new' })
          .eq('id', reservation.client_id);
      }

      alert('تم حذف الحجز بنجاح');
      router.push(`/dashboard/clients/${clientId}`);
    } catch (error) {
      console.error('Error deleting reservation:', error);
      alert('حدث خطأ أثناء حذف الحجز');
    }
  }

  /* =====================
     Status Badge Colors
  ===================== */

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'confirmed':
        return 'success';
      case 'pending':
      case 'waiting':
        return 'warning';
      case 'cancelled':
      case 'expired':
        return 'danger';
      case 'completed':
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
      <div className="page" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '50px', 
            height: '50px', 
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <div style={{ color: '#666' }}>جاري تحميل بيانات الحجز...</div>
        </div>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!reservation || !client) {
    return (
      <div className="page">
        <div style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          marginBottom: '20px'
        }}>
          <h3 style={{ color: '#856404', marginBottom: '10px' }}>الحجز غير موجود</h3>
          <p style={{ color: '#666' }}>قد يكون الحجز قد تم حذفه أو لا يوجد لديك صلاحية للوصول إليه.</p>
          <div style={{ marginTop: '15px' }}>
            <Button 
              onClick={() => router.push(`/dashboard/clients/${clientId}`)}
            >
              العودة إلى صفحة العميل
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      
      {/* ===== HEADER ===== */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '15px',
        marginBottom: '30px',
        paddingBottom: '20px',
        borderBottom: '1px solid #eee'
      }}>
        <div>
          <h1 style={{ 
            margin: '0 0 10px 0',
            color: '#2c3e50',
            fontSize: '28px'
          }}>
            تفاصيل الحجز
          </h1>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            <StatusBadge status={getStatusColor(reservation.status)}>
              {reservation.status || 'غير محدد'}
            </StatusBadge>
            <span style={{ color: '#666', fontSize: '14px' }}>
              تاريخ الإنشاء: {new Date(reservation.created_at).toLocaleDateString('ar-SA')}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {reservations.length > 1 && (
            <select
              value={reservationId}
              onChange={e =>
                router.push(
                  `/dashboard/clients/${clientId}/reservation/${e.target.value}`
                )
              }
              style={{
                padding: '10px 15px',
                borderRadius: '6px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                fontSize: '14px',
                minWidth: '200px'
              }}
            >
              {reservations.map(r => (
                <option key={r.id} value={r.id}>
                  حجز بتاريخ {new Date(r.reservation_date).toLocaleDateString('ar-SA')}
                </option>
              ))}
            </select>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button 
              variant="secondary" 
              onClick={() => window.print()}
            >
              🖨️ طباعة
            </Button>

            <Button 
              onClick={() => router.push(`/dashboard/clients/${clientId}`)}
            >
              ↩ العودة للعميل
            </Button>

            <Button 
              variant="danger" 
              onClick={deleteReservation}
            >
              🗑️ حذف الحجز
            </Button>
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT - 2 COLUMNS ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '25px',
        marginBottom: '30px'
      }}>
        
        {/* COLUMN 1 */}
        <div>
          {/* بيانات العميل */}
          <Card 
            title="👤 بيانات العميل" 
            style={{ marginBottom: '20px' }}
            headerStyle={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee' }}
          >
            <DetailGrid>
              <DetailItem 
                label="الاسم الكامل" 
                value={client.name} 
                icon="👤"
              />
              <DetailItem 
                label="رقم الجوال" 
                value={client.mobile} 
                icon="📱"
                copyable
              />
              <DetailItem 
                label="البريد الإلكتروني" 
                value={client.email || 'غير متوفر'} 
                icon="✉️"
              />
              <DetailItem 
                label="رقم الهوية/الإقامة" 
                value={client.identity_no || 'غير متوفر'} 
                icon="🆔"
              />
              <DetailItem 
                label="حالة العميل" 
                value={
                  <StatusBadge status={getStatusColor(client.status)}>
                    {client.status}
                  </StatusBadge>
                }
              />
            </DetailGrid>
          </Card>

          {/* بيانات الوحدة */}
          <Card 
            title="🏠 بيانات الوحدة" 
            style={{ marginBottom: '20px' }}
            headerStyle={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee' }}
          >
            <DetailGrid>
              <DetailItem 
                label="كود الوحدة" 
                value={unit?.unit_code || 'غير محدد'} 
                icon="#️⃣"
              />
              <DetailItem 
                label="رقم البلوك" 
                value={unit?.block_no || 'غير محدد'} 
                icon="🏗️"
              />
              <DetailItem 
                label="نوع الوحدة" 
                value={unit?.unit_type || 'غير محدد'} 
                icon="🏠"
              />
              <DetailItem 
                label="السعر المدعوم" 
                value={
                  unit?.supported_price 
                    ? `${unit.supported_price.toLocaleString()} ريال` 
                    : 'غير محدد'
                } 
                icon="💰"
              />
              <DetailItem 
                label="المشروع" 
                value={projectName || 'غير محدد'} 
                icon="🏢"
              />
            </DetailGrid>
          </Card>

          {/* بيانات البنك */}
          <Card 
            title="🏦 بيانات البنك" 
            headerStyle={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee' }}
          >
            <DetailGrid>
              <DetailItem 
                label="اسم البنك" 
                value={reservation.bank_name || 'غير محدد'} 
                icon="🏦"
              />
              <DetailItem 
                label="اسم موظف البنك" 
                value={reservation.bank_employee_name || 'غير محدد'} 
                icon="👨‍💼"
              />
              <DetailItem 
                label="رقم موظف البنك" 
                value={reservation.bank_employee_mobile || 'غير محدد'} 
                icon="📞"
                copyable
              />
            </DetailGrid>
          </Card>
        </div>

        {/* COLUMN 2 */}
        <div>
          {/* بيانات الحجز */}
          <Card 
            title="📅 بيانات الحجز" 
            style={{ marginBottom: '20px' }}
            headerStyle={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee' }}
          >
            <DetailGrid>
              <DetailItem 
                label="رقم الحجز" 
                value={reservation.id.substring(0, 8).toUpperCase()} 
                icon="#️⃣"
              />
              <DetailItem 
                label="تاريخ الحجز" 
                value={new Date(reservation.reservation_date).toLocaleDateString('ar-SA', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })} 
                icon="📅"
              />
              <DetailItem 
                label="حالة الحجز" 
                value={
                  <StatusBadge status={getStatusColor(reservation.status)}>
                    {reservation.status}
                  </StatusBadge>
                }
              />
              <DetailItem 
                label="تاريخ الإنشاء" 
                value={new Date(reservation.created_at).toLocaleString('ar-SA')} 
                icon="⏰"
              />
            </DetailGrid>
          </Card>

          {/* بيانات الموظفين */}
          <Card 
            title="👥 بيانات الموظفين" 
            style={{ marginBottom: '20px' }}
            headerStyle={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee' }}
          >
            <DetailGrid>
              <DetailItem 
                label="الموظف القائم بالحجز" 
                value={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{salesEmployee?.name || 'غير محدد'}</span>
                    {salesEmployee?.role && (
                      <StatusBadge status="info">
                        {salesEmployee.role === 'admin' ? 'مدير' : 'مندوب مبيعات'}
                      </StatusBadge>
                    )}
                  </div>
                } 
                icon="👨‍💼"
              />
              <DetailItem 
                label="موظف المتابعة" 
                value={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{followEmployee?.name || 'غير محدد'}</span>
                    {followEmployee?.role && (
                      <StatusBadge status="info">
                        {followEmployee.role === 'admin' ? 'مدير' : 'مندوب مبيعات'}
                      </StatusBadge>
                    )}
                  </div>
                } 
                icon="📋"
              />
              <DetailItem 
                label="تاريخ آخر متابعة" 
                value={
                  reservation.last_follow_up_at
                    ? new Date(reservation.last_follow_up_at).toLocaleString('ar-SA')
                    : 'لا توجد متابعة'
                } 
                icon="🔄"
              />
            </DetailGrid>
          </Card>

          {/* الملاحظات */}
          <Card 
            title="📝 الملاحظات" 
            style={{ marginBottom: '20px' }}
            headerStyle={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee' }}
          >
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #e9ecef',
              minHeight: '120px',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6',
              color: '#495057'
            }}>
              {reservation.notes || 'لا توجد ملاحظات لهذا الحجز.'}
            </div>
          </Card>

          {/* تفاصيل المتابعة */}
          <Card 
            title="📊 تفاصيل المتابعة"
            headerStyle={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee' }}
          >
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #e9ecef',
              minHeight: '120px',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6',
              color: '#495057'
            }}>
              {reservation.follow_up_details || 'لا توجد تفاصيل متابعة.'}
            </div>
          </Card>
        </div>
      </div>

      {/* ===== QUICK ACTIONS ===== */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '15px',
        marginTop: '40px',
        paddingTop: '25px',
        borderTop: '1px solid #eee'
      }}>
        <Button 
          variant="primary"
          onClick={() => router.push(`/dashboard/clients/${clientId}/reservation/${reservationId}/edit`)}
        >
          ✏️ تعديل الحجز
        </Button>
        
        <Button 
          variant="secondary"
          onClick={() => router.push(`/dashboard/clients/${clientId}`)}
        >
          👁️ عرض ملف العميل
        </Button>
        
        <Button 
          variant="success"
          onClick={() => router.push(`/dashboard/sales/create?reservationId=${reservationId}`)}
        >
          💰 تحويل إلى عملية بيع
        </Button>
      </div>

      {/* ===== FOOTER INFO ===== */}
      <div style={{
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#6c757d',
        textAlign: 'center',
        border: '1px dashed #dee2e6'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span>رقم العميل: {clientId.substring(0, 8)}</span>
          <span>رقم الحجز: {reservationId.substring(0, 8)}</span>
          <span>آخر تحديث: {new Date().toLocaleString('ar-SA')}</span>
        </div>
      </div>
    </div>
  );
}

/* =====================
   Detail Grid Component
===================== */

function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '20px',
      padding: '10px 0'
    }}>
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
    <div style={{
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '15px',
      border: '1px solid #e9ecef',
      transition: 'all 0.3s ease'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'flex-start', 
        gap: '12px'
      }}>
        {icon && (
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            backgroundColor: '#e9ecef',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: 0
          }}>
            {icon}
          </div>
        )}
        
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontSize: '12px', 
            color: '#6c757d', 
            marginBottom: '8px',
            fontWeight: '500'
          }}>
            {label}
          </div>
          
          <div style={{ 
            fontSize: '16px', 
            color: '#2c3e50',
            fontWeight: '600',
            wordBreak: 'break-word',
            minHeight: '24px'
          }}>
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
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
            >
              📋 نسخ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}