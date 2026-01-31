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
    project_name?: string;
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
   Helper Functions
===================== */

// جلب المشاريع المسموحة للموظف
async function fetchAllowedProjects(employee: any) {
  try {
    // إذا كان ادمن، اجلب جميع المشاريع
    if (employee?.role === 'admin') {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, code')
        .order('name');

      if (error) throw error;
      return data || [];
    }

    // إذا كان sales أو sales_manager، اجلب المشاريع المخصصة له فقط
    if (employee?.role === 'sales' || employee?.role === 'sales_manager') {
      const { data: employeeProjects, error: empError } = await supabase
        .from('employee_projects')
        .select('project_id')
        .eq('employee_id', employee.id);

      if (empError) throw empError;

      const allowedProjectIds = (employeeProjects || []).map((p: any) => p.project_id);

      if (allowedProjectIds.length > 0) {
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('id, name, code')
          .in('id', allowedProjectIds)
          .order('name');

        if (projectsError) throw projectsError;
        return projectsData || [];
      } else {
        return [];
      }
    }

    return [];
  } catch (err) {
    console.error('Error fetching allowed projects:', err);
    return [];
  }
}

// جلب جميع المشاريع (للادمن فقط)
async function fetchAllProjects() {
  try {
    const { data, error } = await supabase.from('projects').select('id, name, code').order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching all projects:', err);
    return [];
  }
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

  const [employees, setEmployees] = useState<{ id: string; name: string; role: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [allowedProjects, setAllowedProjects] = useState<{ id: string; name: string }[]>([]);

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

  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    initPage();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [reservations, filters]);

  async function initPage() {
    setLoading(true);
    setDebugInfo('جاري تحميل البيانات...');

    try {
      // 1) جلب المستخدم الحالي
      const user = await getCurrentEmployee();
      setCurrentUser(user);

      // 2) جلب المشاريع المسموحة
      const userProjects = await fetchAllowedProjects(user);
      setAllowedProjects(userProjects);

      // 3) مشاريع الفلاتر
      if (user?.role === 'admin') {
        const allProjects = await fetchAllProjects();
        setProjects(allProjects);
      } else {
        setProjects(userProjects);
      }

      // ✅ 4) جلب الحجوزات (مرر المشاريع مباشرة بدل state)
      await fetchReservations(user, userProjects);

      // 5) جلب الموظفين
      await fetchEmployees(user);

      setDebugInfo(prev => `${prev} ✅ تم التحميل`);
    } catch (error) {
      console.error('Error initializing page:', error);
      setDebugInfo(
        `خطأ في تحميل الصفحة: ${error instanceof Error ? error.message : 'حدث خطأ غير معروف'}`
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchEmployees(user: any) {
    try {
      if (user?.role === 'admin') {
        const { data: employeesData } = await supabase
          .from('employees')
          .select('id, name, role')
          .order('name');

        setEmployees(employeesData || []);
      } else {
        setEmployees([{ id: user.id, name: user.name, role: user.role }]);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  }

  // ✅ تم تعديلها لاستقبال userProjects وعدم الاعتماد على allowedProjects state
  async function fetchReservations(user: any, userProjects: any[] = []) {
    try {
      let query = supabase.from('reservations').select('*').order('created_at', { ascending: false });

      if (user?.role === 'sales') {
        query = query.eq('employee_id', user.id);
      } else if (user?.role === 'sales_manager') {
        const allowedProjectIds = userProjects.map(p => p.id);

        setDebugInfo(prev => `${prev}\nمدير مبيعات: مشاريع مسموحة = ${allowedProjectIds.length}`);

        if (allowedProjectIds.length > 0) {
          const { data: unitsData, error: unitsError } = await supabase
            .from('units')
            .select('id')
            .in('project_id', allowedProjectIds);

          if (unitsError) {
            console.error('Error fetching units for manager:', unitsError);
            setDebugInfo(prev => `${prev}\n❌ خطأ في جلب الوحدات: ${unitsError.message}`);
            setReservations([]);
            calculateStats([]);
            return;
          }

          const unitIds = unitsData?.map(u => u.id) || [];
          setDebugInfo(prev => `${prev}\nوحدات ضمن المشاريع = ${unitIds.length}`);

          if (unitIds.length > 0) {
            query = query.in('unit_id', unitIds);
          } else {
            setReservations([]);
            calculateStats([]);
            return;
          }
        } else {
          setReservations([]);
          calculateStats([]);
          return;
        }
      }
      // admin: بدون فلترة

      const { data: reservationsData, error: reservationsError } = await query;

      if (reservationsError) {
        console.error('Error fetching reservations:', reservationsError);
        setDebugInfo(`خطأ في جلب الحجوزات: ${reservationsError.message}`);
        throw reservationsError;
      }

      setDebugInfo(prev => `${prev}\nتم جلب ${reservationsData?.length || 0} حجز`);

      if (!reservationsData || reservationsData.length === 0) {
        setReservations([]);
        calculateStats([]);
        return;
      }

      // جلب التفاصيل لكل حجز (زي ما هو عندك)
      const reservationsWithDetails = await Promise.all(
        reservationsData.map(async (reservation: any) => {
          const reservationWithDetails: any = { ...reservation };

          // العميل
          if (reservation.client_id) {
            const { data: clientData } = await supabase
              .from('clients')
              .select('name, mobile, status')
              .eq('id', reservation.client_id)
              .single();

            reservationWithDetails.clients = clientData || null;
          }

          // الوحدة + المشروع
          if (reservation.unit_id) {
            const { data: unitData } = await supabase
              .from('units')
              .select('unit_code, unit_type, project_id')
              .eq('id', reservation.unit_id)
              .single();

            if (unitData) {
              reservationWithDetails.units = {
                unit_code: unitData.unit_code,
                unit_type: unitData.unit_type,
                project_id: unitData.project_id
              };

              if (unitData.project_id) {
                const { data: projectData } = await supabase
                  .from('projects')
                  .select('name')
                  .eq('id', unitData.project_id)
                  .single();

                if (projectData) {
                  reservationWithDetails.units.project_name = projectData.name;
                }
              }
            }
          }

          // الموظف
          if (reservation.employee_id) {
            const { data: employeeData } = await supabase
              .from('employees')
              .select('name, role')
              .eq('id', reservation.employee_id)
              .single();

            reservationWithDetails.employees = employeeData || null;
          }

          return reservationWithDetails;
        })
      );

      setReservations(reservationsWithDetails as Reservation[]);
      calculateStats(reservationsWithDetails as Reservation[]);
    } catch (error) {
      console.error('Error in fetchReservations:', error);
      setDebugInfo(`خطأ: ${error instanceof Error ? error.message : 'حدث خطأ غير معروف'}`);
      setReservations([]);
      calculateStats([]);
    }
  }

  const getDisplayProjects = () => {
    return currentUser?.role === 'admin' ? projects : allowedProjects;
  };

  const getDisplayEmployees = () => {
    if (currentUser?.role === 'admin') return employees;

    if (currentUser?.role === 'sales_manager') {
      // ملاحظة: انت أصلاً بتجيب employees لنفسه فقط لغير admin
      // فهنا الفلتر ده مش هيضيف قيمة كبيرة - تركته زي ما هو
      return employees.filter(emp => emp.role === 'sales' || emp.id === currentUser.id);
    }

    return employees.filter(emp => emp.id === currentUser?.id);
  };

  function calculateStats(data: Reservation[]) {
    const s = {
      total: data.length,
      active: data.filter(r => r.status === 'active' || r.status === 'Active').length,
      pending: data.filter(r => r.status === 'pending' || r.status === 'Pending').length,
      cancelled: data.filter(r => r.status === 'cancelled' || r.status === 'Cancelled').length,
      completed: data.filter(r => r.status === 'completed' || r.status === 'Completed').length
    };
    setStats(s);
  }

  function applyFilters() {
    let filtered = [...reservations];

    if (filters.status !== 'all') {
      filtered = filtered.filter(r => r.status?.toLowerCase() === filters.status.toLowerCase());
    }

    if (filters.employee !== 'all') {
      filtered = filtered.filter(r => r.employee_id === filters.employee);
    }

    if (filters.project !== 'all') {
      filtered = filtered.filter(r => r.units?.project_id === filters.project);
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(r => new Date(r.reservation_date) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => new Date(r.reservation_date) <= toDate);
    }

    if (filters.unitType !== 'all') {
      filtered = filtered.filter(r => r.units?.unit_type === filters.unitType);
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(r =>
        r.clients?.name?.toLowerCase().includes(searchTerm) ||
        r.clients?.mobile?.includes(searchTerm) ||
        r.units?.unit_code?.toLowerCase().includes(searchTerm) ||
        r.id.toLowerCase().includes(searchTerm)
      );
    }

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

      if (filters.sortOrder === 'asc') return aValue > bValue ? 1 : -1;
      return aValue < bValue ? 1 : -1;
    });

    setFilteredReservations(filtered);
  }

  function handleFilterChange(key: keyof FilterState, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }));
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

  function getProjectName(unit: any) {
    if (unit?.project_name) return unit.project_name;
    if (unit?.project_id) {
      const project = projects.find(p => p.id === unit.project_id);
      return project ? project.name : 'غير محدد';
    }
    return 'غير محدد';
  }

  function getUserPermissionInfo() {
    if (!currentUser) return '';

    switch (currentUser.role) {
      case 'admin':
        return 'مدير النظام - مشاهدة جميع الحجوزات';
      case 'sales_manager':
        return `مدير مبيعات - مشاهدة حجوزات ${allowedProjects.length} مشروع`;
      case 'sales':
        return 'مندوب مبيعات - مشاهدة حجوزاتك فقط';
      default:
        return 'صلاحية غير معروفة';
    }
  }

  if (loading) {
    return (
      <div
        className="page"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          flexDirection: 'column',
          gap: '20px'
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
          <div style={{ color: '#666', marginBottom: '10px' }}>جاري تحميل الحجوزات...</div>
          <div style={{ fontSize: '12px', color: '#999', whiteSpace: 'pre-line' }}>{debugInfo}</div>
          {currentUser && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                backgroundColor: '#e3f2fd',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#1565c0'
              }}
            >
              ⚙️ {getUserPermissionInfo()}
            </div>
          )}
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

  return (
    <div className="page">
      {/* ===== HEADER ===== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '30px'
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 10px 0', color: '#2c3e50', fontSize: '28px' }}>
            📋 إدارة الحجوزات
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            إجمالي الحجوزات: <strong>{reservations.length}</strong> حجز
          </p>
          {currentUser && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                backgroundColor: '#e3f2fd',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#1565c0',
                display: 'inline-block'
              }}
            >
              ⚙️ {getUserPermissionInfo()}
            </div>
          )}
          {debugInfo && (
            <div
              style={{
                marginTop: '5px',
                fontSize: '12px',
                color: '#666',
                backgroundColor: '#f8f9fa',
                padding: '5px 10px',
                borderRadius: '4px',
                display: 'inline-block',
                whiteSpace: 'pre-line'
              }}
            >
              {debugInfo}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? '✖ إخفاء الفلاتر' : '🔍 عرض الفلاتر'}
          </Button>

          <Button onClick={() => router.push('/dashboard/reservations/new')}>➕ حجز جديد</Button>

          <Button variant="secondary" onClick={() => window.print()}>
            🖨️ طباعة التقرير
          </Button>

          <Button variant="secondary" onClick={initPage}>
            🔄 تحديث البيانات
          </Button>
        </div>
      </div>

      {/* ===== STATISTICS CARDS ===== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}
      >
        <StatCard title="إجمالي الحجوزات" value={stats.total} color="#3498db" icon="📋" />
        <StatCard title="نشطة" value={stats.active} color="#2ecc71" icon="✅" />
        <StatCard title="قيد الانتظار" value={stats.pending} color="#f39c12" icon="⏳" />
        <StatCard title="ملغاة" value={stats.cancelled} color="#e74c3c" icon="❌" />
        <StatCard title="مكتملة" value={stats.completed} color="#9b59b6" icon="🎉" />
      </div>

      {/* ===== FILTERS PANEL ===== */}
      {showFilters && (
        <div style={{ marginBottom: '30px' }}>
          <Card title="🔍 فلاتر البحث">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px',
                padding: '20px'
              }}
            >
              {/* بحث */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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

              {/* الحالة */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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

              {/* الموظف */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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
                  {getDisplayEmployees().map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} (
                      {emp.role === 'admin' ? 'مدير' : emp.role === 'sales_manager' ? 'مدير مبيعات' : 'مندوب'})
                    </option>
                  ))}
                </select>
              </div>

              {/* المشروع */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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
                  {getDisplayProjects().map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* التاريخ */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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

              {/* نوع الوحدة */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                padding: '20px',
                borderTop: '1px solid #eee'
              }}
            >
              <Button variant="secondary" onClick={resetFilters}>
                🔄 إعادة الضبط
              </Button>
              <Button onClick={() => setShowFilters(false)}>تطبيق الفلاتر</Button>
            </div>
          </Card>
        </div>
      )}

      {/* ===== RESULTS SUMMARY ===== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #e9ecef'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#495057', fontWeight: '500' }}>نتائج البحث:</span>
          <span style={{ color: '#2c3e50', fontWeight: '600' }}>{filteredReservations.length} حجز</span>
        </div>

        {filters.search && (
          <div
            style={{
              backgroundColor: '#e3f2fd',
              padding: '5px 15px',
              borderRadius: '20px',
              fontSize: '14px',
              color: '#1565c0'
            }}
          >
            🔍 البحث: "{filters.search}"
          </div>
        )}
      </div>

      {/* ===== RESERVATIONS TABLE ===== */}
      <Card>
        {filteredReservations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📭</div>
            <h3 style={{ marginBottom: '10px', color: '#495057' }}>
              {reservations.length === 0 ? 'لا توجد حجوزات' : 'لا توجد حجوزات تطابق معايير البحث'}
            </h3>
            <p style={{ marginBottom: '20px' }}>
              {reservations.length === 0
                ? 'لم يتم إضافة أي حجوزات بعد. يمكنك إضافة حجوزات جديدة من الزر أعلاه.'
                : 'لم يتم العثور على حجوزات تطابق معايير البحث. حاول تغيير الفلاتر.'}
            </p>
            {reservations.length === 0 ? (
              <Button onClick={() => router.push('/dashboard/reservations/new')}>➕ إضافة حجز جديد</Button>
            ) : (
              <Button variant="secondary" onClick={resetFilters}>
                🔄 عرض جميع الحجوزات
              </Button>
            )}

            <div style={{ marginTop: '20px', fontSize: '12px', color: '#999' }}>
              <button
                onClick={() => {
                  console.log('Reservations data:', reservations);
                  console.log('Current user:', currentUser);
                  console.log('Allowed projects:', allowedProjects);
                  alert(
                    `تم فحص البيانات:\nعدد الحجوزات: ${reservations.length}\nصلاحية المستخدم: ${currentUser?.role}\nافتح وحدة تحكم المطورين (F12) لعرض التفاصيل.`
                  );
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#495057'
                }}
              >
                🔍 فحص بيانات الحجوزات
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  <th style={thStyle}>رقم الحجز</th>
                  <th style={thStyle}>العميل</th>
                  <th style={thStyle}>الوحدة</th>
                  <th style={thStyle}>المشروع</th>
                  <th style={thStyle}>تاريخ الحجز</th>
                  <th style={thStyle}>الحالة</th>
                  <th style={thStyle}>الموظف</th>
                  <th style={thStyle}>الإجراءات</th>
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
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e9ecef')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f8f9fa')
                    }
                    onClick={() => router.push(`/dashboard/clients/${reservation.client_id}/reservation/${reservation.id}`)}
                  >
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50', fontFamily: 'monospace', fontSize: '13px' }}>
                        #{reservation.id.substring(0, 8)}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>{reservation.clients?.name || 'غير محدد'}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        📱 {reservation.clients?.mobile || 'غير متوفر'}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>{reservation.units?.unit_code || 'غير محدد'}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>{reservation.units?.unit_type || 'غير محدد'}</div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{getProjectName(reservation.units)}</div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{formatDate(reservation.reservation_date)}</div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                        {new Date(reservation.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <StatusBadge status={getStatusColor(reservation.status)}>{reservation.status}</StatusBadge>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{reservation.employees?.name || 'غير محدد'}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {reservation.employees?.role === 'admin'
                          ? 'مدير'
                          : reservation.employees?.role === 'sales_manager'
                          ? 'مدير مبيعات'
                          : 'مندوب'}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/clients/${reservation.client_id}/reservation/${reservation.id}`);
                          }}
                          style={actionBtn('#e3f2fd', '#1565c0')}
                          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#bbdefb')}
                          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#e3f2fd')}
                        >
                          👁️ عرض
                        </button>

                        {currentUser?.role === 'admin' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/dashboard/reservations/edit/${reservation.id}`);
                            }}
                            style={actionBtn('#fff3e0', '#f57c00')}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#ffe0b2')}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#fff3e0')}
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

      {/* ===== PAGINATION (Placeholder كما هو) ===== */}
      {filteredReservations.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '30px',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}
        >
          <div style={{ color: '#666', fontSize: '14px' }}>
            عرض <strong>1-{filteredReservations.length}</strong> من <strong>{filteredReservations.length}</strong> حجز
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="secondary" disabled={true}>
              السابق
            </Button>

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

            <Button variant="secondary" disabled={true}>
              التالي
            </Button>
          </div>
        </div>
      )}

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
          <span>آخر تحديث للحجوزات: {new Date().toLocaleString('ar-SA')}</span>
          <span>إجمالي النتائج: {filteredReservations.length} من {reservations.length}</span>
          <span>عدد الموظفين: {getDisplayEmployees().length}</span>
          <span>عدد المشاريع: {getDisplayProjects().length}</span>
        </div>
      </div>
    </div>
  );
}

/* =====================
   Small UI Helpers
===================== */

const thStyle: React.CSSProperties = {
  padding: '15px',
  textAlign: 'right',
  fontWeight: '600',
  color: '#495057',
  fontSize: '14px'
};

function actionBtn(bg: string, color: string): React.CSSProperties {
  return {
    padding: '8px 12px',
    backgroundColor: bg,
    border: 'none',
    borderRadius: '6px',
    color,
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    transition: 'all 0.2s ease'
  };
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
    <div
      style={{
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
      onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-5px)')}
      onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '12px',
          backgroundColor: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          color: color
        }}
      >
        {icon}
      </div>

      <div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>{title}</div>
      </div>
    </div>
  );
}
