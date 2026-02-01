'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';

/* =====================
   Types (Based on your Schema)
===================== */

type Employee = {
  id: string;
  name: string;
  role: 'admin' | 'sales' | 'sales_manager';
};

type Project = {
  id: string;
  name: string;
  code: string;
  location?: string | null;
};

type UnitRow = {
  id: string;
  project_id: string;
  status: string;
  unit_type: string | null;
  supported_price: number;
};

type ClientRow = {
  id: string;
  status: string;
  source: string | null;
  eligible: boolean | null;
  nationality: string | null;
  created_at: string | null;
  interested_in_project_id: string | null;
};

type SaleRow = {
  id: string;
  client_id: string;
  unit_id: string;
  project_id: string;
  sales_employee_id: string;
  sale_date: string; // date
  price_before_tax: number;
  created_at: string | null;
};

type ReservationRow = {
  id: string;
  client_id: string;
  unit_id: string;
  employee_id: string;
  reservation_date: string; // date
  status: string;
  created_at: string | null;
};

type FollowUpRow = {
  id: string;
  client_id: string;
  employee_id: string;
  type: string;
  created_at: string | null;
};

type ReportStats = {
  // إحصائيات عامة
  totalProjects: number;
  totalUnits: number;
  totalClients: number;
  totalEmployees: number;

  // إحصائيات المبيعات
  totalSales: number;
  totalSalesAmount: number;
  avgSalePrice: number;
  maxSalePrice: number;
  minSalePrice: number;

  // إحصائيات المشاريع
  projectsByUnits: Array<{
    projectId: string;
    projectName: string;
    projectCode: string;
    totalUnits: number;
    availableUnits: number;
    reservedUnits: number;
    soldUnits: number;
    salesAmount: number;
  }>;

  // إحصائيات الموظفين
  employeesPerformance: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    totalClients: number;
    totalFollowUps: number;
    totalReservations: number;
    totalSales: number;
    salesAmount: number;
    conversionRate: number;
    avgResponseTime: number | null; // hours
  }>;

  // إحصائيات العملاء
  clientsStats: {
    totalClients: number;
    byStatus: { lead: number; reserved: number; converted: number; visited: number };
    byNationality: { saudi: number; non_saudi: number };
    byEligibility: { eligible: number; notEligible: number };
    topSources: Array<{ source: string; count: number }>;
  };

  // إحصائيات الوحدات
  unitsStats: {
    totalUnits: number;
    byType: { villa: number; duplex: number; apartment: number };
    byStatus: { available: number; reserved: number; sold: number };
    byProject: Array<{ projectName: string; count: number }>;
    priceRange: { min: number; max: number; avg: number };
  };

  // إحصائيات الحجوزات
  reservationsStats: {
    totalReservations: number;
    active: number;
    converted: number;
    cancelled: number;
    byMonth: Array<{ month: string; count: number }>;
    avgReservationToSaleDays: number;
  };

  // إحصائيات المتابعات
  followUpsStats: {
    totalFollowUps: number;
    byType: { call: number; whatsapp: number; visit: number };
    byEmployee: Array<{ employeeName: string; count: number }>;
    avgFollowUpsPerClient: number;
    successRate: number;
  };

  // إحصائيات زمنية
  timeBasedStats: {
    dailyAvgSales: number;
    weeklyAvgSales: number;
    monthlyAvgSales: number;
    peakHours: Array<{ hour: number; activity: number }>;
    busiestDays: Array<{ day: string; activity: number }>;
  };

  // KPIs رئيسية (المتاح منها فقط من الداتا)
  kpis: {
    clientAcquisitionCost: number; // غير متاح من الداتا -> 0
    employeeProductivity: number; // نشاط/موظف
    inventoryTurnover: number; // sold/total (كنسبة)
    revenuePerEmployee: number;
    customerRetentionRate: number; // converted clients %
    salesGrowthRate: number; // مقارنة مع الفترة السابقة
  };
};

/* =====================
   Utils
===================== */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toStartISO(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function toEndISO(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function daysBetween(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  const diff = db.getTime() - da.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function formatMonthArabic(year: number, monthIndex0: number) {
  // monthIndex0: 0..11
  return new Date(year, monthIndex0, 1).toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });
}

function roleLabel(role: Employee['role']) {
  if (role === 'admin') return 'مدير';
  if (role === 'sales_manager') return 'مدير مبيعات';
  return 'مندوب مبيعات';
}

/* =====================
   Page
===================== */

export default function ReportsPage() {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState<ReportStats | null>(null);

  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);

  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [reportType, setReportType] = useState<'comprehensive' | 'sales' | 'clients' | 'units' | 'employees'>(
    'comprehensive'
  );

  const [exporting, setExporting] = useState(false);

  /* =====================
     Pagination Fetch Helper
  ===================== */

  async function fetchAllRows<T>({
    table,
    select,
    pageSize = 1000,
    applyFilters,
    orderBy,
  }: {
    table: string;
    select: string;
    pageSize?: number;
    applyFilters?: (q: any) => any;
    orderBy?: { col: string; ascending?: boolean };
  }): Promise<T[]> {
    let all: T[] = [];
    let from = 0;

    while (true) {
      let q = supabase.from(table).select(select).range(from, from + pageSize - 1);

      if (applyFilters) q = applyFilters(q);
      if (orderBy) q = q.order(orderBy.col, { ascending: orderBy.ascending ?? true });

      const { data, error, status } = await q;

      // basic retry for rate-limit
      if (status === 429) {
        await sleep(400);
        continue;
      }

      if (error) {
        console.error(`Error fetching ${table}:`, error);
        break;
      }

      const batch = (data || []) as T[];
      all = all.concat(batch);

      if (batch.length < pageSize) break;
      from += pageSize;
    }

    return all;
  }

  /* =====================
     INIT
  ===================== */

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      const emp = await getCurrentEmployee();

      if (!emp) {
        router.push('/login');
        return;
      }

      if (emp.role !== 'admin') {
        alert('غير مصرح لك بالوصول إلى صفحة التقارير');
        router.push('/dashboard');
        return;
      }

      setEmployee(emp);

      // load filters lists fast
      const [projects, emps] = await Promise.all([loadProjects(), loadEmployees()]);
      setProjectsList(projects);
      setEmployeesList(emps);

      // default last 30 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      setDateRange({ startDate: startStr, endDate: endStr });

      // generate first time باستخدام emp مباشرة (حل مشكلة state async)
      await generateReport({
        emp,
        startDate: startStr,
        endDate: endStr,
        projectId: '',
        employeeId: '',
        type: 'comprehensive',
        projects,
        emps,
      });

      setLoading(false);
    } catch (err) {
      console.error('Error in init():', err);
      setLoading(false);
    }
  }

  async function loadProjects(): Promise<Project[]> {
    const { data, error } = await supabase.from('projects').select('id,name,code,location').order('created_at', {
      ascending: false,
    });
    if (error) {
      console.error('Error loading projects:', error);
      return [];
    }
    return (data || []) as Project[];
  }

  async function loadEmployees(): Promise<Employee[]> {
    const { data, error } = await supabase.from('employees').select('id,name,role').order('created_at', {
      ascending: false,
    });
    if (error) {
      console.error('Error loading employees:', error);
      return [];
    }
    return (data || []) as Employee[];
  }

  /* =====================
     Generate Report (Accurate + Fast)
  ===================== */

  async function generateReport(params?: {
    emp?: Employee;
    startDate?: string;
    endDate?: string;
    projectId?: string;
    employeeId?: string;
    type?: typeof reportType;
    projects?: Project[];
    emps?: Employee[];
  }) {
    const emp = params?.emp ?? employee;
    if (!emp) return;

    const startDate = params?.startDate ?? dateRange.startDate;
    const endDate = params?.endDate ?? dateRange.endDate;

    const projectId = params?.projectId ?? selectedProject;
    const employeeId = params?.employeeId ?? selectedEmployee;
    const type = params?.type ?? reportType;

    const projects = params?.projects ?? projectsList;
    const emps = params?.emps ?? employeesList;

    if (!startDate || !endDate) {
      alert('من فضلك اختر فترة زمنية صحيحة');
      return;
    }

    setGeneratingReport(true);

    try {
      const startISO = toStartISO(startDate);
      const endISO = toEndISO(endDate);

      // لتسريع: نحمّل بس اللي محتاجينه حسب نوع التقرير
      const needUnits = type === 'comprehensive' || type === 'units' || type === 'sales' || type === 'employees';
      const needClients = type === 'comprehensive' || type === 'clients' || type === 'employees';
      const needSales = type === 'comprehensive' || type === 'sales' || type === 'employees';
      const needReservations = type === 'comprehensive' || type === 'employees';
      const needFollowUps = type === 'comprehensive' || type === 'employees';

      // ===== 1) Units =====
      const unitsPromise = needUnits
        ? fetchAllRows<UnitRow>({
            table: 'units',
            select: 'id,project_id,status,unit_type,supported_price',
            applyFilters: (q) => (projectId ? q.eq('project_id', projectId) : q),
          })
        : Promise.resolve([] as UnitRow[]);

      // ===== 2) Clients =====
      const clientsPromise = needClients
        ? fetchAllRows<ClientRow>({
            table: 'clients',
            select: 'id,status,source,eligible,nationality,created_at,interested_in_project_id',
            applyFilters: (q) => (projectId ? q.eq('interested_in_project_id', projectId) : q),
          })
        : Promise.resolve([] as ClientRow[]);

      // ===== 3) Sales =====
      const salesPromise = needSales
        ? fetchAllRows<SaleRow>({
            table: 'sales',
            select: 'id,client_id,unit_id,project_id,sales_employee_id,sale_date,price_before_tax,created_at',
            applyFilters: (q) => {
              let qq = q.gte('sale_date', startDate).lte('sale_date', endDate);
              if (projectId) qq = qq.eq('project_id', projectId);
              if (employeeId) qq = qq.eq('sales_employee_id', employeeId);
              return qq;
            },
            orderBy: { col: 'sale_date', ascending: true },
          })
        : Promise.resolve([] as SaleRow[]);

      // ===== 4) Reservations =====
      const reservationsPromise = needReservations
        ? fetchAllRows<ReservationRow>({
            table: 'reservations',
            select: 'id,client_id,unit_id,employee_id,reservation_date,status,created_at',
            applyFilters: (q) => {
              let qq = q.gte('reservation_date', startDate).lte('reservation_date', endDate);
              if (employeeId) qq = qq.eq('employee_id', employeeId);
              return qq;
            },
            orderBy: { col: 'reservation_date', ascending: true },
          })
        : Promise.resolve([] as ReservationRow[]);

      // ===== 5) FollowUps =====
      const followupsPromise = needFollowUps
        ? fetchAllRows<FollowUpRow>({
            table: 'client_followups',
            select: 'id,client_id,employee_id,type,created_at',
            applyFilters: (q) => {
              let qq = q.gte('created_at', startISO).lte('created_at', endISO);
              if (employeeId) qq = qq.eq('employee_id', employeeId);
              return qq;
            },
            orderBy: { col: 'created_at', ascending: true },
          })
        : Promise.resolve([] as FollowUpRow[]);

      const [units, clients, sales, reservations, followups] = await Promise.all([
        unitsPromise,
        clientsPromise,
        salesPromise,
        reservationsPromise,
        followupsPromise,
      ]);

      // ===== Maps =====
      const projectById = new Map(projects.map((p) => [p.id, p]));
      const employeeById = new Map(emps.map((e) => [e.id, e]));
      const clientById = new Map(clients.map((c) => [c.id, c]));

      // ===== Units Stats =====
      const totalUnits = units.length;

      const unitsByType = {
        villa: units.filter((u) => u.unit_type === 'villa').length,
        duplex: units.filter((u) => u.unit_type === 'duplex').length,
        apartment: units.filter((u) => u.unit_type === 'apartment').length,
      };

      const unitsByStatus = {
        available: units.filter((u) => u.status === 'available').length,
        reserved: units.filter((u) => u.status === 'reserved').length,
        sold: units.filter((u) => u.status === 'sold').length,
      };

      // byProject + projectsByUnits
      const perProjectUnits: Record<
        string,
        { total: number; available: number; reserved: number; sold: number; salesAmount: number }
      > = {};

      for (const u of units) {
        if (!perProjectUnits[u.project_id]) {
          perProjectUnits[u.project_id] = { total: 0, available: 0, reserved: 0, sold: 0, salesAmount: 0 };
        }
        perProjectUnits[u.project_id].total += 1;
        if (u.status === 'available') perProjectUnits[u.project_id].available += 1;
        if (u.status === 'reserved') perProjectUnits[u.project_id].reserved += 1;
        if (u.status === 'sold') perProjectUnits[u.project_id].sold += 1;
      }

      // Sales amount per project
      const salesAmountByProject: Record<string, number> = {};
      for (const s of sales) {
        salesAmountByProject[s.project_id] = (salesAmountByProject[s.project_id] || 0) + (Number(s.price_before_tax) || 0);
      }

      const projectsByUnits = (projectId ? projects.filter((p) => p.id === projectId) : projects).map((p) => {
        const u = perProjectUnits[p.id] || { total: 0, available: 0, reserved: 0, sold: 0, salesAmount: 0 };
        const salesAmount = salesAmountByProject[p.id] || 0;
        return {
          projectId: p.id,
          projectName: p.name,
          projectCode: p.code || '',
          totalUnits: u.total,
          availableUnits: u.available,
          reservedUnits: u.reserved,
          soldUnits: u.sold,
          salesAmount,
        };
      });

      const unitsByProject = Object.entries(perProjectUnits).map(([pid, v]) => ({
        projectName: projectById.get(pid)?.name || 'غير معروف',
        count: v.total,
      }));

      const prices = units.map((u) => Number(u.supported_price || 0)).filter((p) => p > 0);
      const priceRange = {
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
        avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      };

      const unitsStats = {
        totalUnits,
        byType: unitsByType,
        byStatus: unitsByStatus,
        byProject: unitsByProject.sort((a, b) => b.count - a.count),
        priceRange,
      };

      // ===== Clients Stats =====
      const totalClients = clients.length;

      const byStatus = {
        lead: clients.filter((c) => c.status === 'lead').length,
        reserved: clients.filter((c) => c.status === 'reserved').length,
        converted: clients.filter((c) => c.status === 'converted').length,
        visited: clients.filter((c) => c.status === 'visited').length,
      };

      const byNationality = {
        saudi: clients.filter((c) => (c.nationality || '').toLowerCase() === 'saudi').length,
        non_saudi: clients.filter((c) => (c.nationality || '').toLowerCase() !== 'saudi').length,
      };

      const byEligibility = {
        eligible: clients.filter((c) => c.eligible === true).length,
        notEligible: clients.filter((c) => c.eligible === false).length,
      };

      const sourceCounts: Record<string, number> = {};
      for (const c of clients) {
        const src = (c.source || 'غير محدد').trim() || 'غير محدد';
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      }
      const topSources = Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const clientsStats = {
        totalClients,
        byStatus,
        byNationality,
        byEligibility,
        topSources,
      };

      // ===== Sales Stats =====
      const salesPrices = sales.map((s) => Number(s.price_before_tax || 0)).filter((p) => p > 0);
      const totalSales = sales.length;
      const totalSalesAmount = salesPrices.reduce((sum, p) => sum + p, 0);
      const avgSalePrice = salesPrices.length ? Math.round(totalSalesAmount / salesPrices.length) : 0;
      const maxSalePrice = salesPrices.length ? Math.max(...salesPrices) : 0;
      const minSalePrice = salesPrices.length ? Math.min(...salesPrices) : 0;

      // ===== Reservations Stats (Real byMonth + avg reservation->sale days) =====
      const totalReservations = reservations.length;
      const activeReservations = reservations.filter((r) => r.status === 'active').length;
      const convertedReservations = reservations.filter((r) => r.status === 'converted').length;
      const cancelledReservations = reservations.filter((r) => r.status === 'cancelled').length;

      // byMonth within range
      const byMonthMap: Record<string, number> = {};
      for (const r of reservations) {
        const d = new Date(r.reservation_date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonthMap[key] = (byMonthMap[key] || 0) + 1;
      }
      const byMonth = Object.entries(byMonthMap)
        .map(([key, count]) => {
          const [y, m] = key.split('-').map(Number);
          return { month: formatMonthArabic(y, m - 1), count };
        })
        .sort((a, b) => {
          // sort by date asc
          const ay = Number(a.month.match(/\d+/)?.[0] || 0);
          const by = Number(b.month.match(/\d+/)?.[0] || 0);
          return ay - by;
        });

      // avgReservationToSaleDays via matching (client_id+unit_id) -> earliest sale_date >= reservation_date
      const salesByKey: Record<string, string[]> = {};
      for (const s of sales) {
        const key = `${s.client_id}__${s.unit_id}`;
        if (!salesByKey[key]) salesByKey[key] = [];
        salesByKey[key].push(s.sale_date);
      }
      // ensure sorted sale dates
      for (const k of Object.keys(salesByKey)) {
        salesByKey[k].sort();
      }

      const diffs: number[] = [];
      for (const r of reservations) {
        const key = `${r.client_id}__${r.unit_id}`;
        const saleDates = salesByKey[key];
        if (!saleDates || saleDates.length === 0) continue;

        // find first sale date >= reservation date
        const sd = saleDates.find((d) => d >= r.reservation_date);
        if (!sd) continue;

        const diffDays = daysBetween(r.reservation_date, sd);
        if (diffDays >= 0) diffs.push(diffDays);
      }

      const avgReservationToSaleDays = diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : 0;

      const reservationsStats = {
        totalReservations,
        active: activeReservations,
        converted: convertedReservations,
        cancelled: cancelledReservations,
        byMonth,
        avgReservationToSaleDays,
      };

      // ===== FollowUps Stats =====
      const totalFollowUps = followups.length;

      const byTypeFU = {
        call: followups.filter((f) => f.type === 'call').length,
        whatsapp: followups.filter((f) => f.type === 'whatsapp').length,
        visit: followups.filter((f) => f.type === 'visit').length,
      };

      const byEmployeeMap: Record<string, number> = {};
      for (const f of followups) {
        const name = employeeById.get(f.employee_id)?.name || 'غير معروف';
        byEmployeeMap[name] = (byEmployeeMap[name] || 0) + 1;
      }
      const byEmployee = Object.entries(byEmployeeMap)
        .map(([employeeName, count]) => ({ employeeName, count }))
        .sort((a, b) => b.count - a.count);

      const distinctFUClients = new Set(followups.map((f) => f.client_id));
      const avgFollowUpsPerClient =
        distinctFUClients.size > 0 ? Math.round((totalFollowUps / distinctFUClients.size) * 10) / 10 : 0;

      // successRate: clients with followups who also have at least 1 sale in period
      const clientsWithSale = new Set(sales.map((s) => s.client_id));
      let intersect = 0;
      distinctFUClients.forEach((cid) => {
        if (clientsWithSale.has(cid)) intersect += 1;
      });
      const successRate = distinctFUClients.size ? Math.round((intersect / distinctFUClients.size) * 100) : 0;

      const followUpsStats = {
        totalFollowUps,
        byType: byTypeFU,
        byEmployee,
        avgFollowUpsPerClient,
        successRate,
      };

      // ===== Employees Performance =====
      const employeeTargets = employeeId ? emps.filter((e) => e.id === employeeId) : emps;

      // first followup time per (emp, client)
      const firstFUTime: Record<string, string> = {};
      for (const f of followups) {
        if (!f.created_at) continue;
        const key = `${f.employee_id}__${f.client_id}`;
        if (!firstFUTime[key] || f.created_at < firstFUTime[key]) firstFUTime[key] = f.created_at;
      }

      const employeesPerformance = employeeTargets.map((e) => {
        const myFU = followups.filter((f) => f.employee_id === e.id);
        const myRes = reservations.filter((r) => r.employee_id === e.id);
        const mySales = sales.filter((s) => s.sales_employee_id === e.id);

        const myClientsSet = new Set(myFU.map((f) => f.client_id));
        const totalClientsTouched = myClientsSet.size;

        const salesAmount = mySales.reduce((sum, s) => sum + (Number(s.price_before_tax) || 0), 0);

        const conversionRate =
          totalClientsTouched > 0 ? Math.round((mySales.length / totalClientsTouched) * 100) : 0;

        // avgResponseTime: avg hours between client.created_at and first followup by this employee
        const responseHours: number[] = [];
        myClientsSet.forEach((cid) => {
          const c = clientById.get(cid);
          const created = c?.created_at;
          const first = firstFUTime[`${e.id}__${cid}`];
          if (!created || !first) return;
          const diffMs = new Date(first).getTime() - new Date(created).getTime();
          if (diffMs >= 0) responseHours.push(diffMs / (1000 * 60 * 60));
        });
        const avgResponseTime = responseHours.length
          ? Math.round((responseHours.reduce((a, b) => a + b, 0) / responseHours.length) * 10) / 10
          : null;

        return {
          employeeId: e.id,
          employeeName: e.name || 'غير معروف',
          role: roleLabel(e.role),
          totalClients: totalClientsTouched,
          totalFollowUps: myFU.length,
          totalReservations: myRes.length,
          totalSales: mySales.length,
          salesAmount,
          conversionRate,
          avgResponseTime,
        };
      }).sort((a, b) => b.totalSales - a.totalSales);

      // ===== Time Based Stats (REAL from activity timestamps) =====
      const rangeDays = Math.max(1, daysBetween(startDate, endDate) + 1);
      const rangeWeeks = Math.max(1, Math.ceil(rangeDays / 7));
      const rangeMonths = Math.max(1, Math.ceil(rangeDays / 30));

      const activityTimestamps: string[] = [];
      for (const f of followups) if (f.created_at) activityTimestamps.push(f.created_at);
      for (const r of reservations) if (r.created_at) activityTimestamps.push(r.created_at);
      for (const s of sales) if (s.created_at) activityTimestamps.push(s.created_at);

      const hourCounts = new Array(24).fill(0);
      const dayCounts: Record<string, number> = {};

      const daysAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

      for (const ts of activityTimestamps) {
        const d = new Date(ts);
        const h = d.getHours();
        hourCounts[h] += 1;

        const dayName = daysAr[d.getDay()];
        dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
      }

      const peakHours = hourCounts
        .map((activity, hour) => ({ hour, activity }))
        .sort((a, b) => b.activity - a.activity)
        .slice(0, 5);

      const busiestDays = Object.entries(dayCounts)
        .map(([day, activity]) => ({ day, activity }))
        .sort((a, b) => b.activity - a.activity);

      const timeBasedStats = {
        dailyAvgSales: Math.round(totalSales / rangeDays),
        weeklyAvgSales: Math.round(totalSales / rangeWeeks),
        monthlyAvgSales: Math.round(totalSales / rangeMonths),
        peakHours,
        busiestDays,
      };

      // ===== KPIs (Realistic from available data) =====
      // salesGrowthRate vs previous same-length period
      const startD = new Date(startDate);
      const endD = new Date(endDate);
      const diffDays = Math.max(1, daysBetween(startDate, endDate) + 1);

      const prevEnd = new Date(startD);
      prevEnd.setDate(prevEnd.getDate() - 1);

      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - (diffDays - 1));

      const prevStartStr = prevStart.toISOString().split('T')[0];
      const prevEndStr = prevEnd.toISOString().split('T')[0];

      let prevSalesAmount = 0;
      if (type === 'comprehensive' || type === 'sales') {
        const prevSales = await fetchAllRows<{ price_before_tax: number; sale_date: string }>({
          table: 'sales',
          select: 'price_before_tax,sale_date,project_id,sales_employee_id',
          applyFilters: (q) => {
            let qq = q.gte('sale_date', prevStartStr).lte('sale_date', prevEndStr);
            if (projectId) qq = qq.eq('project_id', projectId);
            if (employeeId) qq = qq.eq('sales_employee_id', employeeId);
            return qq;
          },
        });
        prevSalesAmount = prevSales.reduce((sum, s) => sum + (Number(s.price_before_tax) || 0), 0);
      }

      const salesGrowthRate =
        prevSalesAmount > 0 ? Math.round(((totalSalesAmount - prevSalesAmount) / prevSalesAmount) * 100) : 0;

      const totalEmployees = emps.length || 1;
      const revenuePerEmployee = Math.round(totalSalesAmount / totalEmployees);

      const activityCount = totalSales + totalReservations + totalFollowUps;
      const employeeProductivity = Math.round(activityCount / totalEmployees);

      const inventoryTurnover = totalUnits > 0 ? Math.round((unitsByStatus.sold / totalUnits) * 100) : 0; // كنسبة

      const customerRetentionRate = totalClients > 0 ? Math.round((byStatus.converted / totalClients) * 100) : 0;

      const kpis = {
        clientAcquisitionCost: 0, // غير موجود في الداتا
        employeeProductivity,
        inventoryTurnover,
        revenuePerEmployee,
        customerRetentionRate,
        salesGrowthRate,
      };

      // ===== Build final report =====
      const report: ReportStats = {
        totalProjects: projects.length,
        totalUnits,
        totalClients,
        totalEmployees: emps.length,

        totalSales,
        totalSalesAmount,
        avgSalePrice,
        maxSalePrice,
        minSalePrice,

        projectsByUnits: projectsByUnits
          .map((p) => ({ ...p, salesAmount: salesAmountByProject[p.projectId] || 0 }))
          .sort((a, b) => b.salesAmount - a.salesAmount),

        employeesPerformance,

        clientsStats,
        unitsStats,
        reservationsStats,
        followUpsStats,

        timeBasedStats,
        kpis,
      };

      setReportData(report);
    } catch (err) {
      console.error('Error generating report:', err);
      alert('حدث خطأ أثناء توليد التقرير');
    } finally {
      setGeneratingReport(false);
    }
  }

  /* =====================
     Export
  ===================== */

  async function exportToJSON() {
    setExporting(true);
    try {
      if (!reportData) return;
      const data = JSON.stringify(reportData, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('تم تصدير التقرير بنجاح');
    } catch (err) {
      console.error('Error exporting report:', err);
      alert('حدث خطأ أثناء التصدير');
    } finally {
      setExporting(false);
    }
  }

  function exportToPDF() {
    alert('ميزة التصدير إلى PDF قيد التطوير');
  }

  function printReport() {
    window.print();
  }

  /* =====================
     UI Components
  ===================== */

  function StatCard({
    title,
    value,
    icon,
    color,
    trend,
  }: {
    title: string;
    value: string | number;
    icon: string;
    color: string;
    trend?: number;
  }) {
    return (
      <div
        className="stat-card"
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          border: `1px solid ${color}20`,
          borderLeft: `4px solid ${color}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>{title}</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: color }}>{value}</div>
            {trend !== undefined && (
              <div
                style={{
                  fontSize: '12px',
                  color: trend >= 0 ? '#0d8a3e' : '#ea4335',
                  marginTop: '5px',
                }}
              >
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% عن الفترة السابقة
              </div>
            )}
          </div>
          <div
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '12px',
              backgroundColor: `${color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '24px' }}>{icon}</span>
          </div>
        </div>
      </div>
    );
  }

  function KpiCard({
    title,
    value,
    target,
    unit,
    status,
  }: {
    title: string;
    value: number;
    target: number;
    unit: string;
    status: 'good' | 'warning' | 'bad';
  }) {
    const percentage = target > 0 ? Math.round((value / target) * 100) : 0;
    const colors = {
      good: { bg: '#e6f4ea', color: '#0d8a3e', text: 'ممتاز' },
      warning: { bg: '#fff8e1', color: '#fbbc04', text: 'مقبول' },
      bad: { bg: '#ffebee', color: '#ea4335', text: 'تحت الهدف' },
    };

    const statusColor = colors[status];

    return (
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '15px',
          border: `1px solid ${statusColor.color}30`,
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{title}</div>
          <div
            style={{
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              backgroundColor: statusColor.bg,
              color: statusColor.color,
            }}
          >
            {statusColor.text}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {value.toLocaleString()} <span style={{ fontSize: '12px', color: '#666' }}>{unit}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              الهدف: {target.toLocaleString()} {unit}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: statusColor.color }}>{percentage}%</div>
            <div style={{ fontSize: '10px', color: '#666' }}>الإنجاز</div>
          </div>
        </div>

        <div
          style={{
            height: '6px',
            backgroundColor: '#eee',
            borderRadius: '3px',
            marginTop: '10px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(percentage, 100)}%`,
              height: '100%',
              backgroundColor: statusColor.color,
            }}
          />
        </div>
      </div>
    );
  }

  /* =====================
     Loading
  ===================== */

  if (loading) {
    return (
      <RequireAuth>
        <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري التحقق من الصلاحيات...</div>
            <div style={{ color: '#666' }}>يرجى الانتظار</div>
          </div>
        </div>
      </RequireAuth>
    );
  }

  const shownProjectOptions = projectsList;

  return (
    <RequireAuth>
      <div className="page reports-page">
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '15px',
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>التقارير والإحصائيات</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>لوحة التقارير الشاملة للإداريين فقط</p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button onClick={exportToJSON} disabled={exporting || !reportData} variant="secondary">
              {exporting ? 'جاري التصدير...' : 'تصدير JSON'}
            </Button>
            <Button onClick={exportToPDF} disabled={!reportData} variant="secondary">
              تصدير PDF
            </Button>
            <Button onClick={printReport} disabled={!reportData}>
              طباعة التقرير
            </Button>
          </div>
        </div>

        {/* Filter Controls */}
        <Card title="فلترة التقرير">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px',
              padding: '15px',
            }}
          >
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>نوع التقرير</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="comprehensive">تقرير شامل</option>
                <option value="sales">تقرير المبيعات</option>
                <option value="clients">تقرير العملاء</option>
                <option value="units">تقرير الوحدات</option>
                <option value="employees">تقرير الموظفين</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>من تاريخ</label>
              <Input type="date" value={dateRange.startDate} onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>إلى تاريخ</label>
              <Input type="date" value={dateRange.endDate} onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>المشروع</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">جميع المشاريع</option>
                {shownProjectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>الموظف</label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">جميع الموظفين</option>
                {employeesList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({roleLabel(e.role)})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%' }}>
                <Button onClick={() => generateReport()} disabled={generatingReport}>
                  {generatingReport ? 'جاري التوليد...' : 'توليد التقرير'}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Loading State */}
        {generatingReport && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              backgroundColor: 'white',
              borderRadius: '8px',
              marginBottom: '20px',
            }}
          >
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري توليد التقرير...</div>
            <div style={{ color: '#666' }}>قد تستغرق العملية بضع لحظات</div>
          </div>
        )}

        {/* Report Content */}
        {!generatingReport && reportData && (
          <>
            {/* Summary Stats */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '20px',
                marginBottom: '30px',
              }}
            >
              <StatCard title="إجمالي المبيعات" value={`${reportData.totalSalesAmount.toLocaleString()} ريال`} icon="💰" color="#34a853" trend={reportData.kpis.salesGrowthRate} />
              <StatCard title="إجمالي الوحدات" value={reportData.totalUnits} icon="🏠" color="#1a73e8" />
              <StatCard title="إجمالي العملاء" value={reportData.totalClients} icon="👥" color="#fbbc04" />
              <StatCard title="نسبة العملاء المحولين" value={`${reportData.kpis.customerRetentionRate}%`} icon="📈" color="#ea4335" />
            </div>

            {/* KPIs Section */}
            {(reportType === 'comprehensive' || reportType === 'sales' || reportType === 'employees') && (
              <Card title="المؤشرات الرئيسية للأداء (KPIs)">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '15px',
                    padding: '15px',
                  }}
                >
                  <KpiCard title="الإيراد لكل موظف" value={reportData.kpis.revenuePerEmployee} target={500000} unit="ريال" status={reportData.kpis.revenuePerEmployee >= 500000 ? 'good' : 'warning'} />
                  <KpiCard title="إنتاجية الموظف (نشاط/موظف)" value={reportData.kpis.employeeProductivity} target={80} unit="نشاط" status={reportData.kpis.employeeProductivity >= 80 ? 'good' : 'warning'} />
                  <KpiCard title="معدل دوران المخزون (مباع/إجمالي)" value={reportData.kpis.inventoryTurnover} target={30} unit="%" status={reportData.kpis.inventoryTurnover >= 30 ? 'good' : 'warning'} />
                  <KpiCard title="معدل نمو المبيعات عن الفترة السابقة" value={reportData.kpis.salesGrowthRate} target={20} unit="%" status={reportData.kpis.salesGrowthRate >= 20 ? 'good' : 'warning'} />
                </div>
              </Card>
            )}

            {/* Projects Performance */}
            {(reportType === 'comprehensive' || reportType === 'units' || reportType === 'sales') && (
              <Card title="أداء المشاريع">
                <div style={{ padding: '15px' }}>
                  <Table headers={['المشروع', 'الكود', 'إجمالي الوحدات', 'متاحة', 'محجوزة', 'مباعة', 'قيمة المبيعات']}>
                    {reportData.projectsByUnits.map((p) => (
                      <tr key={p.projectId}>
                        <td>{p.projectName}</td>
                        <td>{p.projectCode}</td>
                        <td>{p.totalUnits}</td>
                        <td>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              backgroundColor: p.availableUnits > 0 ? '#e6f4ea' : '#ffebee',
                              color: p.availableUnits > 0 ? '#0d8a3e' : '#ea4335',
                              fontSize: '12px',
                            }}
                          >
                            {p.availableUnits}
                          </span>
                        </td>
                        <td>{p.reservedUnits}</td>
                        <td>{p.soldUnits}</td>
                        <td style={{ fontWeight: 'bold', color: '#34a853' }}>{p.salesAmount.toLocaleString()} ريال</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </Card>
            )}

            {/* Employees Performance */}
            {(reportType === 'comprehensive' || reportType === 'employees') && (
              <Card title="أداء الموظفين">
                <div style={{ padding: '15px' }}>
                  <Table headers={['الموظف', 'الدور', 'عملاء تعامل معهم', 'المتابعات', 'الحجوزات', 'المبيعات', 'قيمة المبيعات', 'معدل التحويل', 'متوسط أول متابعة']}>
                    {reportData.employeesPerformance.map((e) => (
                      <tr key={e.employeeId}>
                        <td style={{ fontWeight: 'bold' }}>{e.employeeName}</td>
                        <td>{e.role}</td>
                        <td>{e.totalClients}</td>
                        <td>{e.totalFollowUps}</td>
                        <td>{e.totalReservations}</td>
                        <td>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              backgroundColor: e.totalSales > 0 ? '#e6f4ea' : '#ffebee',
                              color: e.totalSales > 0 ? '#0d8a3e' : '#ea4335',
                              fontSize: '12px',
                            }}
                          >
                            {e.totalSales}
                          </span>
                        </td>
                        <td style={{ fontWeight: 'bold', color: '#34a853' }}>{e.salesAmount.toLocaleString()} ريال</td>
                        <td>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              backgroundColor: e.conversionRate >= 20 ? '#e6f4ea' : e.conversionRate >= 10 ? '#fff8e1' : '#ffebee',
                              color: e.conversionRate >= 20 ? '#0d8a3e' : e.conversionRate >= 10 ? '#fbbc04' : '#ea4335',
                              fontSize: '12px',
                            }}
                          >
                            {e.conversionRate}%
                          </span>
                        </td>
                        <td>{e.avgResponseTime === null ? '-' : `${e.avgResponseTime} ساعة`}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              </Card>
            )}

            {/* Time Analysis */}
            {(reportType === 'comprehensive' || reportType === 'employees' || reportType === 'sales') && (
              <Card title="التحليل الزمني">
                <div style={{ padding: '15px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>أوقات الذروة (من الأنشطة الفعلية)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {reportData.timeBasedStats.peakHours.map((h) => (
                          <div key={h.hour} style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '90px', fontSize: '13px' }}>
                              {h.hour}:00 - {h.hour + 1}:00
                            </div>
                            <div style={{ flex: 1, marginLeft: '10px' }}>
                              <div style={{ height: '10px', backgroundColor: '#eaeaea', borderRadius: '5px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, h.activity)}%`, height: '100%', backgroundColor: '#1a73e8' }} />
                              </div>
                            </div>
                            <div style={{ width: '40px', textAlign: 'left', fontSize: '12px' }}>{h.activity}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>أكثر الأيام نشاطاً (من الأنشطة الفعلية)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {reportData.timeBasedStats.busiestDays.map((d) => (
                          <div key={d.day} style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '80px', fontSize: '13px' }}>{d.day}</div>
                            <div style={{ flex: 1, marginLeft: '10px' }}>
                              <div style={{ height: '10px', backgroundColor: '#eaeaea', borderRadius: '5px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, d.activity)}%`, height: '100%', backgroundColor: '#34a853' }} />
                              </div>
                            </div>
                            <div style={{ width: '40px', textAlign: 'left', fontSize: '12px' }}>{d.activity}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Summary */}
            <Card title="ملخص التقرير">
              <div style={{ padding: '20px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '15px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#e6f4ea', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0d8a3e' }}>{reportData.reservationsStats.converted}</div>
                    <div style={{ fontSize: '12px', color: '#0d8a3e' }}>حجوزات محوّلة (status=converted)</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#fff8e1', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fbbc04' }}>{reportData.followUpsStats.successRate}%</div>
                    <div style={{ fontSize: '12px', color: '#fbbc04' }}>نسبة تحويل المتابعات لمبيعات</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#e8f0fe', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1a73e8' }}>{reportData.reservationsStats.avgReservationToSaleDays}</div>
                    <div style={{ fontSize: '12px', color: '#1a73e8' }}>متوسط أيام التحويل (حجز→بيع)</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#fce8e6', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ea4335' }}>{reportData.followUpsStats.avgFollowUpsPerClient}</div>
                    <div style={{ fontSize: '12px', color: '#ea4335' }}>متوسط المتابعات لكل عميل</div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '20px',
                    padding: '15px',
                    backgroundColor: '#e6f4ea',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    آخر تحديث: {new Date().toLocaleString('ar-SA')} | الفترة: {dateRange.startDate} إلى {dateRange.endDate} | تم توليد التقرير بواسطة: {employee?.name}
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* No Data */}
        {!generatingReport && !reportData && (
          <div style={{ textAlign: 'center', padding: '40px', backgroundColor: 'white', borderRadius: '8px' }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>لا توجد بيانات للتقرير</div>
            <div style={{ color: '#666', marginBottom: '20px' }}>انقر على زر توليد التقرير لعرض الإحصائيات</div>
            <div style={{ width: '100%', maxWidth: '200px', margin: '0 auto' }}>
              <Button onClick={() => generateReport()}>توليد التقرير الآن</Button>
            </div>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
