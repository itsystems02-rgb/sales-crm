'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FollowUps from './followups';

/* =====================
   Types
===================== */

type Client = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  identity_type: string | null;
  identity_no: string | null;
  eligible: boolean;
  nationality: 'saudi' | 'non_saudi';
  residency_type: string | null;
  salary_bank_id: string | null;
  finance_bank_id: string | null;
  job_sector_id: string | null;
  status: string;
  created_at: string;
  saved_by: string | null;
};

/* =====================
   Custom Badge Component
===================== */

function StatusBadge({ 
  children, 
  status = 'default',
  small = false
}: { 
  children: React.ReactNode;
  status?: 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'default';
  small?: boolean;
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
  const fontSize = small ? '11px' : '12px';
  const padding = small ? '3px 8px' : '4px 10px';

  return (
    <span
      style={{
        backgroundColor: color.bg,
        color: color.color,
        border: `1px solid ${color.border}`,
        padding,
        borderRadius: '20px',
        fontSize,
        fontWeight: '600',
        display: 'inline-block'
      }}
    >
      {children}
    </span>
  );
}

/* =====================
   Constants
===================== */

const RESIDENCY_LABELS: Record<string, string> = {
  residence: 'إقامة',
  golden: 'إقامة ذهبية',
  premium: 'إقامة مميزة',
};

/* =====================
   Page
===================== */

export default function ClientPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<'details' | 'followups'>('details');
  const [loading, setLoading] = useState(true);
  const [salaryBankName, setSalaryBankName] = useState<string | null>(null);
  const [financeBankName, setFinanceBankName] = useState<string | null>(null);
  const [jobSectorName, setJobSectorName] = useState<string | null>(null);
  const [savedByName, setSavedByName] = useState<string>('-');
  const [reservationId, setReservationId] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, [clientId]);

  async function fetchAll() {
    setLoading(true);

    try {
      // ====== العميل ======
      const { data: c } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      if (!c) {
        setClient(null);
        setLoading(false);
        return;
      }

      setClient(c);

      // ====== بنك الراتب ======
      if (c.salary_bank_id) {
        const { data } = await supabase
          .from('banks')
          .select('name')
          .eq('id', c.salary_bank_id)
          .maybeSingle();
        setSalaryBankName(data?.name ?? null);
      }

      // ====== بنك التمويل ======
      if (c.finance_bank_id) {
        const { data } = await supabase
          .from('banks')
          .select('name')
          .eq('id', c.finance_bank_id)
          .maybeSingle();
        setFinanceBankName(data?.name ?? null);
      }

      // ====== القطاع الوظيفي ======
      if (c.job_sector_id) {
        const { data } = await supabase
          .from('job_sectors')
          .select('name')
          .eq('id', c.job_sector_id)
          .maybeSingle();
        setJobSectorName(data?.name ?? null);
      }

      // ====== مسجل بواسطة ======
      if (c.saved_by) {
        const { data } = await supabase
          .from('employees')
          .select('name')
          .eq('id', c.saved_by)
          .maybeSingle();
        setSavedByName(data?.name ?? '-');
      } else {
        setSavedByName('-');
      }

      // ====== آخر حجز ======
      const { data: reservation } = await supabase
        .from('reservations')
        .select('id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setReservationId(reservation?.id ?? null);
    } catch (error) {
      console.error('Error fetching client data:', error);
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     Status Colors
  ===================== */

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'lead':
      case 'متابعة':
        return 'warning';
      case 'reserved':
      case 'محجوز':
        return 'info';
      case 'visited':
      case 'تمت الزيارة':
        return 'success';
      case 'converted':
      case 'تم البيع':
        return 'primary';
      default:
        return 'default';
    }
  };

  const getEligibilityColor = (eligible: boolean) => {
    return eligible ? 'success' : 'danger';
  };

  const getNationalityColor = (nationality: string) => {
    return nationality === 'saudi' ? 'primary' : 'info';
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
          <div style={{ color: '#666' }}>جاري تحميل بيانات العميل...</div>
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

  if (!client) {
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
          <h3 style={{ color: '#856404', marginBottom: '10px' }}>العميل غير موجود</h3>
          <p style={{ color: '#666' }}>قد يكون العميل قد تم حذفه أو لا يوجد لديك صلاحية للوصول إليه.</p>
          <div style={{ marginTop: '15px' }}>
            <Button 
              onClick={() => router.push('/dashboard/clients')}
            >
              ↩ العودة لقائمة العملاء
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* =====================
     Helper Functions
  ===================== */

  function translateStatus(status: string) {
    switch (status) {
      case 'lead': return 'متابعة';
      case 'reserved': return 'محجوز';
      case 'visited': return 'تمت الزيارة';
      case 'converted': return 'تم البيع';
      default: return status;
    }
  }

  const residencyArabic = client.residency_type
    ? RESIDENCY_LABELS[client.residency_type] ?? client.residency_type
    : '-';

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
            ملف العميل
          </h1>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            <StatusBadge status={getStatusColor(client.status)}>
              {translateStatus(client.status)}
            </StatusBadge>
            <span style={{ color: '#666', fontSize: '14px' }}>
              رقم العميل: {client.id.substring(0, 8).toUpperCase()}
            </span>
            <span style={{ color: '#666', fontSize: '14px' }}>
              تاريخ التسجيل: {new Date(client.created_at).toLocaleDateString('ar-SA')}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button 
            variant={tab === 'details' ? 'primary' : 'secondary'}
            onClick={() => setTab('details')}
          >
            📋 البيانات الأساسية
          </Button>
          <Button 
            variant={tab === 'followups' ? 'primary' : 'secondary'}
            onClick={() => setTab('followups')}
          >
            📞 المتابعات
          </Button>
          <Button 
            onClick={() => router.push(`/dashboard/clients/${clientId}/reservation`)}
          >
            📅 حجز جديد
          </Button>
          {reservationId && (
            <Button 
              onClick={() => router.push(`/dashboard/clients/${clientId}/reservation/${reservationId}`)}
            >
              🏠 عرض الحجز
            </Button>
          )}
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      {tab === 'details' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
          gap: '25px',
          marginBottom: '30px'
        }}>
          
          {/* البيانات الأساسية */}
          <div>
            <div style={{ marginBottom: '20px' }}>
              <Card title="👤 المعلومات الشخصية">
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
                    label="حالة العميل" 
                    value={
                      <StatusBadge status={getStatusColor(client.status)}>
                        {translateStatus(client.status)}
                      </StatusBadge>
                    }
                  />
                  <DetailItem 
                    label="مسجل بواسطة" 
                    value={savedByName} 
                    icon="👨‍💼"
                  />
                  <DetailItem 
                    label="تاريخ التسجيل" 
                    value={new Date(client.created_at).toLocaleString('ar-SA')} 
                    icon="📅"
                  />
                </DetailGrid>
              </Card>
            </div>

            {/* الهوية والجنسية */}
            <div style={{ marginBottom: '20px' }}>
              <Card title="🆔 الهوية والجنسية">
                <DetailGrid>
                  <DetailItem 
                    label="الحالة الاستحقاقية" 
                    value={
                      <StatusBadge status={getEligibilityColor(client.eligible)}>
                        {client.eligible ? 'مستحق' : 'غير مستحق'}
                      </StatusBadge>
                    }
                  />
                  <DetailItem 
                    label="الجنسية" 
                    value={
                      <StatusBadge status={getNationalityColor(client.nationality)}>
                        {client.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'}
                      </StatusBadge>
                    }
                  />
                  <DetailItem 
                    label="نوع الهوية" 
                    value={client.identity_type || 'غير محدد'} 
                    icon="🆔"
                  />
                  <DetailItem 
                    label="رقم الهوية/الإقامة" 
                    value={client.identity_no || 'غير متوفر'} 
                    icon="#️⃣"
                    copyable
                  />
                  <DetailItem 
                    label="نوع الإقامة" 
                    value={residencyArabic} 
                    icon="🏢"
                  />
                </DetailGrid>
              </Card>
            </div>
          </div>

          {/* العمل والبنوك */}
          <div>
            <Card title="🏦 العمل والخدمات البنكية">
              <DetailGrid>
                <DetailItem 
                  label="القطاع الوظيفي" 
                  value={jobSectorName || 'غير محدد'} 
                  icon="💼"
                />
                <DetailItem 
                  label="بنك الراتب" 
                  value={salaryBankName || 'غير محدد'} 
                  icon="💰"
                />
                <DetailItem 
                  label="بنك التمويل" 
                  value={financeBankName || 'غير محدد'} 
                  icon="🏦"
                />
              </DetailGrid>
              
              {/* Summary Info */}
              <div style={{
                marginTop: '25px',
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: 'bold',
                  color: '#495057',
                  marginBottom: '10px'
                }}>
                  ملخص الملف
                </div>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '15px',
                  fontSize: '13px',
                  color: '#6c757d'
                }}>
                  <div>
                    <div style={{ fontWeight: '500' }}>رقم العميل:</div>
                    <div>{client.id.substring(0, 8).toUpperCase()}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: '500' }}>حالة الاستحقاق:</div>
                    <div>
                      <StatusBadge status={getEligibilityColor(client.eligible)} small>
                        {client.eligible ? 'مستحق' : 'غير مستحق'}
                      </StatusBadge>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: '500' }}>الجنسية:</div>
                    <div>
                      <StatusBadge status={getNationalityColor(client.nationality)} small>
                        {client.nationality === 'saudi' ? 'سعودي' : 'غير سعودي'}
                      </StatusBadge>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: '500' }}>آخر تحديث:</div>
                    <div>{new Date().toLocaleString('ar-SA')}</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <FollowUps clientId={client.id} />
      )}

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
          <span>رقم العميل: {client.id.substring(0, 8)}</span>
          <span>تاريخ التسجيل: {new Date(client.created_at).toLocaleDateString('ar-SA')}</span>
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
          
          {copyable && typeof value === 'string' && value !== 'غير محدد' && value !== 'غير متوفر' && (
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