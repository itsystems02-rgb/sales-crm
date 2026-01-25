// app/dashboard/sales/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

/* =====================
   Types
===================== */

type Sale = {
  id: string;
  sale_date: string | null;
  price_before_tax: number | null;
  price_after_tax: number | null;
  finance_type: string | null;
  payment_method: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  client_id: string;
  unit_id: string;
  sales_employee_id: string | null;
};

/* =====================
   Custom StatusBadge Component
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

export default function SalesPage() {
  const router = useRouter();

  const [sales, setSales] = useState<Sale[]>([]);
  const [filteredSales, setFilteredSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [clients, setClients] = useState<Record<string, {name: string, mobile: string}>>({});
  const [units, setUnits] = useState<Record<string, {unit_code: string, unit_type: string | null}>>({});
  const [employees, setEmployees] = useState<Record<string, {name: string, role: string}>>({});
  
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    sortBy: 'created_at',
    sortOrder: 'desc' as 'asc' | 'desc'
  });

  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    cancelled: 0,
    totalRevenue: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [sales, filters]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🔍 جلب بيانات التنفيذات...');
      
      // 1. جلب المبيعات الأساسية
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (salesError) {
        console.error('❌ خطأ في جلب المبيعات:', salesError);
        setError(`خطأ في قاعدة البيانات: ${salesError.message}`);
        return;
      }

      console.log(`✅ تم جلب ${salesData?.length || 0} عملية بيع`);

      if (!salesData || salesData.length === 0) {
        setSales([]);
        calculateStats([]);
        setLoading(false);
        return;
      }

      setSales(salesData);

      // 2. جلب البيانات المرتبطة
      await fetchRelatedData(salesData);
      
      // 3. حساب الإحصائيات
      calculateStats(salesData);
      
    } catch (err) {
      console.error('❌ حدث خطأ غير متوقع:', err);
      setError(`حدث خطأ: ${err instanceof Error ? err.message : 'غير معروف'}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRelatedData(salesData: Sale[]) {
    try {
      // جلب جميع العملاء
      const clientIds = [...new Set(salesData.map(s => s.client_id).filter(Boolean))];
      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, name, mobile')
          .in('id', clientIds);
        
        if (clientsData) {
          const clientsMap: Record<string, {name: string, mobile: string}> = {};
          clientsData.forEach(client => {
            clientsMap[client.id] = { name: client.name, mobile: client.mobile };
          });
          setClients(clientsMap);
        }
      }

      // جلب جميع الوحدات
      const unitIds = [...new Set(salesData.map(s => s.unit_id).filter(Boolean))];
      if (unitIds.length > 0) {
        const { data: unitsData } = await supabase
          .from('units')
          .select('id, unit_code, unit_type')
          .in('id', unitIds);
        
        if (unitsData) {
          const unitsMap: Record<string, {unit_code: string, unit_type: string | null}> = {};
          unitsData.forEach(unit => {
            unitsMap[unit.id] = { unit_code: unit.unit_code, unit_type: unit.unit_type };
          });
          setUnits(unitsMap);
        }
      }

      // جلب جميع الموظفين
      const employeeIds = [...new Set(salesData.map(s => s.sales_employee_id).filter(Boolean))];
      if (employeeIds.length > 0) {
        const { data: employeesData } = await supabase
          .from('employees')
          .select('id, name, role')
          .in('id', employeeIds);
        
        if (employeesData) {
          const employeesMap: Record<string, {name: string, role: string}> = {};
          employeesData.forEach(emp => {
            employeesMap[emp.id] = { name: emp.name, role: emp.role };
          });
          setEmployees(employeesMap);
        }
      }

    } catch (err) {
      console.error('❌ خطأ في جلب البيانات المرتبطة:', err);
    }
  }

  function calculateStats(data: Sale[]) {
    const totalRevenue = data.reduce((sum, sale) => 
      sum + (sale.price_after_tax || sale.price_before_tax || 0), 0
    );
    
    const stats = {
      total: data.length,
      completed: data.filter(s => s.status === 'completed' || s.status === 'Completed').length,
      pending: data.filter(s => s.status === 'pending' || s.status === 'Pending').length,
      cancelled: data.filter(s => s.status === 'cancelled' || s.status === 'Cancelled').length,
      totalRevenue: totalRevenue
    };
    setStats(stats);
  }

  function applyFilters() {
    let filtered = [...sales];

    // فلترة بالحالة
    if (filters.status !== 'all') {
      filtered = filtered.filter(s => 
        s.status?.toLowerCase() === filters.status.toLowerCase()
      );
    }

    // فلترة بالبحث
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(s => {
        const client = clients[s.client_id];
        const unit = units[s.unit_id];
        
        return (
          (client?.name?.toLowerCase().includes(searchTerm)) ||
          (client?.mobile?.includes(searchTerm)) ||
          (unit?.unit_code?.toLowerCase().includes(searchTerm)) ||
          s.id.toLowerCase().includes(searchTerm)
        );
      });
    }

    // الترتيب
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (filters.sortBy) {
        case 'sale_date':
          aValue = a.sale_date ? new Date(a.sale_date) : new Date(0);
          bValue = b.sale_date ? new Date(b.sale_date) : new Date(0);
          break;
        case 'price':
          aValue = a.price_after_tax || a.price_before_tax || 0;
          bValue = b.price_after_tax || b.price_before_tax || 0;
          break;
        default:
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
      }

      if (filters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredSales(filtered);
  }

  function handleFilterChange(key: string, value: string) {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }

  function resetFilters() {
    setFilters({
      status: 'all',
      search: '',
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
  }

  function getStatusColor(status: string) {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'danger';
      case 'active':
        return 'primary';
      default:
        return 'default';
    }
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'تاريخ غير صالح';
    }
  }

  function formatCurrency(amount: number | null) {
    if (amount === null || amount === 0) return '-';
    return amount.toLocaleString('ar-SA') + ' ريال';
  }

  function getClientName(clientId: string) {
    return clients[clientId]?.name || 'غير محدد';
  }

  function getClientMobile(clientId: string) {
    return clients[clientId]?.mobile || 'غير متوفر';
  }

  function getUnitCode(unitId: string) {
    return units[unitId]?.unit_code || 'غير محدد';
  }

  function getUnitType(unitId: string) {
    return units[unitId]?.unit_type || 'غير محدد';
  }

  function getEmployeeName(employeeId: string | null) {
    if (!employeeId) return 'غير محدد';
    return employees[employeeId]?.name || 'غير محدد';
  }

  function getEmployeeRole(employeeId: string | null) {
    if (!employeeId) return '';
    return employees[employeeId]?.role === 'admin' ? 'مدير' : 'مندوب مبيعات';
  }

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        flexDirection: 'column',
        textAlign: 'center'
      }}>
        <div style={{ 
          width: '50px', 
          height: '50px', 
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }}></div>
        <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>جاري تحميل التنفيذات...</h2>
        <p style={{ color: '#666' }}>يرجى الانتظار أثناء جلب البيانات</p>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '40px',
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        <div style={{ 
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <h2 style={{ marginTop: 0 }}>⚠️ حدث خطأ</h2>
          <p>{error}</p>
          <p style={{ fontSize: '14px', marginTop: '10px' }}>
            تحقق من اتصال قاعدة البيانات وتأكد من صحة الإعدادات.
          </p>
        </div>
        
        <button
          onClick={fetchData}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          🔄 حاول مرة أخرى
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      
      {/* ===== HEADER ===== */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <div>
          <h1 style={{ 
            margin: '0 0 10px 0',
            color: '#2c3e50',
            fontSize: '28px'
          }}>
            💰 إدارة التنفيذات
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            إجمالي التنفيذات: <strong>{sales.length}</strong> عملية بيع
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            {showFilters ? '✖ إخفاء الفلاتر' : '🔍 عرض الفلاتر'}
          </button>
          
          <button
            onClick={() => router.push('/dashboard/sales/new')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            ➕ تنفيذ جديد
          </button>

          <button
            onClick={fetchData}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            🔄 تحديث البيانات
          </button>
        </div>
      </div>

      {/* ===== STATISTICS CARDS ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <StatCard 
          title="إجمالي التنفيذات"
          value={stats.total}
          color="#3498db"
          icon="💰"
        />
        <StatCard 
          title="مكتملة"
          value={stats.completed}
          color="#2ecc71"
          icon="✅"
        />
        <StatCard 
          title="قيد الانتظار"
          value={stats.pending}
          color="#f39c12"
          icon="⏳"
        />
        <StatCard 
          title="ملغاة"
          value={stats.cancelled}
          color="#e74c3c"
          icon="❌"
        />
        <StatCard 
          title="إجمالي الإيرادات"
          value={formatCurrency(stats.totalRevenue)}
          color="#9b59b6"
          icon="💵"
          isCurrency={true}
        />
      </div>

      {/* ===== FILTERS PANEL ===== */}
      {showFilters && (
        <div style={{ 
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px',
          border: '1px solid #dee2e6',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#2c3e50' }}>🔍 فلاتر البحث</h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
            marginBottom: '20px'
          }}>
            {/* حقل البحث */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: '500',
                color: '#2c3e50'
              }}>
                بحث سريع
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="ابحث بالعميل، رقم الجوال، كود الوحدة..."
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  borderRadius: '8px',
                  border: '1px solid #ddd',
                  fontSize: '14px'
                }}
              />
            </div>

            {/* فلترة بالحالة */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: '500',
                color: '#2c3e50'
              }}>
                حالة التنفيذ
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  borderRadius: '8px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  backgroundColor: 'white'
                }}
              >
                <option value="all">جميع الحالات</option>
                <option value="completed">مكتملة</option>
                <option value="pending">قيد الانتظار</option>
                <option value="cancelled">ملغاة</option>
                <option value="active">نشطة</option>
              </select>
            </div>

            {/* الترتيب */}
            <div>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: '500',
                color: '#2c3e50'
              }}>
                ترتيب حسب
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  value={filters.sortBy}
                  onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="created_at">تاريخ الإنشاء</option>
                  <option value="sale_date">تاريخ البيع</option>
                  <option value="price">السعر</option>
                </select>
                
                <select
                  value={filters.sortOrder}
                  onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
                  style={{
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="desc">تنازلي</option>
                  <option value="asc">تصاعدي</option>
                </select>
              </div>
            </div>
          </div>

          {/* أزرار الفلاتر */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end',
            gap: '10px',
            paddingTop: '20px',
            borderTop: '1px solid #eee'
          }}>
            <button
              onClick={resetFilters}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🔄 إعادة الضبط
            </button>
            <button
              onClick={() => setShowFilters(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              تطبيق الفلاتر
            </button>
          </div>
        </div>
      )}

      {/* ===== RESULTS SUMMARY ===== */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#495057', fontWeight: '500' }}>
            نتائج البحث:
          </span>
          <span style={{ color: '#2c3e50', fontWeight: '600' }}>
            {filteredSales.length} تنفيذ
          </span>
        </div>
        
        {filters.search && (
          <div style={{ 
            backgroundColor: '#e3f2fd',
            padding: '5px 15px',
            borderRadius: '20px',
            fontSize: '14px',
            color: '#1565c0'
          }}>
            🔍 البحث: "{filters.search}"
          </div>
        )}
      </div>

      {/* ===== SALES TABLE ===== */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
        overflow: 'hidden'
      }}>
        {filteredSales.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#666'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📭</div>
            <h3 style={{ marginBottom: '10px', color: '#495057' }}>
              {sales.length === 0 ? 'لا توجد تنفيذات' : 'لا توجد تنفيذات تطابق معايير البحث'}
            </h3>
            <p style={{ marginBottom: '30px', maxWidth: '500px', margin: '0 auto' }}>
              {sales.length === 0 
                ? 'لم يتم إضافة أي تنفيذات بعد. يمكنك إضافة تنفيذات جديدة من الزر أعلاه.' 
                : 'لم يتم العثور على تنفيذات تطابق معايير البحث. حاول تغيير الفلاتر.'}
            </p>
            {sales.length === 0 ? (
              <button
                onClick={() => router.push('/dashboard/sales/new')}
                style={{
                  padding: '10px 30px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                ➕ إضافة تنفيذ جديد
              </button>
            ) : (
              <button
                onClick={resetFilters}
                style={{
                  padding: '10px 30px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                🔄 عرض جميع التنفيذات
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '1000px'
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f8f9fa',
                  borderBottom: '2px solid #dee2e6'
                }}>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>رقم التنفيذ</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>العميل</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>الوحدة</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>تاريخ البيع</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>السعر</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>نوع التمويل</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>الحالة</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>الموظف</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>الإجراءات</th>
                </tr>
              </thead>
              
              <tbody>
                {filteredSales.map((sale, index) => (
                  <tr 
                    key={sale.id}
                    style={{
                      backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa',
                      borderBottom: '1px solid #e9ecef',
                      transition: 'background-color 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f8f9fa'}
                    onClick={() => router.push(`/dashboard/sales/${sale.id}`)}
                  >
                    <td style={{ padding: '15px' }}>
                      <div style={{ 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontFamily: 'monospace',
                        fontSize: '13px'
                      }}>
                        #{sale.id.substring(0, 8)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                        {new Date(sale.created_at).toLocaleDateString('ar-SA')}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {getClientName(sale.client_id)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        📱 {getClientMobile(sale.client_id)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {getUnitCode(sale.unit_id)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {getUnitType(sale.unit_id)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>
                        {formatDate(sale.sale_date)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057', fontWeight: '600' }}>
                        {formatCurrency(sale.price_after_tax || sale.price_before_tax)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>
                        {sale.finance_type || '-'}
                      </div>
                      {sale.payment_method && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                          {sale.payment_method}
                        </div>
                      )}
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <StatusBadge status={getStatusColor(sale.status)}>
                        {sale.status}
                      </StatusBadge>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>
                        {getEmployeeName(sale.sales_employee_id)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {getEmployeeRole(sale.sales_employee_id)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/sales/${sale.id}`);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#e3f2fd',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#1565c0',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#bbdefb'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                        >
                          👁️ عرض
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/sales/edit/${sale.id}`);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#fff3e0',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#f57c00',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#ffe0b2'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff3e0'}
                        >
                          ✏️ تعديل
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== PAGINATION ===== */}
      {filteredSales.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ color: '#666', fontSize: '14px' }}>
            عرض <strong>1-{filteredSales.length}</strong> من <strong>{filteredSales.length}</strong> تنفيذ
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              disabled={true}
              style={{
                padding: '8px 16px',
                backgroundColor: '#e9ecef',
                color: '#6c757d',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                cursor: 'not-allowed'
              }}
            >
              السابق
            </button>
            
            <div
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontWeight: '500'
              }}
            >
              1
            </div>
            
            <button
              disabled={true}
              style={{
                padding: '8px 16px',
                backgroundColor: '#e9ecef',
                color: '#6c757d',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                cursor: 'not-allowed'
              }}
            >
              التالي
            </button>
          </div>
        </div>
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
          <span>آخر تحديث للتنفيذات: {new Date().toLocaleString('ar-SA')}</span>
          <span>إجمالي النتائج: {filteredSales.length} من {sales.length}</span>
          <span>الإيرادات الإجمالية: {formatCurrency(stats.totalRevenue)}</span>
        </div>
      </div>
    </div>
  );
}

/* =====================
   Stat Card Component
===================== */

function StatCard({ 
  title, 
  value, 
  color, 
  icon,
  isCurrency = false
}: { 
  title: string; 
  value: number | string; 
  color: string; 
  icon: string;
  isCurrency?: boolean;
}) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '20px',
      border: `1px solid ${color}20`,
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'transform 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '15px'
    }}
    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{
        width: '50px',
        height: '50px',
        borderRadius: '10px',
        backgroundColor: `${color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        color: color
      }}>
        {icon}
      </div>
      
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: isCurrency ? '16px' : '24px',
          fontWeight: '700',
          color: color,
          lineHeight: 1.2
        }}>
          {isCurrency ? value : typeof value === 'number' ? value.toLocaleString('ar-SA') : value}
        </div>
        <div style={{
          fontSize: '14px',
          color: '#666',
          marginTop: '5px'
        }}>
          {title}
        </div>
      </div>
    </div>
  );
}