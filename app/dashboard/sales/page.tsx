'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type ClientRef = { 
  name: string;
  mobile: string;
  status: string;
};

type UnitRef = { 
  unit_code: string;
  unit_type: string | null;
  project_id: string;
  project_name?: string;
};

type EmployeeRef = { 
  name: string;
  role: string;
};

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
  
  client: ClientRef | null;
  unit: UnitRef | null;
  employee: EmployeeRef | null;
};

type FilterState = {
  status: string;
  employee: string;
  financeType: string;
  paymentMethod: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  sortBy: 'created_at' | 'sale_date' | 'client_name' | 'price';
  sortOrder: 'asc' | 'desc';
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
  
  const [employees, setEmployees] = useState<{id: string, name: string, role: string}[]>([]);
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    employee: 'all',
    financeType: 'all',
    paymentMethod: 'all',
    dateFrom: '',
    dateTo: '',
    search: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
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
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [sales, filters]);

  async function fetchFilterOptions() {
    try {
      // جلب الموظفين
      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, name, role')
        .order('name');
      
      setEmployees(employeesData || []);

      // جلب المشاريع
      const { data: projectsData } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');
      
      setProjects(projectsData || []);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  }

  async function fetchData() {
    setLoading(true);
    
    try {
      // 1. جلب المبيعات الأساسية
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (salesError) {
        console.error('Error fetching sales:', salesError);
        throw salesError;
      }

      console.log('Sales fetched:', salesData?.length || 0, 'records');

      if (!salesData || salesData.length === 0) {
        setSales([]);
        calculateStats([]);
        setLoading(false);
        return;
      }

      // 2. جلب التفاصيل لكل عملية بيع
      const salesWithDetails = await Promise.all(
        salesData.map(async (sale) => {
          const saleWithDetails: any = { ...sale };
          
          // جلب بيانات العميل
          if (sale.client_id) {
            const { data: clientData } = await supabase
              .from('clients')
              .select('name, mobile, status')
              .eq('id', sale.client_id)
              .single();
            
            saleWithDetails.client = clientData || null;
          }
          
          // جلب بيانات الوحدة
          if (sale.unit_id) {
            const { data: unitData } = await supabase
              .from('units')
              .select('unit_code, unit_type, project_id')
              .eq('id', sale.unit_id)
              .single();
            
            if (unitData) {
              saleWithDetails.unit = {
                unit_code: unitData.unit_code,
                unit_type: unitData.unit_type,
                project_id: unitData.project_id
              };
              
              // جلب اسم المشروع
              if (unitData.project_id) {
                const { data: projectData } = await supabase
                  .from('projects')
                  .select('name')
                  .eq('id', unitData.project_id)
                  .single();
                
                if (projectData) {
                  saleWithDetails.unit.project_name = projectData.name;
                }
              }
            }
          }
          
          // جلب بيانات الموظف
          if (sale.sales_employee_id) {
            const { data: employeeData } = await supabase
              .from('employees')
              .select('name, role')
              .eq('id', sale.sales_employee_id)
              .single();
            
            saleWithDetails.employee = employeeData || null;
          }
          
          return saleWithDetails;
        })
      );

      setSales(salesWithDetails as Sale[]);
      calculateStats(salesWithDetails as Sale[]);
      
    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setLoading(false);
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

    // فلترة بالموظف
    if (filters.employee !== 'all') {
      filtered = filtered.filter(s => s.sales_employee_id === filters.employee);
    }

    // فلترة بنوع التمويل
    if (filters.financeType !== 'all') {
      filtered = filtered.filter(s => 
        s.finance_type?.toLowerCase() === filters.financeType.toLowerCase()
      );
    }

    // فلترة بطريقة الدفع
    if (filters.paymentMethod !== 'all') {
      filtered = filtered.filter(s => 
        s.payment_method?.toLowerCase() === filters.paymentMethod.toLowerCase()
      );
    }

    // فلترة بتاريخ
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(s => 
        s.sale_date && new Date(s.sale_date) >= fromDate
      );
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(s => 
        s.sale_date && new Date(s.sale_date) <= toDate
      );
    }

    // فلترة بالبحث
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(s => 
        s.client?.name?.toLowerCase().includes(searchTerm) ||
        s.client?.mobile?.includes(searchTerm) ||
        s.unit?.unit_code?.toLowerCase().includes(searchTerm) ||
        s.id.toLowerCase().includes(searchTerm)
      );
    }

    // الترتيب
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (filters.sortBy) {
        case 'client_name':
          aValue = a.client?.name || '';
          bValue = b.client?.name || '';
          break;
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

  function handleFilterChange(key: keyof FilterState, value: string) {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }

  function resetFilters() {
    setFilters({
      status: 'all',
      employee: 'all',
      financeType: 'all',
      paymentMethod: 'all',
      dateFrom: '',
      dateTo: '',
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
    if (amount === null) return '-';
    return amount.toLocaleString('ar-SA') + ' ريال';
  }

  function getProjectName(unit: UnitRef | null) {
    if (!unit) return 'غير محدد';
    if (unit.project_name) return unit.project_name;
    if (unit.project_id) {
      const project = projects.find(p => p.id === unit.project_id);
      return project ? project.name : 'غير محدد';
    }
    return 'غير محدد';
  }

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
          <div style={{ color: '#666' }}>جاري تحميل التنفيذات...</div>
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

  return (
    <div className="page">
      
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
          <Button 
            variant="secondary"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? '✖ إخفاء الفلاتر' : '🔍 عرض الفلاتر'}
          </Button>
          
          <Button 
            onClick={() => router.push('/dashboard/sales/new')}
          >
            ➕ تنفيذ جديد
          </Button>

          <Button 
            variant="secondary"
            onClick={() => window.print()}
          >
            🖨️ طباعة التقرير
          </Button>

          <Button 
            variant="secondary"
            onClick={fetchData}
          >
            🔄 تحديث البيانات
          </Button>
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
        <div style={{ marginBottom: '30px' }}>
          <Card 
            title="🔍 فلاتر البحث"
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              padding: '20px'
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
                    fontSize: '14px',
                    transition: 'all 0.3s ease'
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

              {/* فلترة بالموظف */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  الموظف
                </label>
                <select
                  value={filters.employee}
                  onChange={(e) => handleFilterChange('employee', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="all">جميع الموظفين</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role === 'admin' ? 'مدير' : 'مندوب'})
                    </option>
                  ))}
                </select>
              </div>

              {/* فلترة بنوع التمويل */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  نوع التمويل
                </label>
                <select
                  value={filters.financeType}
                  onChange={(e) => handleFilterChange('financeType', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="all">جميع الأنواع</option>
                  <option value="cash">كاش</option>
                  <option value="installment">تقسيط</option>
                  <option value="mortgage">رهن عقاري</option>
                </select>
              </div>

              {/* فلترة بطريقة الدفع */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  طريقة الدفع
                </label>
                <select
                  value={filters.paymentMethod}
                  onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="all">جميع الطرق</option>
                  <option value="cash">نقدي</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                  <option value="check">شيك</option>
                  <option value="card">بطاقة ائتمان</option>
                </select>
              </div>

              {/* فلترة بتاريخ */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  من تاريخ
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  إلى تاريخ
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px'
                  }}
                />
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
                    <option value="client_name">اسم العميل</option>
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
              padding: '20px',
              borderTop: '1px solid #eee'
            }}>
              <Button 
                variant="secondary"
                onClick={resetFilters}
              >
                🔄 إعادة الضبط
              </Button>
              <Button 
                onClick={() => setShowFilters(false)}
              >
                تطبيق الفلاتر
              </Button>
            </div>
          </Card>
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
      <Card>
        {filteredSales.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#666'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📭</div>
            <h3 style={{ marginBottom: '10px', color: '#495057' }}>
              {sales.length === 0 ? 'لا توجد تنفيذات' : 'لا توجد تنفيذات تطابق معايير البحث'}
            </h3>
            <p style={{ marginBottom: '20px' }}>
              {sales.length === 0 
                ? 'لم يتم إضافة أي تنفيذات بعد. يمكنك إضافة تنفيذات جديدة من الزر أعلاه.' 
                : 'لم يتم العثور على تنفيذات تطابق معايير البحث. حاول تغيير الفلاتر.'}
            </p>
            {sales.length === 0 ? (
              <Button 
                onClick={() => router.push('/dashboard/sales/new')}
              >
                ➕ إضافة تنفيذ جديد
              </Button>
            ) : (
              <Button 
                variant="secondary"
                onClick={resetFilters}
              >
                🔄 عرض جميع التنفيذات
              </Button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '1200px'
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
                  }}>السعر قبل الضريبة</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>السعر بعد الضريبة</th>
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
                        {sale.client?.name || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        📱 {sale.client?.mobile || 'غير متوفر'}
                      </div>
                      {sale.client?.status && (
                        <div style={{ fontSize: '11px', marginTop: '5px' }}>
                          <StatusBadge status={getStatusColor(sale.client.status)}>
                            {sale.client.status}
                          </StatusBadge>
                        </div>
                      )}
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {sale.unit?.unit_code || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {sale.unit?.unit_type || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#999', marginTop: '5px' }}>
                        {getProjectName(sale.unit)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>
                        {formatDate(sale.sale_date)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057', fontWeight: '600' }}>
                        {formatCurrency(sale.price_before_tax)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057', fontWeight: '600' }}>
                        {formatCurrency(sale.price_after_tax)}
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
                        {sale.employee?.name || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {sale.employee?.role === 'admin' ? 'مدير' : 'مندوب مبيعات'}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/sales/${sale.id}`);
                          }}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#e3f2fd',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#1565c0',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            transition: 'all 0.2s ease',
                            width: '100%'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#bbdefb'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                        >
                          👁️ عرض التفاصيل
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/sales/edit/${sale.id}`);
                          }}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#fff3e0',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#f57c00',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            transition: 'all 0.2s ease',
                            width: '100%'
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
      </Card>

      {/* ===== PAGINATION ===== */}
      {filteredSales.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '30px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}>
          <div style={{ color: '#666', fontSize: '14px' }}>
            عرض <strong>1-{filteredSales.length}</strong> من <strong>{filteredSales.length}</strong> تنفيذ
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button 
              variant="secondary"
              disabled={true}
            >
              السابق
            </Button>
            
            {/* استخدام زر مخصص بدلاً من Button للمركز الحالي */}
            <div
              style={{
                padding: '8px 16px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'default',
                fontWeight: '500'
              }}
            >
              1
            </div>
            
            <Button 
              variant="secondary"
              disabled={true}
            >
              التالي
            </Button>
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
      padding: '25px',
      border: `1px solid ${color}20`,
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
      transition: 'transform 0.3s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '20px'
    }}
    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
    onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{
        width: '60px',
        height: '60px',
        borderRadius: '12px',
        backgroundColor: `${color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '28px',
        color: color
      }}>
        {icon}
      </div>
      
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: isCurrency ? '18px' : '32px',
          fontWeight: '700',
          color: color,
          lineHeight: 1,
          wordBreak: 'break-word'
        }}>
          {isCurrency ? value : value.toLocaleString('ar-SA')}
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