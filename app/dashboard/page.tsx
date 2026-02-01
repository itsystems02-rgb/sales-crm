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
  // إحصائيات عامة
  totalClients: number;
  totalAvailableUnits: number;

  // إحصائيات الموظف الحالي
  myFollowUps: number;
  myReservations: number;
  mySales: number;

  // إحصائيات الموظفين الآخرين
  otherEmployeesStats: Array<{
    id: string;
    name: string;
    followUps: number;
    reservations: number;
    sales: number;
    totalActivity: number;
    projects: string[];
  }>;

  // إحصائيات الفريق (لـ sales_manager فقط)
  myTeamStats?: Array<{
    id: string;
    name: string;
    followUps: number;
    reservations: number;
    sales: number;
    totalActivity: number;
    projects: string[];
  }>;

  // إحصائيات إضافية
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

  // متوسط النشاط
  avgFollowUpsPerEmployee: number;
  avgReservationsPerEmployee: number;
  avgSalesPerEmployee: number;

  // معدل التحويل
  conversionRate: number;
  reservationToSaleRate: number;

  // إحصائيات إضافية
  myProjectsUnits: {
    available: number;
    reserved: number;
    sold: number;
  };

  // المشاريع الخاصة بالـ sales_manager
  managerProjects?: string[];
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

  // دالة: جلب المشاريع المرتبطة بالموظف
  async function getEmployeeProjects(employeeId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('employee_projects')
      .select('project_id')
      .eq('employee_id', employeeId);

    if (error) {
      console.error('Error fetching employee projects:', error);
      return [];
    }

    return data?.map((p: any) => p.project_id) || [];
  }

  // Team employees for sales_manager (sales فقط داخل مشاريع المدير)
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

    const employeeIds = [...new Set(employeeProjects?.map((ep: any) => ep.employee_id) || [])].filter(
      (id) => id !== managerId
    );
    if (employeeIds.length === 0) return [];

    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, name, email, role')
      .in('id', employeeIds)
      .eq('role', 'sales'); // ✅ فريق المدير = sales فقط

    if (empError) {
      console.error('Error fetching employees data:', empError);
      return [];
    }

    return (employees || []) as Employee[];
  }

  /* =====================
     FAST COUNTS (RPC)
     - Followups/Reservations: employee-only (زي منطق القديم اللي كان بيرجع fallback)
     - Sales: scoped بالمشاريع (project_id في sales) ✅
  ===================== */

  async function rpcFollowupsReservationsBulk(employeeIds: string[], startDate: string) {
    if (!employeeIds.length) return [] as Array<{ employee_id: string; followups: any; reservations: any }>;

    const { data, error } = await supabase.rpc('get_followups_reservations_bulk', {
      p_employee_ids: employeeIds,
      p_start_date: startDate,
    });

    if (error) {
      console.error('RPC get_followups_reservations_bulk error:', error);
      return [] as Array<{ employee_id: string; followups: any; reservations: any }>;
    }

    return (data || []) as Array<{ employee_id: string; followups: any; reservations: any }>;
  }

  async function rpcSalesSingle(employeeId: string, startDate: string, projectIds?: string[]) {
    const { data, error } = await supabase.rpc('get_sales_count_single', {
      p_employee_id: employeeId,
      p_start_date: startDate,
      p_project_ids: projectIds && projectIds.length ? projectIds : null,
    });

    if (error) {
      console.error('RPC get_sales_count_single error:', error);
      return 0;
    }

    return toNum(data);
  }

  // Units counts by status (fast, no pagination)
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

  // Clients by status (scoped by interested_in_project_id)
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

  // Total clients count
  async function getTotalClientsCount(projectIds?: string[]) {
    let q: any = supabase.from('clients').select('id', { count: 'exact', head: true });
    if (projectIds && projectIds.length > 0) q = q.in('interested_in_project_id', projectIds);
    const { count, error } = await q;
    if (error) console.error('Error fetching total clients count:', error);
    return count || 0;
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

      // 1. الحصول على بيانات الموظف الحالي
      const emp = await getCurrentEmployee();
      if (!emp) {
        setLoading(false);
        return;
      }

      // 2. الحصول على اسم الموظف والمشاريع المرتبطة
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

      // 3. تحميل الإحصائيات
      await loadDashboardStats(employeeData);
    } catch (err) {
      console.error('Error in init():', err);
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     Load Dashboard Stats
  ===================== */
  async function loadDashboardStats(emp: Employee) {
    setLoading(true);

    // ✅ كاش لتسريع عرض الداش فوراً ثم تحديث الأرقام
    const cacheKey = `dash:${emp.id}:${timeRange}`;
    const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    if (cached) {
      try {
        setStats(JSON.parse(cached));
      } catch {}
    }

    try {
      const startDate = getStartDate(timeRange);

      // ===== تحديد المشاريع المسموحة حسب الدور =====
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

      // ===== حالة الموظفين بدون مشاريع =====
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

      // ===== scope للمشاريع حسب الدور =====
      const scopeProjectIds = emp.role === 'admin' ? undefined : allowedProjectIds;

      // ===== تحميل counts الأساسية (FAST) =====
      const [unitsCounts, clientsByStatus, totalClientsCount] = await Promise.all([
        getUnitsByStatus(scopeProjectIds),
        getClientsByStatus(scopeProjectIds),
        getTotalClientsCount(scopeProjectIds),
      ]);

      // ===== نشاطي الشخصي =====
      // followups + reservations = employee-only
      const myFRRows = await rpcFollowupsReservationsBulk([emp.id], startDate);
      const myFR = myFRRows?.[0] || { followups: 0, reservations: 0 };

      const myFollowUps = toNum(myFR.followups);
      const myReservations = toNum(myFR.reservations);

      // sales = scoped بالمشاريع (admin: كل المشاريع)
      const mySales = await rpcSalesSingle(emp.id, startDate, scopeProjectIds);

      const unitsByStatus = {
        available: unitsCounts.available,
        reserved: unitsCounts.reserved,
        sold: unitsCounts.sold,
      };

      // ===== إحصائيات الموظفين الآخرين / الفريق =====
      let otherEmployeesStats: any[] = [];
      let myTeamStats: any[] = [];

      if (emp.role === 'admin') {
        // الأدمن يرى كل الموظفين
        const { data: allEmployees, error: empErr } = await supabase
          .from('employees')
          .select('id, name, role')
          .neq('id', emp.id)
          .in('role', ['sales', 'sales_manager']);

        if (empErr) console.error(empErr);

        const employeesList = (allEmployees || []) as Array<{ id: string; name: string; role: string }>;
        const ids = employeesList.map((e) => e.id);

        // Batch fetch employee projects map
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

        // ✅ followups/reservations BULK مرة واحدة (employee-only)
        const frRows = await rpcFollowupsReservationsBulk(ids, startDate);
        const frMap: Record<string, { fu: number; rs: number }> = {};
        for (const r of frRows) {
          frMap[r.employee_id] = { fu: toNum(r.followups), rs: toNum(r.reservations) };
        }

        // ✅ sales: لكل موظف (admin = كل المشاريع)
        const salesResults = await asyncPool(8, employeesList, async (otherEmp) => {
          const sl = await rpcSalesSingle(otherEmp.id, startDate, undefined);
          return { id: otherEmp.id, sales: sl };
        });
        const salesMap: Record<string, number> = {};
        for (const s of salesResults) salesMap[s.id] = s.sales;

        otherEmployeesStats = employeesList.map((e) => {
          const fu = frMap[e.id]?.fu || 0;
          const rs = frMap[e.id]?.rs || 0;
          const sl = salesMap[e.id] || 0;

          return {
            id: e.id,
            name: e.name || 'موظف',
            followUps: fu,
            reservations: rs,
            sales: sl,
            totalActivity: fu + rs + sl,
            projects: projectsMap[e.id] || [],
          };
        });
      } else if (emp.role === 'sales_manager') {
        // sales_manager يرى فريقه (sales فقط) + sales scoped بالمشاريع المشتركة
        const teamIds = teamEmployees.map((t) => t.id);

        // Batch fetch projects for team members once
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

        // ✅ followups/reservations BULK مرة واحدة (employee-only) — زي القديم
        const frRows = await rpcFollowupsReservationsBulk(teamIds, startDate);
        const frMap: Record<string, { fu: number; rs: number }> = {};
        for (const r of frRows) {
          frMap[r.employee_id] = { fu: toNum(r.followups), rs: toNum(r.reservations) };
        }

        // ✅ sales لكل عضو scoped بالمشاريع المشتركة
        const results = await asyncPool(8, teamEmployees, async (teamMember) => {
          const teamMemberProjects = teamProjectsMap[teamMember.id] || [];
          const sharedProjects = teamMemberProjects.filter((pid) => managerProjects.includes(pid));
          if (sharedProjects.length === 0) return null;

          const fu = frMap[teamMember.id]?.fu || 0;
          const rs = frMap[teamMember.id]?.rs || 0;
          const sl = await rpcSalesSingle(teamMember.id, startDate, sharedProjects);

          return {
            id: teamMember.id,
            name: teamMember.name || 'موظف',
            followUps: fu,
            reservations: rs,
            sales: sl,
            totalActivity: fu + rs + sl,
            projects: sharedProjects,
          };
        });

        myTeamStats = results.filter(Boolean);
      }

      // ===== حساب المتوسطات =====
      let employeeCount = 1;
      let totalFollowUps = myFollowUps || 0;
      let totalReservations = myReservations || 0;
      let totalSales = mySales || 0;

      if (emp.role === 'admin') {
        const { data: allSalesEmployees } = await supabase.from('employees').select('id').in('role', [
          'sales',
          'sales_manager',
        ]);
        employeeCount = allSalesEmployees?.length || 1;

        totalFollowUps = otherEmployeesStats.reduce((sum, e) => sum + e.followUps, myFollowUps || 0);
        totalReservations = otherEmployeesStats.reduce((sum, e) => sum + e.reservations, myReservations || 0);
        totalSales = otherEmployeesStats.reduce((sum, e) => sum + e.sales, mySales || 0);
      } else if (emp.role === 'sales_manager') {
        employeeCount = (myTeamStats?.length || 0) + 1;

        const teamFollowUps = (myTeamStats || []).reduce((sum: number, e: any) => sum + e.followUps, 0);
        const teamReservations = (myTeamStats || []).reduce((sum: number, e: any) => sum + e.reservations, 0);
        const teamSales = (myTeamStats || []).reduce((sum: number, e: any) => sum + e.sales, 0);

        totalFollowUps = (myFollowUps || 0) + teamFollowUps;
        totalReservations = (myReservations || 0) + teamReservations;
        totalSales = (mySales || 0) + teamSales;
      }

      // ===== حساب معدلات التحويل =====
      const totalClients = totalClientsCount || 0;

      const conversionRate = totalClients && totalSales ? Math.round((totalSales / totalClients) * 100) : 0;

      const reservationToSaleRate =
        totalReservations && totalSales ? Math.round((totalSales / totalReservations) * 100) : 0;

      // ===== تجميع كل الإحصائيات =====
      const dashboardStats: DashboardStats = {
        totalClients,
        totalAvailableUnits: unitsCounts.totalAvailable,

        myFollowUps: myFollowUps || 0,
        myReservations: myReservations || 0,
        mySales: mySales || 0,

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
     Helper: Get Role Label
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
            <div style={{ marginTop: '15px' }}>
              <div style={{ height: '6px', backgroundColor: '#eee', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min((stats?.myFollowUps || 0) * 5, 100)}%`,
                    height: '100%',
                    backgroundColor: '#1a73e8',
                  }}
                />
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
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ea4335' }}>
                  {stats?.conversionRate || 0}%
                </div>
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
            <div style={{ marginTop: '15px', fontSize: '12px' }}>
              {stats?.reservationToSaleRate || 0}% من الحجوزات تتحول لبيع
            </div>
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
                      <div style={{ width: '12px', height: '12px', backgroundColor: '#0d8a3e', borderRadius: '50%', marginRight: '8px' }} />
                      <span>متاحة: {stats?.unitsByStatus.available || 0}</span>
                      <div style={{ flex: 1, marginLeft: '10px' }}>
                        <div
                          style={{
                            width: `${calculatePercentage(stats?.unitsByStatus.available || 0, total)}%`,
                            height: '8px',
                            backgroundColor: '#0d8a3e',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                      <div style={{ width: '12px', height: '12px', backgroundColor: '#fbbc04', borderRadius: '50%', marginRight: '8px' }} />
                      <span>محجوزة: {stats?.unitsByStatus.reserved || 0}</span>
                      <div style={{ flex: 1, marginLeft: '10px' }}>
                        <div
                          style={{
                            width: `${calculatePercentage(stats?.unitsByStatus.reserved || 0, total)}%`,
                            height: '8px',
                            backgroundColor: '#fbbc04',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: '12px', height: '12px', backgroundColor: '#34a853', borderRadius: '50%', marginRight: '8px' }} />
                      <span>مباعة: {stats?.unitsByStatus.sold || 0}</span>
                      <div style={{ flex: 1, marginLeft: '10px' }}>
                        <div
                          style={{
                            width: `${calculatePercentage(stats?.unitsByStatus.sold || 0, total)}%`,
                            height: '8px',
                            backgroundColor: '#34a853',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '15px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                      إجمالي الوحدات: {total.toLocaleString()}
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>

          {/* أداء الفريق (لـ sales_manager) أو أداء الموظفين (لـ admin) */}
          {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
            <Card title={employee?.role === 'admin' ? 'أداء فريق المبيعات' : 'أداء فريقك'}>
              <div style={{ padding: '15px' }}>
                {employee?.role === 'sales_manager' && (!stats?.myTeamStats || stats.myTeamStats.length === 0) ? (
                  <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                    لا يوجد موظفين في فريقك حالياً
                    <div style={{ marginTop: '10px', fontSize: '12px' }}>قم بإضافة موظفين إلى المشاريع الخاصة بك</div>
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

        {/* إحصائيات سريعة إضافية */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {/* مقارنة الأداء */}
          <Card title="مقارنة الأداء">
            <div style={{ padding: '15px' }}>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px' }}>متابعات</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    أنت: {stats?.myFollowUps || 0} | المتوسط: {stats?.avgFollowUpsPerEmployee || 0}
                  </span>
                </div>
                <div style={{ display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${calculatePercentage(
                        stats?.myFollowUps || 0,
                        Math.max(stats?.myFollowUps || 0, stats?.avgFollowUpsPerEmployee || 1)
                      )}%`,
                      backgroundColor: '#1a73e8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '10px',
                    }}
                  >
                    {stats?.myFollowUps || 0}
                  </div>
                  <div
                    style={{
                      width: `${calculatePercentage(
                        stats?.avgFollowUpsPerEmployee || 0,
                        Math.max(stats?.myFollowUps || 0, stats?.avgFollowUpsPerEmployee || 1)
                      )}%`,
                      backgroundColor: '#c2e0ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#1a73e8',
                      fontSize: '10px',
                    }}
                  >
                    {stats?.avgFollowUpsPerEmployee || 0}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px' }}>حجوزات</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    أنت: {stats?.myReservations || 0} | المتوسط: {stats?.avgReservationsPerEmployee || 0}
                  </span>
                </div>
                <div style={{ display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${calculatePercentage(
                        stats?.myReservations || 0,
                        Math.max(stats?.myReservations || 0, stats?.avgReservationsPerEmployee || 1)
                      )}%`,
                      backgroundColor: '#fbbc04',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '10px',
                    }}
                  >
                    {stats?.myReservations || 0}
                  </div>
                  <div
                    style={{
                      width: `${calculatePercentage(
                        stats?.avgReservationsPerEmployee || 0,
                        Math.max(stats?.myReservations || 0, stats?.avgReservationsPerEmployee || 1)
                      )}%`,
                      backgroundColor: '#ffeaa7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fbbc04',
                      fontSize: '10px',
                    }}
                  >
                    {stats?.avgReservationsPerEmployee || 0}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px' }}>تنفيذات</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    أنت: {stats?.mySales || 0} | المتوسط: {stats?.avgSalesPerEmployee || 0}
                  </span>
                </div>
                <div style={{ display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${calculatePercentage(
                        stats?.mySales || 0,
                        Math.max(stats?.mySales || 0, stats?.avgSalesPerEmployee || 1)
                      )}%`,
                      backgroundColor: '#34a853',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '10px',
                    }}
                  >
                    {stats?.mySales || 0}
                  </div>
                  <div
                    style={{
                      width: `${calculatePercentage(
                        stats?.avgSalesPerEmployee || 0,
                        Math.max(stats?.mySales || 0, stats?.avgSalesPerEmployee || 1)
                      )}%`,
                      backgroundColor: '#a8e6a8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#34a853',
                      fontSize: '10px',
                    }}
                  >
                    {stats?.avgSalesPerEmployee || 0}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
                <div>🔵 أنت | ⚪ المتوسط {employee?.role === 'sales_manager' ? 'فريقك' : 'بين المندوبين'}</div>
              </div>
            </div>
          </Card>

          {/* أزرار سريعة */}
          <Card title="إجراءات سريعة">
            <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {renderQuickButton('👥', 'إدارة العملاء', () => router.push('/dashboard/clients'))}
              {renderQuickButton('🏠', 'إدارة الوحدات', () => router.push('/dashboard/units'))}
              {renderQuickButton('📋', 'إدارة المشاريع', () => router.push('/dashboard/projects'))}

              {employee?.role === 'admin' &&
                renderQuickButton('👨‍💼', 'إدارة الموظفين', () => router.push('/dashboard/employees'))}

              {employee?.role === 'sales_manager' &&
                renderQuickButton('👥', 'إدارة الفريق', () => router.push('/dashboard/team'))}

              {renderQuickButton('📅', 'الحجوزات', () => router.push('/dashboard/reservations'))}
              {renderQuickButton('💰', 'التنفيذات', () => router.push('/dashboard/sales'))}
            </div>
          </Card>
        </div>

        {/* ملخص أداء */}
        <Card title="ملخص الأداء">
          <div style={{ padding: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor:
                    employee?.role === 'admin'
                      ? '#e6f4ea'
                      : employee?.role === 'sales_manager'
                      ? '#e0e7ff'
                      : '#e8f0fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '15px',
                }}
              >
                <span style={{ fontSize: '20px' }}>
                  {employee?.role === 'admin' ? '👨‍💼' : employee?.role === 'sales_manager' ? '👔' : '👤'}
                </span>
              </div>
              <div>
                <div style={{ fontWeight: 'bold' }}>{employee?.name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {getRoleLabel(employee?.role || '')} | {employee?.email}
                  {employee?.projects && employee.projects.length > 0 && (
                    <span style={{ marginRight: '10px', color: '#0d8a3e' }}>• {employee.projects.length} مشروع</span>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px',
                marginTop: '15px',
              }}
            >
              <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #1a73e8' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>كفاءة المتابعة</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {stats?.myFollowUps && stats.myFollowUps > 0 && stats.myReservations
                    ? Math.round((stats.myReservations / stats.myFollowUps) * 100)
                    : 0}
                  %
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>من المتابعات تتحول لحجوزات</div>
              </div>

              <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #fbbc04' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>معدل الإنجاز</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {stats?.myReservations && stats.myReservations > 0 && stats.mySales
                    ? Math.round((stats.mySales / stats.myReservations) * 100)
                    : 0}
                  %
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>من الحجوزات تتحول لتنفيذات</div>
              </div>

              <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #34a853' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>قيمة التنفيذات</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{stats?.mySales || 0}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>وحدات تم بيعها</div>
              </div>
            </div>

            {employee?.role === 'sales_manager' && stats?.myTeamStats && stats.myTeamStats.length > 0 && (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#0c4a6e' }}>
                  أداء فريقك ({stats.myTeamStats.length} عضو)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <div>إجمالي المتابعات: {stats.myTeamStats.reduce((sum, e) => sum + e.followUps, 0)}</div>
                  <div>إجمالي الحجوزات: {stats.myTeamStats.reduce((sum, e) => sum + e.reservations, 0)}</div>
                  <div>إجمالي التنفيذات: {stats.myTeamStats.reduce((sum, e) => sum + e.sales, 0)}</div>
                </div>
              </div>
            )}

            <div style={{ marginTop: '20px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
              آخر تحديث: {new Date().toLocaleString('ar-SA')} | الفترة:{' '}
              {timeRange === 'today' ? 'اليوم' : timeRange === 'week' ? 'آخر أسبوع' : timeRange === 'month' ? 'آخر شهر' : 'الكل'}
            </div>
          </div>
        </Card>
      </div>
    </RequireAuth>
  );
}

/* =====================
   UI Helper: quick buttons
===================== */

function renderQuickButton(icon: string, text: string, onClick: () => void) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px',
        backgroundColor: '#2563eb',
        border: '1px solid #ddd',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.2s',
        textAlign: 'right',
        color: 'white',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1d4ed8')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
    >
      <span style={{ marginRight: '10px', fontSize: '18px' }}>{icon}</span> {text}
    </button>
  );
}
