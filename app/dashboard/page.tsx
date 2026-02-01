'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';

/* =====================
   Types
===================== */

type Role = 'admin' | 'sales' | 'sales_manager';

type Employee = {
  id: string;
  name: string;
  role: Role;
  email: string;
  projects?: string[];
};

type StatRow = {
  id: string;
  name: string;
  followUps: number;
  reservations: number;
  sales: number;
  totalActivity: number;
  projects: string[];
};

type DashboardStats = {
  totalClients: number;
  totalAvailableUnits: number;

  myFollowUps: number;
  myReservations: number;
  mySales: number;

  otherEmployeesStats: StatRow[];
  myTeamStats?: StatRow[];

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

/* =====================
   Helpers
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
      return '1970-01-01';
  }

  return now.toISOString();
}

function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.min((value / total) * 100, 100);
}

function getRoleLabel(role: Role): string {
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

// Concurrency limiter
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length) as any;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function shouldRetrySchemaError(msg?: string) {
  const m = (msg || '').toLowerCase();
  return (
    m.includes('column') ||
    m.includes('does not exist') ||
    m.includes('relationship') ||
    m.includes('schema cache') ||
    m.includes('not found')
  );
}

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

// sales_manager: فريقه = sales فقط داخل نفس المشاريع
async function getTeamEmployees(managerId: string): Promise<Employee[]> {
  const managerProjects = await getEmployeeProjects(managerId);
  if (managerProjects.length === 0) return [];

  const { data: employeeProjects, error } = await supabase
    .from('employee_projects')
    .select('employee_id')
    .in('project_id', managerProjects);

  if (error) {
    console.error('Error fetching team employees:', error);
    return [];
  }

  const employeeIds = [...new Set((employeeProjects || []).map((ep: any) => ep.employee_id))]
    .filter((id) => id !== managerId);

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

async function countUnitsByStatus(projectIds?: string[]) {
  const base = (status: 'available' | 'reserved' | 'sold') => {
    let q = supabase
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);

    if (projectIds && projectIds.length > 0) q = q.in('project_id', projectIds);
    return q;
  };

  const [{ count: available }, { count: reserved }, { count: sold }] = await Promise.all([
    base('available'),
    base('reserved'),
    base('sold')
  ]);

  return { available: available || 0, reserved: reserved || 0, sold: sold || 0 };
}

async function countClientsByStatus(projectIds?: string[]) {
  const base = (status: 'lead' | 'reserved' | 'converted' | 'visited') => {
    let q = supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);

    if (projectIds && projectIds.length > 0) q = q.in('project_id', projectIds);
    return q;
  };

  const [{ count: lead }, { count: reserved }, { count: converted }, { count: visited }] = await Promise.all([
    base('lead'),
    base('reserved'),
    base('converted'),
    base('visited')
  ]);

  return {
    lead: lead || 0,
    reserved: reserved || 0,
    converted: converted || 0,
    visited: visited || 0
  };
}

/**
 * Count للأنشطة + فلترة بالمشاريع
 * الهدف: أرقام sales و sales_manager تكون صحيحة (مقيدة بمشاريعهم)
 *
 * ملاحظة: بسبب اختلاف الـ schema عندك، بنحاول أكتر من استراتيجية:
 * - project_id مباشر
 * - join على units أو clients (لو فيه FK)
 */
async function countActivityWithProjects(params: {
  table: 'client_followups' | 'reservations' | 'sales';
  employeeField: string;
  employeeId: string;
  startDate: string;
  projectIds?: string[];
}): Promise<number> {
  const { table, employeeField, employeeId, startDate, projectIds } = params;

  if (!projectIds || projectIds.length === 0) {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(employeeField, employeeId)
      .gte('created_at', startDate);

    return count || 0;
  }

  const attempts: Array<() => any> = [];

  if (table === 'client_followups') {
    attempts.push(() =>
      supabase
        .from('client_followups')
        .select('id, clients!inner(project_id)', { count: 'exact', head: true })
        .eq(employeeField, employeeId)
        .gte('created_at', startDate)
        .in('clients.project_id', projectIds)
    );

    attempts.push(() =>
      supabase
        .from('client_followups')
        .select('id', { count: 'exact', head: true })
        .eq(employeeField, employeeId)
        .gte('created_at', startDate)
        .in('project_id', projectIds)
    );
  }

  if (table === 'reservations') {
    attempts.push(() =>
      supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq(employeeField, employeeId)
        .gte('created_at', startDate)
        .in('project_id', projectIds)
    );

    attempts.push(() =>
      supabase
        .from('reservations')
        .select('id, units!inner(project_id)', { count: 'exact', head: true })
        .eq(employeeField, employeeId)
        .gte('created_at', startDate)
        .in('units.project_id', projectIds)
    );

    attempts.push(() =>
      supabase
        .from('reservations')
        .select('id, clients!inner(project_id)', { count: 'exact', head: true })
        .eq(employeeField, employeeId)
        .gte('created_at', startDate)
        .in('clients.project_id', projectIds)
    );
  }

  if (table === 'sales') {
    attempts.push(() =>
      supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq(employeeField, employeeId)
        .gte('created_at', startDate)
        .in('project_id', projectIds)
    );

    attempts.push(() =>
      supabase
        .from('sales')
        .select('id, units!inner(project_id)', { count: 'exact', head: true })
        .eq(employeeField, employeeId)
        .gte('created_at', startDate)
        .in('units.project_id', projectIds)
    );
  }

  for (const makeQuery of attempts) {
    const { count, error } = await makeQuery();
    if (!error) return count || 0;

    // لو الخطأ مش schema، نطبع ونوقف
    if (!shouldRetrySchemaError(error.message)) {
      console.error(`[${table}] count error:`, error);
      return 0;
    }
  }

  return 0;
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

  const isProjectScoped = useMemo(
    () => employee?.role === 'sales' || employee?.role === 'sales_manager',
    [employee?.role]
  );

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

      // جلب الاسم + البريد + المشاريع
      const [empRow, empProjects] = await Promise.all([
        supabase.from('employees').select('name, email, role').eq('id', emp.id).single(),
        getEmployeeProjects(emp.id)
      ]);

      const employeeData: Employee = {
        id: emp.id,
        name: empRow.data?.name || 'موظف',
        email: empRow.data?.email || '',
        role: (empRow.data?.role as Role) || (emp.role as Role),
        projects: empProjects
      };

      setEmployee(employeeData);
      await loadDashboardStats(employeeData);
    } catch (err) {
      console.error('Error in init():', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboardStats(emp: Employee) {
    setLoading(true);

    try {
      const startDate = getStartDate(timeRange);

      let allowedProjectIds: string[] = [];
      let managerProjects: string[] = [];
      let teamEmployees: Employee[] = [];

      if (emp.role === 'sales' || emp.role === 'sales_manager') {
        allowedProjectIds = emp.projects || [];
      }

      if (emp.role === 'sales_manager') {
        managerProjects = allowedProjectIds;
        teamEmployees = await getTeamEmployees(emp.id);
      }

      if (isProjectScoped && allowedProjectIds.length === 0) {
        const zeros = { available: 0, reserved: 0, sold: 0 };
        setStats({
          totalClients: 0,
          totalAvailableUnits: 0,
          myFollowUps: 0,
          myReservations: 0,
          mySales: 0,
          otherEmployeesStats: [],
          myTeamStats: undefined,
          clientsByStatus: { lead: 0, reserved: 0, converted: 0, visited: 0 },
          unitsByStatus: zeros,
          avgFollowUpsPerEmployee: 0,
          avgReservationsPerEmployee: 0,
          avgSalesPerEmployee: 0,
          conversionRate: 0,
          reservationToSaleRate: 0,
          myProjectsUnits: zeros,
          managerProjects: emp.role === 'sales_manager' ? managerProjects : undefined
        });
        return;
      }

      const projectFilter = emp.role === 'admin' ? undefined : allowedProjectIds;

      // ===== كل العدادات الأساسية Parallel (ده أهم سبب للسرعة) =====
      const [unitsByStatus, clientsByStatus, myFollowUps, myReservations, mySales] = await Promise.all([
        countUnitsByStatus(projectFilter),
        countClientsByStatus(projectFilter),

        countActivityWithProjects({
          table: 'client_followups',
          employeeField: 'employee_id',
          employeeId: emp.id,
          startDate,
          projectIds: projectFilter
        }),
        countActivityWithProjects({
          table: 'reservations',
          employeeField: 'employee_id',
          employeeId: emp.id,
          startDate,
          projectIds: projectFilter
        }),
        countActivityWithProjects({
          table: 'sales',
          employeeField: 'sales_employee_id',
          employeeId: emp.id,
          startDate,
          projectIds: projectFilter
        })
      ]);

      // ===== إحصائيات الموظفين =====
      let otherEmployeesStats: StatRow[] = [];
      let myTeamStats: StatRow[] = [];

      if (emp.role === 'admin') {
        const { data: allEmployees, error } = await supabase
          .from('employees')
          .select('id, name, role')
          .neq('id', emp.id)
          .in('role', ['sales', 'sales_manager']);

        if (error) {
          console.error('Error fetching employees:', error);
        } else {
          const ids = (allEmployees || []).map((e: any) => e.id);

          // مشاريع الموظفين (Batch)
          const { data: allEmpProjects } = await supabase
            .from('employee_projects')
            .select('employee_id, project_id')
            .in('employee_id', ids);

          const projectsMap = new Map<string, string[]>();
          (allEmpProjects || []).forEach((row: any) => {
            const arr = projectsMap.get(row.employee_id) || [];
            arr.push(row.project_id);
            projectsMap.set(row.employee_id, arr);
          });

          otherEmployeesStats = await mapWithConcurrency(allEmployees || [], 8, async (e: any) => {
            const projects = projectsMap.get(e.id) || [];

            const [fu, rs, sl] = await Promise.all([
              countActivityWithProjects({
                table: 'client_followups',
                employeeField: 'employee_id',
                employeeId: e.id,
                startDate
              }),
              countActivityWithProjects({
                table: 'reservations',
                employeeField: 'employee_id',
                employeeId: e.id,
                startDate
              }),
              countActivityWithProjects({
                table: 'sales',
                employeeField: 'sales_employee_id',
                employeeId: e.id,
                startDate
              })
            ]);

            return {
              id: e.id,
              name: e.name || 'موظف',
              followUps: fu,
              reservations: rs,
              sales: sl,
              totalActivity: fu + rs + sl,
              projects
            };
          });
        }
      }

      if (emp.role === 'sales_manager') {
        // Projects map مرة واحدة
        const teamIds = teamEmployees.map((t) => t.id);
        const { data: teamProjectsData } = await supabase
          .from('employee_projects')
          .select('employee_id, project_id')
          .in('employee_id', teamIds);

        const teamProjectsMap = new Map<string, string[]>();
        (teamProjectsData || []).forEach((row: any) => {
          const arr = teamProjectsMap.get(row.employee_id) || [];
          arr.push(row.project_id);
          teamProjectsMap.set(row.employee_id, arr);
        });

        const computed = await mapWithConcurrency(teamEmployees, 8, async (m) => {
          const memberProjects = teamProjectsMap.get(m.id) || [];
          const shared = memberProjects.filter((p) => managerProjects.includes(p));
          if (shared.length === 0) return null;

          const [fu, rs, sl] = await Promise.all([
            countActivityWithProjects({
              table: 'client_followups',
              employeeField: 'employee_id',
              employeeId: m.id,
              startDate,
              projectIds: shared
            }),
            countActivityWithProjects({
              table: 'reservations',
              employeeField: 'employee_id',
              employeeId: m.id,
              startDate,
              projectIds: shared
            }),
            countActivityWithProjects({
              table: 'sales',
              employeeField: 'sales_employee_id',
              employeeId: m.id,
              startDate,
              projectIds: shared
            })
          ]);

          return {
            id: m.id,
            name: m.name || 'موظف',
            followUps: fu,
            reservations: rs,
            sales: sl,
            totalActivity: fu + rs + sl,
            projects: shared
          } as StatRow;
        });

        myTeamStats = computed.filter(Boolean) as StatRow[];
      }

      // ===== متوسطات + معدلات =====
      const totalClients = Object.values(clientsByStatus).reduce((a, b) => a + b, 0);

      let employeeCount = 1;
      let totalFollowUps = myFollowUps;
      let totalReservations = myReservations;
      let totalSales = mySales;

      if (emp.role === 'admin') {
        const { data: allSalesEmployees } = await supabase
          .from('employees')
          .select('id')
          .in('role', ['sales', 'sales_manager']);

        employeeCount = allSalesEmployees?.length || 1;

        totalFollowUps = otherEmployeesStats.reduce((sum, e) => sum + e.followUps, myFollowUps);
        totalReservations = otherEmployeesStats.reduce((sum, e) => sum + e.reservations, myReservations);
        totalSales = otherEmployeesStats.reduce((sum, e) => sum + e.sales, mySales);
      } else if (emp.role === 'sales_manager') {
        employeeCount = myTeamStats.length + 1;
        totalFollowUps = myFollowUps + myTeamStats.reduce((sum, e) => sum + e.followUps, 0);
        totalReservations = myReservations + myTeamStats.reduce((sum, e) => sum + e.reservations, 0);
        totalSales = mySales + myTeamStats.reduce((sum, e) => sum + e.sales, 0);
      }

      const conversionRate = totalClients && totalSales ? Math.round((totalSales / totalClients) * 100) : 0;
      const reservationToSaleRate =
        totalReservations && totalSales ? Math.round((totalSales / totalReservations) * 100) : 0;

      setStats({
        totalClients,
        totalAvailableUnits: unitsByStatus.available,

        myFollowUps,
        myReservations,
        mySales,

        otherEmployeesStats,
        myTeamStats: emp.role === 'sales_manager' && myTeamStats.length ? myTeamStats : undefined,

        clientsByStatus,
        unitsByStatus,

        avgFollowUpsPerEmployee: Math.round(totalFollowUps / employeeCount),
        avgReservationsPerEmployee: Math.round(totalReservations / employeeCount),
        avgSalesPerEmployee: Math.round(totalSales / employeeCount),

        conversionRate,
        reservationToSaleRate,

        myProjectsUnits: unitsByStatus,
        managerProjects: emp.role === 'sales_manager' ? managerProjects : undefined
      });
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
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
            gap: '10px'
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>لوحة التحكم</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>
              مرحباً {employee?.name} ({employee ? getRoleLabel(employee.role) : ''})
              {employee?.projects?.length ? (
                <span style={{ fontSize: '12px', color: '#0d8a3e', marginRight: '10px' }}>
                  • {employee.projects.length} مشروع
                </span>
              ) : null}
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

        {/* Quick Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
            marginBottom: '30px'
          }}
        >
          <div style={{ padding: '20px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #eaeaea' }}>
            <div style={{ color: '#666', fontSize: '14px' }}>إجمالي العملاء</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats?.totalClients.toLocaleString()}</div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              متابعة: {stats?.clientsByStatus.lead} • محجوز: {stats?.clientsByStatus.reserved} • تم البيع:{' '}
              {stats?.clientsByStatus.converted}
            </div>
          </div>

          <div style={{ padding: '20px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #eaeaea' }}>
            <div style={{ color: '#666', fontSize: '14px' }}>
              الوحدات المتاحة {employee?.role === 'admin' ? '(كل المشاريع)' : '(مشاريعك)'}
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats?.totalAvailableUnits.toLocaleString()}</div>
          </div>

          <div style={{ padding: '20px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #eaeaea' }}>
            <div style={{ color: '#666', fontSize: '14px' }}>نشاطي</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>
              {stats?.myFollowUps} / {stats?.myReservations} / {stats?.mySales}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>متابعات / حجوزات / تنفيذات</div>
          </div>

          <div style={{ padding: '20px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #eaeaea' }}>
            <div style={{ color: '#666', fontSize: '14px' }}>معدل التحويل</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats?.conversionRate}%</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
              {stats?.reservationToSaleRate}% من الحجوزات تتحول لبيع
            </div>
          </div>
        </div>

        {/* Units breakdown */}
        <Card title="توزيع الوحدات">
          <div style={{ padding: '15px' }}>
            {(() => {
              const total =
                (stats?.unitsByStatus.available || 0) + (stats?.unitsByStatus.reserved || 0) + (stats?.unitsByStatus.sold || 0);

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ width: 90 }}>متاحة:</span>
                    <strong style={{ width: 60 }}>{stats?.unitsByStatus.available}</strong>
                    <div style={{ flex: 1, marginRight: 10, background: '#eee', height: 8, borderRadius: 4 }}>
                      <div
                        style={{
                          width: `${calculatePercentage(stats?.unitsByStatus.available || 0, total)}%`,
                          height: 8,
                          borderRadius: 4,
                          background: '#0d8a3e'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ width: 90 }}>محجوزة:</span>
                    <strong style={{ width: 60 }}>{stats?.unitsByStatus.reserved}</strong>
                    <div style={{ flex: 1, marginRight: 10, background: '#eee', height: 8, borderRadius: 4 }}>
                      <div
                        style={{
                          width: `${calculatePercentage(stats?.unitsByStatus.reserved || 0, total)}%`,
                          height: 8,
                          borderRadius: 4,
                          background: '#fbbc04'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: 90 }}>مباعة:</span>
                    <strong style={{ width: 60 }}>{stats?.unitsByStatus.sold}</strong>
                    <div style={{ flex: 1, marginRight: 10, background: '#eee', height: 8, borderRadius: 4 }}>
                      <div
                        style={{
                          width: `${calculatePercentage(stats?.unitsByStatus.sold || 0, total)}%`,
                          height: 8,
                          borderRadius: 4,
                          background: '#34a853'
                        }}
                      />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </Card>

        {/* Team / Other employees */}
        {employee?.role === 'sales_manager' && stats?.myTeamStats?.length ? (
          <div style={{ marginTop: 20 }}>
            <Card title="أداء فريقك">
              <div style={{ padding: 15, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ textAlign: 'right', borderBottom: '1px solid #eee' }}>
                      <th style={{ padding: 8 }}>الموظف</th>
                      <th style={{ padding: 8 }}>متابعات</th>
                      <th style={{ padding: 8 }}>حجوزات</th>
                      <th style={{ padding: 8 }}>تنفيذات</th>
                      <th style={{ padding: 8 }}>الإجمالي</th>
                      <th style={{ padding: 8 }}>المشاريع المشتركة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.myTeamStats.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                        <td style={{ padding: 8 }}>{r.name}</td>
                        <td style={{ padding: 8 }}>{r.followUps}</td>
                        <td style={{ padding: 8 }}>{r.reservations}</td>
                        <td style={{ padding: 8 }}>{r.sales}</td>
                        <td style={{ padding: 8, fontWeight: 700 }}>{r.totalActivity}</td>
                        <td style={{ padding: 8, color: '#666', fontSize: 12 }}>{r.projects.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : null}

        {employee?.role === 'admin' && stats?.otherEmployeesStats?.length ? (
          <div style={{ marginTop: 20 }}>
            <Card title="أداء الموظفين">
              <div style={{ padding: 15, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr style={{ textAlign: 'right', borderBottom: '1px solid #eee' }}>
                      <th style={{ padding: 8 }}>الموظف</th>
                      <th style={{ padding: 8 }}>متابعات</th>
                      <th style={{ padding: 8 }}>حجوزات</th>
                      <th style={{ padding: 8 }}>تنفيذات</th>
                      <th style={{ padding: 8 }}>الإجمالي</th>
                      <th style={{ padding: 8 }}>عدد المشاريع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.otherEmployeesStats.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                        <td style={{ padding: 8 }}>{r.name}</td>
                        <td style={{ padding: 8 }}>{r.followUps}</td>
                        <td style={{ padding: 8 }}>{r.reservations}</td>
                        <td style={{ padding: 8 }}>{r.sales}</td>
                        <td style={{ padding: 8, fontWeight: 700 }}>{r.totalActivity}</td>
                        <td style={{ padding: 8, color: '#666', fontSize: 12 }}>{r.projects.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </RequireAuth>
  );
}