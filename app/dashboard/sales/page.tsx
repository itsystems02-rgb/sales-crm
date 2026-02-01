'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

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
  project_id: string | null;
  sales_employee_id: string | null;

  clients: { id: string; name: string; mobile: string } | null;
  units: { id: string; unit_code: string; unit_type: string | null; project_id: string } | null;
  projects: { id: string; name: string } | null;
  sales_employee: { id: string; name: string; role: string } | null;
};

type ProjectLite = { id: string; name: string };

/* =====================
   StatusBadge
===================== */

function StatusBadge({
  children,
  status = 'default',
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
    default: { bg: '#e2e3e5', color: '#383d41', border: '#d6d8db' },
  };

  const c = colors[status];

  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600',
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}

/* =====================
   Helpers
===================== */

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeIds(ids: any[]) {
  return (ids || [])
    .map((x) => (x ?? '').toString().trim())
    .filter((x) => x.length > 0);
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const r of rows || []) map.set(r.id, r);
  return Array.from(map.values());
}

/* =====================
   Permissions helpers
===================== */

// جلب المشاريع المسموحة للموظف
async function fetchAllowedProjects(employee: any): Promise<ProjectLite[]> {
  try {
    if (employee?.role === 'admin') {
      // للإدمن: ممكن نعرض كل المشاريع في الفلاتر
      const { data, error } = await supabase.from('projects').select('id, name').order('name');
      if (error) throw error;
      return (data || []) as ProjectLite[];
    }

    if (employee?.role === 'sales' || employee?.role === 'sales_manager') {
      const { data: ep, error: epErr } = await supabase
        .from('employee_projects')
        .select('project_id')
        .eq('employee_id', employee.id);

      if (epErr) throw epErr;

      const ids = normalizeIds((ep || []).map((x: any) => x.project_id));
      if (!ids.length) return [];

      // chunking لتجنب Bad Request
      const chunks = chunkArray(ids, 200);
      const all: ProjectLite[] = [];

      for (const ch of chunks) {
        const { data, error } = await supabase.from('projects').select('id, name').in('id', ch).order('name');
        if (error) throw error;
        if (data?.length) all.push(...(data as any));
      }

      return dedupeById(all);
    }

    return [];
  } catch (err) {
    console.error('Error fetching allowed projects:', err);
    return [];
  }
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

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [allowedProjects, setAllowedProjects] = useState<ProjectLite[]>([]);
  const [allProjectsForAdmin, setAllProjectsForAdmin] = useState<ProjectLite[]>([]);

  const [employeesForFilter, setEmployeesForFilter] = useState<{ id: string; name: string; role: string }[]>([]);

  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    project: 'all',
    employee: 'all',
    sortBy: 'created_at',
    sortOrder: 'desc' as 'asc' | 'desc',
  });

  const [showFilters, setShowFilters] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    cancelled: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    initPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, filters]);

  async function initPage() {
    setLoading(true);
    setError(null);

    try {
      const user = await getCurrentEmployee();
      if (!user) throw new Error('لم يتم العثور على بيانات المستخدم');
      setCurrentUser(user);

      // allowed projects
      const ap = await fetchAllowedProjects(user);
      setAllowedProjects(ap);

      // للإدمن: هنجيب كل المشاريع مرة واحدة للفلاتر
      if (user?.role === 'admin') {
        setAllProjectsForAdmin(ap);
      } else {
        setAllProjectsForAdmin([]);
      }

      // fetch sales سريع (JOIN) + فلترة بالصلاحيات
      await fetchSalesFast(user, ap);

      // employees للفلتر
      await fetchEmployeesForFilter(user, ap);
    } catch (err: any) {
      console.error('❌ initPage error:', err);
      setError(`حدث خطأ: ${err?.message || 'غير معروف'}`);
      setSales([]);
      calculateStats([]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * ✅ أسرع طريقة:
   * - Query واحدة فقط ب JOIN:
   *   sales + clients + units + projects + employee
   * - sales_manager فلترة بـ project_id مباشرة (مش unit_id)
   * - Pagination داخلي علشان ما يحصلش نقص أو بطء شديد
   */
  async function fetchSalesFast(user: any, allowedProjectsList: ProjectLite[]) {
    try {
      setError(null);

      const pageSize = 800; // رقم متوازن (كبّر/صغّر حسب الداتا)
      const all: Sale[] = [];

      // select with joins
      const selectStr = `
        id,
        sale_date,
        price_before_tax,
        price_after_tax,
        finance_type,
        payment_method,
        status,
        notes,
        created_at,
        client_id,
        unit_id,
        project_id,
        sales_employee_id,
        clients:client_id ( id, name, mobile ),
        units:unit_id ( id, unit_code, unit_type, project_id ),
        projects:project_id ( id, name ),
        sales_employee:employees!sales_sales_employee_id_fkey ( id, name, role )
      `;

      // ===== sales =====
      if (user?.role === 'sales') {
        let page = 0;
        while (true) {
          const from = page * pageSize;
          const to = from + pageSize - 1;

          const { data, error } = await supabase
            .from('sales')
            .select(selectStr)
            .eq('sales_employee_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

          if (error) throw error;

          const rows = (data || []) as any as Sale[];
          all.push(...rows);

          if (rows.length < pageSize) break;
          page++;
        }

        const final = dedupeById(all).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setSales(final);
        calculateStats(final);
        return;
      }

      // ===== admin =====
      if (user?.role === 'admin') {
        let page = 0;
        while (true) {
          const from = page * pageSize;
          const to = from + pageSize - 1;

          const { data, error } = await supabase
            .from('sales')
            .select(selectStr)
            .order('created_at', { ascending: false })
            .range(from, to);

          if (error) throw error;

          const rows = (data || []) as any as Sale[];
          all.push(...rows);

          if (rows.length < pageSize) break;
          page++;
        }

        const final = dedupeById(all).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setSales(final);
        calculateStats(final);
        return;
      }

      // ===== sales_manager =====
      if (user?.role === 'sales_manager') {
        const allowedProjectIds = normalizeIds((allowedProjectsList || []).map((p) => p.id));
        if (!allowedProjectIds.length) {
          setSales([]);
          calculateStats([]);
          return;
        }

        // chunking لتجنب Bad Request
        const projChunks = chunkArray(allowedProjectIds, 150);

        for (const chunk of projChunks) {
          let page = 0;
          while (true) {
            const from = page * pageSize;
            const to = from + pageSize - 1;

            const { data, error } = await supabase
              .from('sales')
              .select(selectStr)
              .in('project_id', chunk)
              .order('created_at', { ascending: false })
              .range(from, to);

            if (error) throw error;

            const rows = (data || []) as any as Sale[];
            all.push(...rows);

            if (rows.length < pageSize) break;
            page++;
          }
        }

        const final = dedupeById(all).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setSales(final);
        calculateStats(final);
        return;
      }

      // fallback
      setSales([]);
      calculateStats([]);
    } catch (err: any) {
      console.error('❌ fetchSalesFast error:', err);
      setError(`خطأ في جلب التنفيذات: ${err?.message || 'Bad Request'}`);
      setSales([]);
      calculateStats([]);
    }
  }

  /**
   * فلتر الموظفين:
   * - sales: نفسه فقط
   * - admin/manager: نجيب الموظفين (لو عايزها أسرع: نجيب فقط اللي لهم sales)
   */
  async function fetchEmployeesForFilter(user: any, allowedProjectsList: ProjectLite[]) {
    try {
      if (!user) return;

      // sales => نفسه فقط
      if (user?.role === 'sales') {
        setEmployeesForFilter([{ id: user.id, name: user.name, role: user.role }]);
        return;
      }

      // admin / sales_manager => employees table
      const { data, error } = await supabase.from('employees').select('id, name, role').order('name');
      if (error) throw error;

      const list = (data || []) as any as { id: string; name: string; role: string }[];

      // ضمان وجود نفسه
      if (!list.find((x) => x.id === user.id)) list.push({ id: user.id, name: user.name, role: user.role });

      setEmployeesForFilter(list);
    } catch (err) {
      console.error('❌ fetchEmployeesForFilter error:', err);
      setEmployeesForFilter(user?.id ? [{ id: user.id, name: user.name, role: user.role }] : []);
    }
  }

  function calculateStats(data: Sale[]) {
    const totalRevenue = (data || []).reduce(
      (sum, s) => sum + (s.price_after_tax ?? s.price_before_tax ?? 0),
      0
    );

    const st = {
      total: (data || []).length,
      completed: (data || []).filter((x) => (x.status || '').toLowerCase() === 'completed').length,
      pending: (data || []).filter((x) => (x.status || '').toLowerCase() === 'pending').length,
      cancelled: (data || []).filter((x) => (x.status || '').toLowerCase() === 'cancelled').length,
      totalRevenue,
    };

    setStats(st);
  }

  function applyFilters() {
    let filtered = [...sales];

    if (filters.status !== 'all') {
      filtered = filtered.filter((s) => (s.status || '').toLowerCase() === filters.status.toLowerCase());
    }

    if (filters.project !== 'all') {
      filtered = filtered.filter((s) => (s.project_id || s.units?.project_id || '') === filters.project);
    }

    if (filters.employee !== 'all') {
      filtered = filtered.filter((s) => (s.sales_employee_id || '') === filters.employee);
    }

    if (filters.search) {
      const t = filters.search.toLowerCase().trim();
      filtered = filtered.filter((s) => {
        const clientName = s.clients?.name?.toLowerCase() || '';
        const clientMobile = s.clients?.mobile || '';
        const unitCode = s.units?.unit_code?.toLowerCase() || '';
        const id = (s.id || '').toLowerCase();

        return clientName.includes(t) || clientMobile.includes(filters.search) || unitCode.includes(t) || id.includes(t);
      });
    }

    filtered.sort((a, b) => {
      let av: any;
      let bv: any;

      switch (filters.sortBy) {
        case 'sale_date':
          av = a.sale_date ? new Date(a.sale_date).getTime() : 0;
          bv = b.sale_date ? new Date(b.sale_date).getTime() : 0;
          break;
        case 'price':
          av = a.price_after_tax ?? a.price_before_tax ?? 0;
          bv = b.price_after_tax ?? b.price_before_tax ?? 0;
          break;
        default:
          av = new Date(a.created_at).getTime();
          bv = new Date(b.created_at).getTime();
      }

      return filters.sortOrder === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });

    setFilteredSales(filtered);
  }

  function handleFilterChange(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters({
      status: 'all',
      search: '',
      project: 'all',
      employee: 'all',
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
  }

  function getStatusColor(status: string) {
    switch ((status || '').toLowerCase()) {
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
        day: 'numeric',
      });
    } catch {
      return 'تاريخ غير صالح';
    }
  }

  function formatCurrency(amount: number | null) {
    if (!amount) return '-';
    return amount.toLocaleString('ar-SA') + ' ريال';
  }

  function getUserPermissionInfo() {
    if (!currentUser) return '';
    switch (currentUser.role) {
      case 'admin':
        return `مدير النظام - مشاهدة جميع التنفيذات (${sales.length} عملية)`;
      case 'sales_manager':
        return `مدير مبيعات - مشاهدة تنفيذات مشاريعك فقط (${allowedProjects.length} مشروع، ${sales.length} عملية)`;
      case 'sales':
        return `مندوب مبيعات - مشاهدة تنفيذاتك فقط (${sales.length} عملية)`;
      default:
        return 'صلاحية غير معروفة';
    }
  }

  // مشاريع الفلاتر
  const displayProjects = useMemo(() => {
    if (currentUser?.role === 'admin') return allProjectsForAdmin;
    return allowedProjects;
  }, [currentUser?.role, allowedProjects, allProjectsForAdmin]);

  // موظفين الفلاتر
  const displayEmployees = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser?.role === 'sales') return employeesForFilter.filter((e) => e.id === currentUser.id);
    return employeesForFilter;
  }, [currentUser, employeesForFilter]);

  if (loading) {
    return (
      <div
        style={{
          padding: '40px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          flexDirection: 'column',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '50px',
            height: '50px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '20px',
          }}
        />
        <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>جاري تحميل التنفيذات...</h2>
        <p style={{ color: '#666' }}>يرجى الانتظار أثناء جلب البيانات</p>

        {currentUser && (
          <div
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#e3f2fd',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#1565c0',
            }}
          >
            ⚙️ {getUserPermissionInfo()}
          </div>
        )}

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

  if (error) {
    return (
      <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
        <div
          style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ marginTop: 0 }}>⚠️ حدث خطأ</h2>
          <p>{error}</p>
          <p style={{ fontSize: '14px', marginTop: '10px' }}>تحقق من اتصال قاعدة البيانات وتأكد من صحة الإعدادات.</p>
        </div>

        <button
          onClick={initPage}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px',
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '30px',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 10px 0', color: '#2c3e50', fontSize: '28px' }}>💰 إدارة التنفيذات</h1>
          <p style={{ color: '#666', margin: 0 }}>
            إجمالي التنفيذات: <strong>{sales.length}</strong> عملية بيع
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
                display: 'inline-block',
              }}
            >
              ⚙️ {getUserPermissionInfo()}
            </div>
          )}
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
              gap: '5px',
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
              gap: '5px',
            }}
          >
            ➕ تنفيذ جديد
          </button>

          <button
            onClick={initPage}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            🔄 تحديث البيانات
          </button>
        </div>
      </div>

      {/* ===== STATISTICS CARDS ===== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '30px',
        }}
      >
        <StatCard title="إجمالي التنفيذات" value={stats.total} color="#3498db" icon="💰" />
        <StatCard title="مكتملة" value={stats.completed} color="#2ecc71" icon="✅" />
        <StatCard title="قيد الانتظار" value={stats.pending} color="#f39c12" icon="⏳" />
        <StatCard title="ملغاة" value={stats.cancelled} color="#e74c3c" icon="❌" />
        <StatCard
          title="إجمالي الإيرادات"
          value={formatCurrency(stats.totalRevenue)}
          color="#9b59b6"
          icon="💵"
          isCurrency
        />
      </div>

      {/* ===== FILTERS PANEL ===== */}
      {showFilters && (
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '30px',
            border: '1px solid #dee2e6',
            boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#2c3e50' }}>🔍 فلاتر البحث</h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '20px',
              marginBottom: '20px',
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
                }}
              />
            </div>

            {/* حالة */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
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
                  backgroundColor: 'white',
                }}
              >
                <option value="all">جميع الحالات</option>
                <option value="completed">مكتملة</option>
                <option value="pending">قيد الانتظار</option>
                <option value="cancelled">ملغاة</option>
                <option value="active">نشطة</option>
              </select>
            </div>

            {/* مشروع */}
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
                  backgroundColor: 'white',
                }}
              >
                <option value="all">جميع المشاريع</option>
                {displayProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* موظف */}
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
                  backgroundColor: 'white',
                }}
              >
                <option value="all">جميع الموظفين</option>
                {displayEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role === 'admin' ? 'مدير' : emp.role === 'sales_manager' ? 'مدير مبيعات' : 'مندوب مبيعات'})
                  </option>
                ))}
              </select>
            </div>

            {/* ترتيب */}
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
                    backgroundColor: 'white',
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
                    backgroundColor: 'white',
                  }}
                >
                  <option value="desc">تنازلي</option>
                  <option value="asc">تصاعدي</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
            <button
              onClick={resetFilters}
              style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              🔄 إعادة الضبط
            </button>
            <button
              onClick={() => setShowFilters(false)}
              style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              تطبيق الفلاتر
            </button>
          </div>
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
          border: '1px solid #e9ecef',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#495057', fontWeight: '500' }}>نتائج البحث:</span>
          <span style={{ color: '#2c3e50', fontWeight: '600' }}>{filteredSales.length} تنفيذ</span>
        </div>

        {filters.search && (
          <div style={{ backgroundColor: '#e3f2fd', padding: '5px 15px', borderRadius: '20px', fontSize: '14px', color: '#1565c0' }}>
            🔍 البحث: "{filters.search}"
          </div>
        )}
      </div>

      {/* ===== SALES TABLE ===== */}
      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #dee2e6', overflow: 'hidden' }}>
        {filteredSales.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
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
                  fontSize: '16px',
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
                  fontSize: '16px',
                }}
              >
                🔄 عرض جميع التنفيذات
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  {['رقم التنفيذ', 'العميل', 'الوحدة', 'المشروع', 'تاريخ البيع', 'السعر', 'نوع التمويل', 'الحالة', 'الموظف', 'الإجراءات'].map((h) => (
                    <th key={h} style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>
                      {h}
                    </th>
                  ))}
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
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e9ecef')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f8f9fa')}
                    onClick={() => router.push(`/dashboard/sales/${sale.id}`)}
                  >
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50', fontFamily: 'monospace', fontSize: '13px' }}>
                        #{sale.id.substring(0, 8)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                        {new Date(sale.created_at).toLocaleDateString('ar-SA')}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>{sale.clients?.name || 'غير محدد'}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        📱 {sale.clients?.mobile || 'غير متوفر'}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>{sale.units?.unit_code || 'غير محدد'}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {sale.units?.unit_type || 'غير محدد'}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{sale.projects?.name || 'غير محدد'}</div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{formatDate(sale.sale_date)}</div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057', fontWeight: '600' }}>
                        {formatCurrency(sale.price_after_tax ?? sale.price_before_tax)}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{sale.finance_type || '-'}</div>
                      {sale.payment_method && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>{sale.payment_method}</div>
                      )}
                    </td>

                    <td style={{ padding: '15px' }}>
                      <StatusBadge status={getStatusColor(sale.status)}>{sale.status}</StatusBadge>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{sale.sales_employee?.name || 'غير محدد'}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {sale.sales_employee?.role === 'admin'
                          ? 'مدير'
                          : sale.sales_employee?.role === 'sales_manager'
                          ? 'مدير مبيعات'
                          : 'مندوب مبيعات'}
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
                            transition: 'all 0.2s ease',
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#bbdefb')}
                          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#e3f2fd')}
                        >
                          👁️ عرض
                        </button>

                        {(currentUser?.role === 'admin' || currentUser?.role === 'sales_manager') && (
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
                              transition: 'all 0.2s ease',
                            }}
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
          border: '1px dashed #dee2e6',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span>آخر تحديث للتنفيذات: {new Date().toLocaleString('ar-SA')}</span>
          <span>
            إجمالي النتائج: {filteredSales.length} من {sales.length}
          </span>
          <span>الإيرادات الإجمالية: {formatCurrency(stats.totalRevenue)}</span>
          <span>عدد المشاريع: {displayProjects.length}</span>
          <span>عدد الموظفين: {displayEmployees.length}</span>
        </div>
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

/* =====================
   Stat Card
===================== */

function StatCard({
  title,
  value,
  color,
  icon,
  isCurrency = false,
}: {
  title: string;
  value: number | string;
  color: string;
  icon: string;
  isCurrency?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        border: `1px solid ${color}20`,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'transform 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
      }}
      onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div
        style={{
          width: '50px',
          height: '50px',
          borderRadius: '10px',
          backgroundColor: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          color: color,
        }}
      >
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: isCurrency ? '16px' : '24px', fontWeight: '700', color: color, lineHeight: 1.2 }}>
          {isCurrency ? value : typeof value === 'number' ? value.toLocaleString('ar-SA') : value}
        </div>
        <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>{title}</div>
      </div>
    </div>
  );
}
