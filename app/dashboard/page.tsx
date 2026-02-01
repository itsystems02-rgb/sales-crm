'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';

/* =====================
   Types
===================== */

type Employee = {
  id: string;
  name: string;
  role: 'admin' | 'sales' | 'sales_manager';
  email: string;
  projects?: string[];
};

type DashboardStats = {
  totalClients: number;
  totalAvailableUnits: number;

  myFollowUps: number;
  myReservations: number;
  mySales: number;

  otherEmployeesStats: Array<{
    id: string;
    name: string;
    followUps: number;
    reservations: number;
    sales: number;
    totalActivity: number;
    projects: string[];
  }>;

  myTeamStats?: Array<{
    id: string;
    name: string;
    followUps: number;
    reservations: number;
    sales: number;
    totalActivity: number;
    projects: string[];
  }>;

  clientsByStatus: {
    lead: number;
    reserved: number;
    converted: number;
    visited: number;
  };

  unitsByStatus: {
    available: number;
    reserved: number;
    sold: number;
  };

  avgFollowUpsPerEmployee: number;
  avgReservationsPerEmployee: number;
  avgSalesPerEmployee: number;

  conversionRate: number;
  reservationToSaleRate: number;

  myProjectsUnits: {
    available: number;
    reserved: number;
    sold: number;
  };

  managerProjects?: string[];
};

type RpcSingleRow = {
  followups: number | string;
  reservations: number | string;
  sales: number | string;
};

type RpcBulkRow = {
  employee_id: string;
  followups: number | string;
  reservations: number | string;
  sales: number | string;
};

/* =====================
   Small helpers
===================== */

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function asyncPool<T, R>(
  poolLimit: number,
  array: T[],
  iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing: Promise<any>[] = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (poolLimit <= array.length) {
      const e: Promise<any> = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

/* =====================
   Page
===================== */

export default function DashboardPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('month');

  /* =====================
     Helper Functions
  ===================== */

  function getStartDate(range: 'today' | 'week' | 'month' | 'all'): string {
    const now = new Date();
    switch (range) {
      case 'today':
        now.setHours(0, 0, 0, 0);
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        break;
      case 'all':
        return '1970-01-01T00:00:00.000Z';
    }
    return now.toISOString();
  }

  function getActivityLevel(activity: number): { label: string; color: string; bgColor: string } {
    if (activity >= 20) return { label: 'ممتاز', color: '#0d8a3e', bgColor: '#e6f4ea' };
    if (activity >= 10) return { label: 'جيد جداً', color: '#34a853', bgColor: '#e8f5e9' };
    if (activity >= 5) return { label: 'جيد', color: '#fbbc04', bgColor: '#fff8e1' };
    if (activity >= 1) return { label: 'ضعيف', color: '#ea4335', bgColor: '#ffebee' };
    return { label: 'لا يوجد نشاط', color: '#666', bgColor: '#f5f5f5' };
  }

  function calculatePercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.min((value / total) * 100, 100);
  }

  async function getEmployeeProjects(employeeId: string): Promise<string[]> {
    const { data, error } = await supabase.from('employee_projects').select('project_id').eq('employee_id', employeeId);
    if (error) {
      console.error('Error fetching employee projects:', error);
      return [];
    }
    return (data || []).map((p: any) => p.project_id);
  }

  async function getTeamEmployees(managerId: string, managerProjects: string[]): Promise<Employee[]> {
    if (!managerProjects || managerProjects.length === 0) return [];

    const { data: employeeProjects, error } = await supabase
      .from('employee_projects')
      .select('employee_id')
      .in('project_id', managerProjects);

    if (error) {
      console.error('Error fetching team employees:', error);
      return [];
    }

    const employeeIds = [...new Set((employeeProjects || []).map((ep: any) => ep.employee_id))].filter((id) => id !== managerId);
    if (employeeIds.length === 0) return [];

    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, name, email, role')
      .in('id', employeeIds)
      .eq('role', 'sales');

    if (empError) {
      console.error('Error fetching employees data:', empError);
      return [];
    }

    return (employees || []) as Employee[];
  }

  async function getUnitsByStatus(projectIds?: string[]) {
    const base = () => supabase.from('units').select('id', { count: 'exact', head: true });

    const make = (status: 'available' | 'reserved' | 'sold') => {
      let q: any = base().eq('status', status);
      if (projectIds && projectIds.length > 0) q = q.in('project_id', projectIds);
      return q;
    };

    const [{ count: available }, { count: reserved }, { count: sold }] = await Promise.all([
      make('available'),
      make('reserved'),
      make('sold'),
    ]);

    return {
      available: available || 0,
      reserved: reserved || 0,
      sold: sold || 0,
      totalAvailable: available || 0,
    };
  }

  async function getClientsByStatus(projectIds?: string[]) {
    const base = () => supabase.from('clients').select('id', { count: 'exact', head: true });

    const make = (status: 'lead' | 'reserved' | 'converted' | 'visited') => {
      let q: any = base().eq('status', status);
      if (projectIds && projectIds.length > 0) q = q.in('interested_in_project_id', projectIds);
      return q;
    };

    const [{ count: lead }, { count: reserved }, { count: converted }, { count: visited }] = await Promise.all([
      make('lead'),
      make('reserved'),
      make('converted'),
      make('visited'),
    ]);

    return {
      lead: lead || 0,
      reserved: reserved || 0,
      converted: converted || 0,
      visited: visited || 0,
    };
  }

  async function getTotalClientsCount(projectIds?: string[]) {
    let q: any = supabase.from('clients').select('id', { count: 'exact', head: true });
    if (projectIds && projectIds.length > 0) q = q.in('interested_in_project_id', projectIds);
    const { count, error } = await q;
    if (error) console.error('Error fetching total clients count:', error);
    return count || 0;
  }

  /* =====================
     RPC Helpers
  ===================== */

  async function rpcSingleCounts(employeeId: string, startDate: string, projectIds?: string[]) {
    const { data, error } = await supabase.rpc('get_employee_activity_counts_single', {
      p_employee_id: employeeId,
      p_start_date: startDate,
      p_project_ids: projectIds && projectIds.length ? projectIds : null,
    });

    if (error) {
      console.error('RPC single counts error:', error);
      return { followups: 0, reservations: 0, sales: 0 };
    }

    const row = (Array.isArray(data) ? data[0] : data) as RpcSingleRow | null;
    return {
      followups: toNum((row as any)?.followups),
      reservations: toNum((row as any)?.reservations),
      sales: toNum((row as any)?.sales),
    };
  }

  async function rpcBulkCounts(employeeIds: string[], startDate: string) {
    if (!employeeIds.length) return [] as RpcBulkRow[];

    const { data, error } = await supabase.rpc('get_employee_activity_counts_bulk', {
      p_employee_ids: employeeIds,
      p_start_date: startDate,
      p_project_ids: null, // للأدمن: كل المشاريع
    });

    if (error) {
      console.error('RPC bulk counts error:', error);
      return [] as RpcBulkRow[];
    }

    return (data || []) as RpcBulkRow[];
  }

  /* =====================
     INIT
  ===================== */

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  async function init() {
    try {
      setLoading(true);

      const emp = await getCurrentEmployee();
      if (!emp) {
        setLoading(false);
        return;
      }

      const [empData, empProjects] = await Promise.all([
        supabase.from('employees').select('name, email').eq('id', emp.id).single(),
        getEmployeeProjects(emp.id),
      ]);

      const employeeData: Employee = {
        ...emp,
        name: empData?.data?.name || 'موظف',
        email: empData?.data?.email || '',
        projects: empProjects,
      };

      setEmployee(employeeData);
      await loadDashboardStats(employeeData);
    } catch (err) {
      console.error('Error in init():', err);
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     Load Dashboard Stats (FAST)
  ===================== */

  async function loadDashboardStats(emp: Employee) {
    setLoading(true);

    // ✅ عرض Cache سريع جدًا ثم تحديث في الخلف (نفس النتائج بعد التحديث)
    const cacheKey = `dash_stats:${emp.id}:${timeRange}`;
    const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    if (cached) {
      try {
        setStats(JSON.parse(cached));
        // ما بنعملش return: بنكمل fetch عشان نحدّث الأرقام
      } catch {}
    }

    try {
      const startDate = getStartDate(timeRange);

      // المشاريع حسب الدور
      let allowedProjectIds: string[] = [];
      let managerProjects: string[] = [];
      let teamEmployees: Employee[] = [];

      if (emp.role === 'sales' || emp.role === 'sales_manager') {
        allowedProjectIds = emp.projects || [];
      }

      if (emp.role === 'sales_manager') {
        managerProjects = emp.projects || [];
        teamEmployees = await getTeamEmployees(emp.id, managerProjects);
      }

      // حالة بدون مشاريع
      if ((emp.role === 'sales' || emp.role === 'sales_manager') && allowedProjectIds.length === 0) {
        const unitsByStatus = { available: 0, reserved: 0, sold: 0 };
        const dashboardStats: DashboardStats = {
          totalClients: 0,
          totalAvailableUnits: 0,
          myFollowUps: 0,
          myReservations: 0,
          mySales: 0,
          otherEmployeesStats: [],
          clientsByStatus: { lead: 0, reserved: 0, converted: 0, visited: 0 },
          unitsByStatus,
          avgFollowUpsPerEmployee: 0,
          avgReservationsPerEmployee: 0,
          avgSalesPerEmployee: 0,
          conversionRate: 0,
          reservationToSaleRate: 0,
          myProjectsUnits: unitsByStatus,
          managerProjects: emp.role === 'sales_manager' ? managerProjects : undefined,
        };
        setStats(dashboardStats);
        if (typeof window !== 'undefined') localStorage.setItem(cacheKey, JSON.stringify(dashboardStats));
        return;
      }

      const scopeProjectIds = emp.role === 'admin' ? undefined : allowedProjectIds;

      // ✅ تحميل الأساسيات بالتوازي + counts للموظف الحالي RPC واحد
      const [unitsCounts, clientsByStatus, totalClientsCount, myCounts] = await Promise.all([
        getUnitsByStatus(scopeProjectIds),
        getClientsByStatus(scopeProjectIds),
        getTotalClientsCount(scopeProjectIds),
        rpcSingleCounts(emp.id, startDate, scopeProjectIds),
      ]);

      const myFollowUps = myCounts.followups;
      const myReservations = myCounts.reservations;
      const mySales = myCounts.sales;

      const unitsByStatus = {
        available: unitsCounts.available,
        reserved: unitsCounts.reserved,
        sold: unitsCounts.sold,
      };

      let otherEmployeesStats: any[] = [];
      let myTeamStats: any[] = [];

      // ===== ADMIN: bulk مرة واحدة
      if (emp.role === 'admin') {
        const { data: allEmployees, error: empErr } = await supabase
          .from('employees')
          .select('id, name, role')
          .neq('id', emp.id)
          .in('role', ['sales', 'sales_manager']);

        if (empErr) console.error(empErr);

        const employeesList = (allEmployees || []) as Array<{ id: string; name: string; role: string }>;
        const ids = employeesList.map((e) => e.id);

        // projects map
        const projectsMap: Record<string, string[]> = {};
        if (ids.length > 0) {
          const { data: epRows, error: epErr } = await supabase
            .from('employee_projects')
            .select('employee_id, project_id')
            .in('employee_id', ids);

          if (epErr) console.error(epErr);
          for (const row of (epRows || []) as any[]) {
            if (!projectsMap[row.employee_id]) projectsMap[row.employee_id] = [];
            projectsMap[row.employee_id].push(row.project_id);
          }
        }

        const bulk = await rpcBulkCounts(ids, startDate);
        const bulkMap: Record<string, { fu: number; rs: number; sl: number }> = {};
        for (const r of bulk) {
          bulkMap[r.employee_id] = { fu: toNum(r.followups), rs: toNum(r.reservations), sl: toNum(r.sales) };
        }

        otherEmployeesStats = employeesList.map((e) => {
          const c = bulkMap[e.id] || { fu: 0, rs: 0, sl: 0 };
          return {
            id: e.id,
            name: e.name || 'موظف',
            followUps: c.fu,
            reservations: c.rs,
            sales: c.sl,
            totalActivity: c.fu + c.rs + c.sl,
            projects: projectsMap[e.id] || [],
          };
        });
      }

      // ===== SALES_MANAGER: لكل عضو RPC واحد بمشاريعه المشتركة (أقل طلبات بكتير من قبل)
      if (emp.role === 'sales_manager') {
        const teamIds = teamEmployees.map((t) => t.id);
        const teamProjectsMap: Record<string, string[]> = {};
        if (teamIds.length > 0) {
          const { data: epRows, error: epErr } = await supabase
            .from('employee_projects')
            .select('employee_id, project_id')
            .in('employee_id', teamIds);

          if (epErr) console.error(epErr);
          for (const row of (epRows || []) as any[]) {
            if (!teamProjectsMap[row.employee_id]) teamProjectsMap[row.employee_id] = [];
            teamProjectsMap[row.employee_id].push(row.project_id);
          }
        }

        const results = await asyncPool(6, teamEmployees, async (teamMember) => {
          const memberProjects = teamProjectsMap[teamMember.id] || [];
          const sharedProjects = memberProjects.filter((pid) => managerProjects.includes(pid));
          if (sharedProjects.length === 0) return null;

          const counts = await rpcSingleCounts(teamMember.id, startDate, sharedProjects);

          return {
            id: teamMember.id,
            name: teamMember.name || 'موظف',
            followUps: counts.followups,
            reservations: counts.reservations,
            sales: counts.sales,
            totalActivity: counts.followups + counts.reservations + counts.sales,
            projects: sharedProjects,
          };
        });

        myTeamStats = results.filter(Boolean);
      }

      // ===== averages
      let employeeCount = 1;
      let totalFollowUps = myFollowUps;
      let totalReservations = myReservations;
      let totalSales = mySales;

      if (emp.role === 'admin') {
        const { data: allSalesEmployees } = await supabase.from('employees').select('id').in('role', ['sales', 'sales_manager']);
        employeeCount = allSalesEmployees?.length || 1;

        totalFollowUps = otherEmployeesStats.reduce((sum, e) => sum + e.followUps, myFollowUps);
        totalReservations = otherEmployeesStats.reduce((sum, e) => sum + e.reservations, myReservations);
        totalSales = otherEmployeesStats.reduce((sum, e) => sum + e.sales, mySales);
      } else if (emp.role === 'sales_manager') {
        employeeCount = (myTeamStats?.length || 0) + 1;

        const teamFollowUps = (myTeamStats || []).reduce((sum: number, e: any) => sum + e.followUps, 0);
        const teamReservations = (myTeamStats || []).reduce((sum: number, e: any) => sum + e.reservations, 0);
        const teamSales = (myTeamStats || []).reduce((sum: number, e: any) => sum + e.sales, 0);

        totalFollowUps = myFollowUps + teamFollowUps;
        totalReservations = myReservations + teamReservations;
        totalSales = mySales + teamSales;
      }

      const totalClients = totalClientsCount || 0;
      const conversionRate = totalClients && totalSales ? Math.round((totalSales / totalClients) * 100) : 0;
      const reservationToSaleRate = totalReservations && totalSales ? Math.round((totalSales / totalReservations) * 100) : 0;

      const dashboardStats: DashboardStats = {
        totalClients,
        totalAvailableUnits: unitsCounts.totalAvailable,

        myFollowUps,
        myReservations,
        mySales,

        otherEmployeesStats,
        myTeamStats: myTeamStats.length > 0 ? myTeamStats : undefined,

        clientsByStatus,
        unitsByStatus,

        avgFollowUpsPerEmployee: Math.round(totalFollowUps / employeeCount),
        avgReservationsPerEmployee: Math.round(totalReservations / employeeCount),
        avgSalesPerEmployee: Math.round(totalSales / employeeCount),

        conversionRate,
        reservationToSaleRate,

        myProjectsUnits: unitsByStatus,
        managerProjects: emp.role === 'sales_manager' ? managerProjects : undefined,
      };

      setStats(dashboardStats);
      if (typeof window !== 'undefined') localStorage.setItem(cacheKey, JSON.stringify(dashboardStats));
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     UI helpers
  ===================== */

  function getRoleLabel(role: string): string {
    switch (role) {
      case 'admin':
        return 'مدير نظام';
      case 'sales_manager':
        return 'مدير مبيعات';
      case 'sales':
        return 'مندوب مبيعات';
      default:
        return role;
    }
  }

  /* =====================
     UI
  ===================== */

  if (loading && !stats) {
    return (
      <RequireAuth>
        <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري تحميل الإحصائيات...</div>
            <div style={{ color: '#666' }}>يرجى الانتظار</div>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="page dashboard-page">
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>لوحة التحكم</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>
              مرحباً {employee?.name} ({getRoleLabel(employee?.role || '')})
              {employee?.projects && employee.projects.length > 0 && (
                <span style={{ fontSize: '12px', color: '#0d8a3e', marginRight: '10px' }}>
                  • {employee.projects.length} مشروع
                </span>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span>الفترة الزمنية:</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
            >
              <option value="today">اليوم</option>
              <option value="week">آخر أسبوع</option>
              <option value="month">آخر شهر</option>
              <option value="all">الكل</option>
            </select>
          </div>
        </div>

        {/* Quick Stats Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
            marginBottom: '30px',
          }}
        >
          {/* العملاء */}
          <div
            className="card-stats"
            style={{
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #eaeaea',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>إجمالي العملاء</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1a73e8' }}>
                  {(stats?.totalClients || 0).toLocaleString()}
                </div>
                {employee?.role === 'sales_manager' && (
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                    في مشاريعك ({stats?.managerProjects?.length || 0})
                  </div>
                )}
              </div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  backgroundColor: '#e8f0fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '24px', color: '#1a73e8' }}>👥</span>
              </div>
            </div>
            <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#0d8a3e' }}>متابعة: {stats?.clientsByStatus.lead || 0}</span>
              <span style={{ color: '#fbbc04' }}>محجوز: {stats?.clientsByStatus.reserved || 0}</span>
              <span style={{ color: '#34a853' }}>تم البيع: {stats?.clientsByStatus.converted || 0}</span>
            </div>
          </div>

          {/* الوحدات المتاحة */}
          <div
            className="card-stats"
            style={{
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #eaeaea',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>
                  الوحدات المتاحة {employee?.role === 'sales' && '(مشاريعك)'}
                  {employee?.role === 'sales_manager' && '(فريقك)'}
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#0d8a3e' }}>
                  {(stats?.totalAvailableUnits || 0).toLocaleString()}
                </div>
              </div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  backgroundColor: '#e6f4ea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '24px', color: '#0d8a3e' }}>🏠</span>
              </div>
            </div>
            <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
              {employee?.role === 'admin'
                ? 'كل المشاريع'
                : employee?.role === 'sales_manager'
                ? 'المشاريع الخاصة بفريقك'
                : 'المشاريع المرتبطة بك فقط'}
            </div>
          </div>

          {/* نشاطي الشخصي */}
          <div
            className="card-stats"
            style={{
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #eaeaea',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>نشاطي الشخصي</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  <span style={{ color: '#1a73e8' }}>{stats?.myFollowUps || 0}</span> /
                  <span style={{ color: '#fbbc04' }}> {stats?.myReservations || 0}</span> /
                  <span style={{ color: '#34a853' }}> {stats?.mySales || 0}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>متابعات / حجوزات / تنفيذات</div>
              </div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  backgroundColor: '#fff8e1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '24px', color: '#fbbc04' }}>📊</span>
              </div>
            </div>
          </div>

          {/* معدلات التحويل */}
          <div
            className="card-stats"
            style={{
              padding: '20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #eaeaea',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>معدل التحويل</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ea4335' }}>{stats?.conversionRate || 0}%</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>من عميل إلى بيع</div>
              </div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '12px',
                  backgroundColor: '#ffebee',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: '24px', color: '#ea4335' }}>📈</span>
              </div>
            </div>
            <div style={{ marginTop: '15px', fontSize: '12px' }}>{stats?.reservationToSaleRate || 0}% من الحجوزات تتحول لبيع</div>
          </div>
        </div>

        {/* قسمين رئيسيين */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: employee?.role === 'admin' ? '1fr 1fr' : '1fr',
            gap: '20px',
            marginBottom: '30px',
          }}
        >
          {/* إحصائيات الوحدات */}
          <Card
            title={`توزيع الوحدات ${
              employee?.role === 'sales' ? '(مشاريعك)' : employee?.role === 'sales_manager' ? '(فريقك)' : ''
            }`}
          >
            <div style={{ padding: '15px' }}>
              {(() => {
                const total =
                  (stats?.unitsByStatus.available || 0) +
                  (stats?.unitsByStatus.reserved || 0) +
                  (stats?.unitsByStatus.sold || 0);

                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                      <div style={{ width: 12, height: 12, backgroundColor: '#0d8a3e', borderRadius: '50%', marginRight: 8 }} />
                      <span>متاحة: {stats?.unitsByStatus.available || 0}</span>
                      <div style={{ flex: 1, marginLeft: 10 }}>
                        <div
                          style={{
                            width: `${calculatePercentage(stats?.unitsByStatus.available || 0, total)}%`,
                            height: 8,
                            backgroundColor: '#0d8a3e',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                      <div style={{ width: 12, height: 12, backgroundColor: '#fbbc04', borderRadius: '50%', marginRight: 8 }} />
                      <span>محجوزة: {stats?.unitsByStatus.reserved || 0}</span>
                      <div style={{ flex: 1, marginLeft: 10 }}>
                        <div
                          style={{
                            width: `${calculatePercentage(stats?.unitsByStatus.reserved || 0, total)}%`,
                            height: 8,
                            backgroundColor: '#fbbc04',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 12, height: 12, backgroundColor: '#34a853', borderRadius: '50%', marginRight: 8 }} />
                      <span>مباعة: {stats?.unitsByStatus.sold || 0}</span>
                      <div style={{ flex: 1, marginLeft: 10 }}>
                        <div
                          style={{
                            width: `${calculatePercentage(stats?.unitsByStatus.sold || 0, total)}%`,
                            height: 8,
                            backgroundColor: '#34a853',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 15, fontSize: 12, color: '#666', textAlign: 'center' }}>
                      إجمالي الوحدات: {total.toLocaleString()}
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>

          {/* أداء الفريق */}
          {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
            <Card title={employee?.role === 'admin' ? 'أداء فريق المبيعات' : 'أداء فريقك'}>
              <div style={{ padding: '15px' }}>
                {employee?.role === 'sales_manager' && (!stats?.myTeamStats || stats.myTeamStats.length === 0) ? (
                  <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                    لا يوجد موظفين في فريقك حالياً
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                        gap: '10px',
                        marginBottom: '10px',
                        paddingBottom: '10px',
                        borderBottom: '1px solid #eee',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        color: '#666',
                      }}
                    >
                      <div>الاسم</div>
                      <div style={{ textAlign: 'center' }}>متابعات</div>
                      <div style={{ textAlign: 'center' }}>حجوزات</div>
                      <div style={{ textAlign: 'center' }}>تنفيذات</div>
                      <div style={{ textAlign: 'center' }}>النشاط</div>
                    </div>

                    {(employee?.role === 'admin' ? stats?.otherEmployeesStats : stats?.myTeamStats)?.map((empStat) => {
                      const activityLevel = getActivityLevel(empStat.totalActivity);
                      return (
                        <div
                          key={empStat.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                            gap: '10px',
                            padding: '8px 0',
                            borderBottom: '1px solid #f5f5f5',
                            fontSize: '14px',
                            alignItems: 'center',
                          }}
                        >
                          <div>{empStat.name}</div>
                          <div style={{ textAlign: 'center', color: '#1a73e8' }}>{empStat.followUps}</div>
                          <div style={{ textAlign: 'center', color: '#fbbc04' }}>{empStat.reservations}</div>
                          <div style={{ textAlign: 'center', color: '#34a853' }}>{empStat.sales}</div>
                          <div style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                backgroundColor: activityLevel.bgColor,
                                color: activityLevel.color,
                              }}
                            >
                              {activityLevel.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ marginTop: '15px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                      المتوسط: {stats?.avgFollowUpsPerEmployee || 0} متابعة | {stats?.avgReservationsPerEmployee || 0} حجز |{' '}
                      {stats?.avgSalesPerEmployee || 0} تنفيذ
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* إجراءات سريعة */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <Card title="إجراءات سريعة">
            <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => router.push('/dashboard/clients')} style={btnStyle}>👥 إدارة العملاء</button>
              <button onClick={() => router.push('/dashboard/units')} style={btnStyle}>🏠 إدارة الوحدات</button>
              <button onClick={() => router.push('/dashboard/projects')} style={btnStyle}>📋 إدارة المشاريع</button>
              {employee?.role === 'admin' && (
                <button onClick={() => router.push('/dashboard/employees')} style={btnStyle}>👨‍💼 إدارة الموظفين</button>
              )}
              {employee?.role === 'sales_manager' && (
                <button onClick={() => router.push('/dashboard/team')} style={btnStyle}>👥 إدارة الفريق</button>
              )}
              <button onClick={() => router.push('/dashboard/reservations')} style={btnStyle}>📅 الحجوزات</button>
              <button onClick={() => router.push('/dashboard/sales')} style={btnStyle}>💰 التنفيذات</button>
            </div>
          </Card>
        </div>
      </div>
    </RequireAuth>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: '#2563eb',
  border: '1px solid #ddd',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  textAlign: 'right',
  color: 'white',
};
