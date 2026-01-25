// app/dashboard/reservation/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Reservation = {
  id: string;
  reservation_date: string;
  status: string;
  bank_name: string | null;
  client_id: string;
  unit_id: string;
  employee_id: string | null;
  created_at: string;
  clients: {
    name: string;
    mobile: string;
    status: string;
  } | null;
  units: {
    unit_code: string;
    unit_type: string | null;
    project_id: string;
    projects?: {
      name: string;
      id?: string;
    } | null;
  } | null;
  employees: {
    name: string;
    role: string;
  } | null;
};

type FilterState = {
  status: string;
  employee: string;
  project: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  unitType: string;
  sortBy: 'created_at' | 'reservation_date' | 'client_name';
  sortOrder: 'asc' | 'desc';
};

/* =====================
   Custom StatusBadge Component (Temporary)
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

export default function ReservationsPage() {
  const router = useRouter();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const [employees, setEmployees] = useState<{id: string, name: string, role: string}[]>([]);
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    employee: 'all',
    project: 'all',
    dateFrom: '',
    dateTo: '',
    search: '',
    unitType: 'all',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });

  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    pending: 0,
    cancelled: 0,
    completed: 0
  });

  useEffect(() => {
    fetchCurrentUser();
    fetchData();
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [reservations, filters]);

  async function fetchCurrentUser() {
    try {
      const user = await getCurrentEmployee();
      setCurrentUser(user);
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  }

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
      // أولاً: جلب الحجوزات مع البيانات الأساسية
      const { data: reservationsData, error: reservationsError } = await supabase
        .from('reservations')
        .select(`
          *,
          clients (name, mobile, status),
          units (unit_code, unit_type, project_id),
          employees (name, role)
        `)
        .order('created_at', { ascending: false });

      if (reservationsError) throw reservationsError;

      // ثانياً: جلب معلومات المشاريع لكل وحدة
      const reservationsWithProjects = await Promise.all(
        (reservationsData || []).map(async (reservation) => {
          if (reservation.units?.project_id) {
            const { data: projectData } = await supabase
              .from('projects')
              .select('name')
              .eq('id', reservation.units.project_id)
              .single();

            if (projectData) {
              reservation.units.projects = projectData;
            }
          }
          return reservation;
        })
      );

      setReservations(reservationsWithProjects as Reservation[]);

      // حساب الإحصائيات
      calculateStats(reservationsWithProjects as Reservation[]);
    } catch (error) {
      console.error('Error fetching reservations:', error);
    } finally {
      setLoading(false);
    }
  }

  function calculateStats(data: Reservation[]) {
    const stats = {
      total: data.length,
      active: data.filter(r => r.status === 'active').length,
      pending: data.filter(r => r.status === 'pending').length,
      cancelled: data.filter(r => r.status === 'cancelled').length,
      completed: data.filter(r => r.status === 'completed').length
    };
    setStats(stats);
  }

  function applyFilters() {
    let filtered = [...reservations];

    // فلترة بالحالة
    if (filters.status !== 'all') {
      filtered = filtered.filter(r => r.status === filters.status);
    }

    // فلترة بالموظف
    if (filters.employee !== 'all') {
      filtered = filtered.filter(r => r.employee_id === filters.employee);
    }

    // فلترة بالمشروع - تصحيح هنا
    if (filters.project !== 'all') {
      filtered = filtered.filter(r => 
        r.units?.project_id === filters.project
      );
    }

    // فلترة بتاريخ
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(r => 
        new Date(r.reservation_date) >= fromDate
      );
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => 
        new Date(r.reservation_date) <= toDate
      );
    }

    // فلترة بنوع الوحدة
    if (filters.unitType !== 'all') {
      filtered = filtered.filter(r => 
        r.units?.unit_type === filters.unitType
      );
    }

    // فلترة بالبحث
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(r => 
        r.clients?.name?.toLowerCase().includes(searchTerm) ||
        r.clients?.mobile?.includes(searchTerm) ||
        r.units?.unit_code?.toLowerCase().includes(searchTerm) ||
        r.id.toLowerCase().includes(searchTerm)
      );
    }

    // الترتيب
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (filters.sortBy) {
        case 'client_name':
          aValue = a.clients?.name || '';
          bValue = b.clients?.name || '';
          break;
        case 'reservation_date':
          aValue = new Date(a.reservation_date);
          bValue = new Date(b.reservation_date);
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

    setFilteredReservations(filtered);
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
      project: 'all',
      dateFrom: '',
      dateTo: '',
      search: '',
      unitType: 'all',
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
  }

  function getStatusColor(status: string) {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'danger';
      case 'completed':
        return 'primary';
      default:
        return 'default';
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function getProjectName(projectId: string) {
    const project = projects.find(p => p.id === projectId);
    return project ? project.name : 'غير محدد';
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
          <div style={{ color: '#666' }}>جاري تحميل الحجوزات...</div>
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
            📋 إدارة الحجوزات
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            إجمالي الحجوزات: <strong>{reservations.length}</strong> حجز
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
            onClick={() => router.push('/dashboard/reservations/new')}
          >
            ➕ حجز جديد
          </Button>

          <Button 
            variant="secondary"
            onClick={() => window.print()}
          >
            🖨️ طباعة التقرير
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
          title="إجمالي الحجوزات"
          value={stats.total}
          color="#3498db"
          icon="📋"
        />
        <StatCard 
          title="نشطة"
          value={stats.active}
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
          title="مكتملة"
          value={stats.completed}
          color="#9b59b6"
          icon="🎉"
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
                  حالة الحجز
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
                  <option value="active">نشطة</option>
                  <option value="pending">قيد الانتظار</option>
                  <option value="cancelled">ملغاة</option>
                  <option value="completed">مكتملة</option>
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

              {/* فلترة بالمشروع */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  المشروع
                </label>
                <select
                  value={filters.project}
                  onChange={(e) => handleFilterChange('project', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="all">جميع المشاريع</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
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

              {/* فلترة بنوع الوحدة */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#2c3e50'
                }}>
                  نوع الوحدة
                </label>
                <select
                  value={filters.unitType}
                  onChange={(e) => handleFilterChange('unitType', e.target.value)}
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
                  <option value="شقة">شقة</option>
                  <option value="فيلا">فيلا</option>
                  <option value="متجر">متجر</option>
                  <option value="أرض">أرض</option>
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
                    <option value="reservation_date">تاريخ الحجز</option>
                    <option value="client_name">اسم العميل</option>
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
            {filteredReservations.length} حجز
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

      {/* ===== RESERVATIONS TABLE ===== */}
      <Card>
        {filteredReservations.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#666'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📭</div>
            <h3 style={{ marginBottom: '10px', color: '#495057' }}>
              لا توجد حجوزات
            </h3>
            <p style={{ marginBottom: '20px' }}>
              {filters.status !== 'all' || filters.search 
                ? 'لم يتم العثور على حجوزات تطابق معايير البحث' 
                : 'لم يتم إضافة أي حجوزات بعد'}
            </p>
            {(filters.status !== 'all' || filters.search) && (
              <Button 
                variant="secondary"
                onClick={resetFilters}
              >
                عرض جميع الحجوزات
              </Button>
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
                  }}>رقم الحجز</th>
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
                  }}>المشروع</th>
                  <th style={{ 
                    padding: '15px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#495057',
                    fontSize: '14px'
                  }}>تاريخ الحجز</th>
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
                {filteredReservations.map((reservation, index) => (
                  <tr 
                    key={reservation.id}
                    style={{
                      backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa',
                      borderBottom: '1px solid #e9ecef',
                      transition: 'background-color 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f8f9fa'}
                    onClick={() => router.push(`/dashboard/clients/${reservation.client_id}/reservation/${reservation.id}`)}
                  >
                    <td style={{ padding: '15px' }}>
                      <div style={{ 
                        fontWeight: '600',
                        color: '#2c3e50',
                        fontFamily: 'monospace',
                        fontSize: '13px'
                      }}>
                        #{reservation.id.substring(0, 8)}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {reservation.clients?.name || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        📱 {reservation.clients?.mobile || 'غير متوفر'}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {reservation.units?.unit_code || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {reservation.units?.unit_type || 'غير محدد'}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>
                        {reservation.units?.project_id ? 
                          getProjectName(reservation.units.project_id) : 
                          'غير محدد'}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>
                        {formatDate(reservation.reservation_date)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                        {new Date(reservation.created_at).toLocaleTimeString('ar-SA', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <StatusBadge status={getStatusColor(reservation.status)}>
                        {reservation.status}
                      </StatusBadge>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>
                        {reservation.employees?.name || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {reservation.employees?.role === 'admin' ? 'مدير' : 'مندوب'}
                      </div>
                    </td>
                    
                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/clients/${reservation.client_id}/reservation/${reservation.id}`);
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
                            gap: '5px',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#bbdefb'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                        >
                          👁️ عرض
                        </button>
                        
                        {currentUser?.role === 'admin' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/dashboard/reservations/edit/${reservation.id}`);
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
                              gap: '5px',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#ffe0b2'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff3e0'}
                          >
                            ✏️ تعديل
                          </button>
                        )}
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
      {filteredReservations.length > 0 && (
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
            عرض <strong>1-{filteredReservations.length}</strong> من <strong>{filteredReservations.length}</strong> حجز
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
          <span>آخر تحديث للحجوزات: {new Date().toLocaleString('ar-SA')}</span>
          <span>إجمالي النتائج: {filteredReservations.length} من {reservations.length}</span>
          <span>عدد الموظفين: {employees.length}</span>
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
  icon 
}: { 
  title: string; 
  value: number; 
  color: string; 
  icon: string; 
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
      
      <div>
        <div style={{
          fontSize: '32px',
          fontWeight: '700',
          color: color,
          lineHeight: 1
        }}>
          {value}
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