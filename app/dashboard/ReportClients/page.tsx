'use client';

import { useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Role = 'admin' | 'sales' | 'sales_manager' | string;

type Employee = {
  id: string;
  name: string;
  role: Role;
  email?: string;
};

type Project = {
  id: string;
  name: string;
  code: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  mobile: string | null;
  status: string;
  eligible: boolean;
  interested_in_project_id: string | null;
  created_at: string;
  updated_at: string | null;
};

type Metrics = {
  totalCreated: number;

  assigned: number;
  unassigned: number;
  distributionRate: number;

  editedWithinRange: number;

  lead: number;
  reserved: number;
  visited: number;
  converted: number;

  eligibleTrue: number;
  eligibleFalse: number;

  workedAny: number;
  workedByFollowups: number;
  workedByReservations: number;
  workedByReservationNotes: number;
  workedByVisits: number;
  workedBySales: number;
};

type AssignmentSLA = {
  assignedClients: number;
  avgHours: number;
  medianHours: number;
  within24h: number;
  within72h: number;
  reassignedClients: number;
};

type ProjectBreakdownRow = {
  projectId: string;
  label: string;
  count: number;
};

type EmployeeImpactRow = {
  employee_id: string;
  employee_name: string;

  assignedClients: number;

  followups: number;
  reservations: number;
  reservationNotes: number;
  visits: number;
  sales: number;

  touchedUniqueClients: number;

  conversionRate: number; // sales / touchedUniqueClients
  score: number;
};

type WorkedSets = {
  followups: Set<string>;
  reservations: Set<string>;
  reservationNotes: Set<string>;
  visits: Set<string>;
  sales: Set<string>;
  any: Set<string>;
};

/* =====================
   Utils
===================== */

function buildIsoRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000`);
  const end = new Date(`${endDate}T00:00:00.000`);
  end.setDate(end.getDate() + 1); // exclusive
  return { startISO: start.toISOString(), endISOExclusive: end.toISOString() };
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAllPaged<T>(queryFactory: (from: number, to: number) => any): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  let all: T[] = [];

  while (true) {
    const res = await queryFactory(from, from + pageSize - 1);
    const { data, error } = res || {};
    if (error) throw error;

    const batch = (data || []) as T[];
    all = all.concat(batch);

    if (batch.length < pageSize) break;

    from += pageSize;
    await new Promise((r) => setTimeout(r, 60));
  }

  return all;
}

function translateStatus(status: string) {
  switch (status) {
    case 'lead': return 'متابعة';
    case 'reserved': return 'محجوز';
    case 'visited': return 'تمت الزيارة';
    case 'converted': return 'تم البيع';
    default: return status;
  }
}

function pct(n: number) {
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n * 10) / 10}%`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmt(n: number) {
  return n.toLocaleString('ar-EG');
}

/* =====================
   Premium UI (tiny)
===================== */

function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  return <span className={`cc-badge cc-badge--${tone}`}>{children}</span>;
}

function MiniBars({
  items,
  maxLabel = 220,
}: {
  items: { label: string; value: number; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }[];
  maxLabel?: number;
}) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return (
    <div className="cc-bars">
      {items.map((x) => {
        const pct = clamp((x.value / max) * 100, 2, 100);
        const tone = x.tone || 'neutral';
        return (
          <div key={x.label} className="cc-bars__row">
            <div className="cc-bars__label" style={{ maxWidth: maxLabel }}>
              {x.label}
            </div>
            <div className="cc-bars__track">
              <div className={`cc-bars__fill cc-bars__fill--${tone}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="cc-bars__val">{x.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  tone = 'neutral',
  icon,
}: {
  title: string;
  value: string | number;
  sub?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  icon: string;
}) {
  return (
    <div className="cc-kpi">
      <div className={`cc-kpi__icon cc-kpi__icon--${tone}`} aria-hidden>
        {icon}
      </div>
      <div className="cc-kpi__body">
        <div className="cc-kpi__title">{title}</div>
        <div className="cc-kpi__value">{value}</div>
        {sub ? <div className="cc-kpi__sub">{sub}</div> : null}
      </div>
    </div>
  );
}

function Panel({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="cc-panel">
      <div className="cc-panel__head">
        <div>
          <div className="cc-panel__title">{title}</div>
          {hint ? <div className="cc-panel__hint">{hint}</div> : null}
        </div>
        {right ? <div className="cc-panel__right">{right}</div> : null}
      </div>
      <div className="cc-panel__body">{children}</div>
    </div>
  );
}

/* =====================
   Page
===================== */

export default function ClientsCreatedReportPage() {
  const router = useRouter();

  const todayStr = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: todayStr, end: todayStr });

  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [myAllowedProjects, setMyAllowedProjects] = useState<Project[]>([]);
  const myAllowedProjectIds = useMemo(() => myAllowedProjects.map((p) => p.id), [myAllowedProjects]);

  const [projectId, setProjectId] = useState<string>('all');

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [assignmentSLA, setAssignmentSLA] = useState<AssignmentSLA | null>(null);
  const [projectBreakdown, setProjectBreakdown] = useState<ProjectBreakdownRow[]>([]);
  const [topEmployees, setTopEmployees] = useState<EmployeeImpactRow[]>([]);
  const [debug, setDebug] = useState<string>('');
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      setLoading(true);
      setDebug('🔄 تهيئة تقرير إضافة العملاء...');

      const emp = await getCurrentEmployee();
      if (!emp) {
        router.push('/login');
        return;
      }

      if (emp.role !== 'admin' && emp.role !== 'sales_manager') {
        alert('غير مصرح لك بالوصول إلى هذا التقرير');
        router.push('/dashboard');
        return;
      }

      setCurrentEmployee(emp);
      setDebug((p) => p + `\n✅ المستخدم: ${emp.name} (${emp.role})`);

      const allowed = await loadMyAllowedProjects(emp);
      await loadProjects(emp, allowed);
      await loadEmployees(emp, allowed.map((x) => x.id));

      setDebug((p) => p + '\n✅ تم تجهيز البيانات الأساسية');
    } catch (e: any) {
      console.error(e);
      setDebug(`❌ خطأ أثناء التهيئة: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadMyAllowedProjects(emp: Employee) {
    if (emp.role === 'admin') {
      setMyAllowedProjects([]);
      return [];
    }

    const { data: rows, error } = await supabase.from('employee_projects').select('project_id').eq('employee_id', emp.id);
    if (error) throw error;

    const ids = (rows || []).map((r: any) => r.project_id).filter(Boolean);
    if (ids.length === 0) {
      setMyAllowedProjects([]);
      return [];
    }

    const { data: prj, error: pErr } = await supabase.from('projects').select('id,name,code').in('id', ids).order('name');
    if (pErr) throw pErr;

    setMyAllowedProjects(prj || []);
    return prj || [];
  }

  async function loadProjects(emp: Employee, allowedProjectsList: Project[]) {
    if (emp.role === 'admin') {
      const { data, error } = await supabase.from('projects').select('id,name,code').order('name');
      if (error) throw error;
      setProjects(data || []);
      return;
    }
    setProjects(allowedProjectsList || []);
  }

  async function loadEmployees(emp: Employee, allowedProjectIds: string[]) {
    if (emp.role === 'admin') {
      const { data, error } = await supabase
        .from('employees')
        .select('id,name,role,email')
        .in('role', ['sales', 'sales_manager', 'admin'])
        .order('name', { ascending: true });

      if (error) throw error;

      setEmployees(
        (data || []).map((x: any) => ({
          id: x.id,
          name: x.name || 'غير معروف',
          role: x.role,
          email: x.email || '',
        }))
      );
      return;
    }

    // sales_manager: employees under allowed projects
    if (!allowedProjectIds.length) {
      setEmployees([]);
      return;
    }

    const { data: epRows, error: epErr } = await supabase
      .from('employee_projects')
      .select('employee_id')
      .in('project_id', allowedProjectIds);

    if (epErr) throw epErr;

    const employeeIds = Array.from(new Set((epRows || []).map((r: any) => r.employee_id).filter(Boolean)));
    if (!employeeIds.length) {
      setEmployees([]);
      return;
    }

    const { data, error } = await supabase
      .from('employees')
      .select('id,name,role,email')
      .in('id', employeeIds)
      .in('role', ['sales', 'sales_manager'])
      .order('name', { ascending: true });

    if (error) throw error;

    setEmployees(
      (data || []).map((x: any) => ({
        id: x.id,
        name: x.name || 'غير معروف',
        role: x.role,
        email: x.email || '',
      }))
    );
  }

  /* =====================
     Report Fetchers
  ===================== */

  async function fetchClientsCreatedInRange(startISO: string, endISOExclusive: string): Promise<ClientRow[]> {
    const rows = await fetchAllPaged<any>((from, to) => {
      let q = supabase
        .from('clients')
        .select('id,name,mobile,eligible,status,interested_in_project_id,created_at,updated_at')
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);

      // sales_manager scope
      if (currentEmployee?.role === 'sales_manager') {
        if (!myAllowedProjectIds.length) return supabase.from('clients').select('id').limit(0);
        q = q.in('interested_in_project_id', myAllowedProjectIds);
      }

      if (projectId !== 'all') q = q.eq('interested_in_project_id', projectId);

      return q;
    });

    return (rows || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      mobile: c.mobile ?? null,
      eligible: !!c.eligible,
      status: c.status,
      interested_in_project_id: c.interested_in_project_id ?? null,
      created_at: c.created_at,
      updated_at: c.updated_at ?? null,
    }));
  }

  type AssignmentRow = { client_id: string; employee_id: string; assigned_at: string };

  async function fetchAssignmentsForClients(clientIds: string[]) {
    const assignedClientSet = new Set<string>();
    const assignedByEmployee = new Map<string, number>();
    const rows: AssignmentRow[] = [];

    const chunks = chunkArray(clientIds, 500);
    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('client_assignments')
        .select('client_id, employee_id, assigned_at')
        .in('client_id', ch);

      if (error) throw error;

      (data || []).forEach((r: any) => {
        if (!r?.client_id) return;
        rows.push({ client_id: r.client_id, employee_id: r.employee_id, assigned_at: r.assigned_at });

        assignedClientSet.add(r.client_id);
        if (r.employee_id) assignedByEmployee.set(r.employee_id, (assignedByEmployee.get(r.employee_id) || 0) + 1);
      });
    }

    return { assignedClientSet, assignedByEmployee, assignmentRows: rows };
  }

  function computeEditedCount(clients: ClientRow[], startISO: string, endISOExclusive: string) {
    const startT = new Date(startISO).getTime();
    const endT = new Date(endISOExclusive).getTime();

    return clients.filter((c) => {
      if (!c.updated_at) return false;
      const u = new Date(c.updated_at).getTime();
      const cr = new Date(c.created_at).getTime();
      return u >= startT && u < endT && u > cr;
    }).length;
  }

  async function fetchEmployeeActivityOnClients(clientIds: string[], startISO: string, endISOExclusive: string) {
    const followups = new Map<string, number>();
    const reservations = new Map<string, number>();
    const visits = new Map<string, number>();
    const sales = new Map<string, number>();
    const reservationNotes = new Map<string, number>();

    const touchedClients = new Map<string, Set<string>>();

    const setFollowups = new Set<string>();
    const setReservations = new Set<string>();
    const setVisits = new Set<string>();
    const setSales = new Set<string>();
    const setReservationNotes = new Set<string>();

    const chunks = chunkArray(clientIds, 500);

    // Followups (employee_id)
    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('client_followups')
        .select('employee_id, client_id, created_at')
        .in('client_id', ch)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive);

      if (error) throw error;

      (data || []).forEach((r: any) => {
        const eid = r.employee_id;
        const cid = r.client_id;
        if (!eid || !cid) return;

        setFollowups.add(cid);

        followups.set(eid, (followups.get(eid) || 0) + 1);
        if (!touchedClients.has(eid)) touchedClients.set(eid, new Set());
        touchedClients.get(eid)!.add(cid);
      });
    }

    // Reservations (employee_id)
    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('reservations')
        .select('employee_id, client_id, created_at, id')
        .in('client_id', ch)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive);

      if (error) throw error;

      (data || []).forEach((r: any) => {
        const eid = r.employee_id;
        const cid = r.client_id;
        if (!eid || !cid) return;

        setReservations.add(cid);

        reservations.set(eid, (reservations.get(eid) || 0) + 1);
        if (!touchedClients.has(eid)) touchedClients.set(eid, new Set());
        touchedClients.get(eid)!.add(cid);
      });
    }

    // Visits (employee_id)
    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('visits')
        .select('employee_id, client_id, created_at')
        .in('client_id', ch)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive);

      if (error) throw error;

      (data || []).forEach((r: any) => {
        const eid = r.employee_id;
        const cid = r.client_id;
        if (!eid || !cid) return;

        setVisits.add(cid);

        visits.set(eid, (visits.get(eid) || 0) + 1);
        if (!touchedClients.has(eid)) touchedClients.set(eid, new Set());
        touchedClients.get(eid)!.add(cid);
      });
    }

    // Sales (sales_employee_id)
    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('sales')
        .select('sales_employee_id, client_id, created_at')
        .in('client_id', ch)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive);

      if (error) throw error;

      (data || []).forEach((r: any) => {
        const eid = r.sales_employee_id;
        const cid = r.client_id;
        if (!eid || !cid) return;

        setSales.add(cid);

        sales.set(eid, (sales.get(eid) || 0) + 1);
        if (!touchedClients.has(eid)) touchedClients.set(eid, new Set());
        touchedClients.get(eid)!.add(cid);
      });
    }

    // Reservation notes:
    // map reservation_id -> client_id using reservations (all, not only in range, but only notes in range)
    const reservationIdToClient = new Map<string, string>();
    const allReservationIds: string[] = [];

    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('reservations')
        .select('id, client_id')
        .in('client_id', ch);

      if (error) throw error;

      (data || []).forEach((r: any) => {
        if (!r?.id || !r?.client_id) return;
        reservationIdToClient.set(r.id, r.client_id);
        allReservationIds.push(r.id);
      });
    }

    if (allReservationIds.length) {
      const resChunks = chunkArray(allReservationIds, 500);

      for (const rch of resChunks) {
        const { data, error } = await supabase
          .from('reservation_notes')
          .select('reservation_id, created_by, created_at')
          .in('reservation_id', rch)
          .gte('created_at', startISO)
          .lt('created_at', endISOExclusive);

        if (error) throw error;

        (data || []).forEach((n: any) => {
          const eid = n.created_by;
          const rid = n.reservation_id;
          const cid = reservationIdToClient.get(rid);

          if (!eid) return;

          reservationNotes.set(eid, (reservationNotes.get(eid) || 0) + 1);
          if (cid) {
            setReservationNotes.add(cid);
            if (!touchedClients.has(eid)) touchedClients.set(eid, new Set());
            touchedClients.get(eid)!.add(cid);
          }
        });
      }
    }

    const any = new Set<string>();
    [setFollowups, setReservations, setVisits, setSales, setReservationNotes].forEach((s) => s.forEach((id) => any.add(id)));

    const workedSets: WorkedSets = {
      followups: setFollowups,
      reservations: setReservations,
      visits: setVisits,
      sales: setSales,
      reservationNotes: setReservationNotes,
      any,
    };

    return { followups, reservations, visits, sales, reservationNotes, touchedClients, workedSets };
  }

  function computeProjectBreakdown(createdClients: ClientRow[]) {
    const map = new Map<string, number>();

    for (const c of createdClients) {
      const pid = c.interested_in_project_id || 'none';
      map.set(pid, (map.get(pid) || 0) + 1);
    }

    const projectMap = new Map<string, Project>();
    projects.forEach((p) => projectMap.set(p.id, p));

    const rows: ProjectBreakdownRow[] = Array.from(map.entries()).map(([pid, count]) => {
      if (pid === 'none') return { projectId: 'none', label: 'بدون مشروع', count };

      const p = projectMap.get(pid);
      const label = p ? (p.code ? `${p.name} (${p.code})` : p.name) : 'مشروع غير معروف';
      return { projectId: pid, label, count };
    });

    rows.sort((a, b) => b.count - a.count);
    return rows;
  }

  function computeAssignmentSLA(createdClients: ClientRow[], assignmentRows: AssignmentRow[]) {
    // earliest assignment per client
    const firstAssignAt = new Map<string, string>();
    const assignCountByClient = new Map<string, number>();

    for (const r of assignmentRows) {
      assignCountByClient.set(r.client_id, (assignCountByClient.get(r.client_id) || 0) + 1);

      const prev = firstAssignAt.get(r.client_id);
      if (!prev) firstAssignAt.set(r.client_id, r.assigned_at);
      else {
        if (new Date(r.assigned_at).getTime() < new Date(prev).getTime()) firstAssignAt.set(r.client_id, r.assigned_at);
      }
    }

    const hours: number[] = [];
    let within24h = 0;
    let within72h = 0;

    for (const c of createdClients) {
      const a = firstAssignAt.get(c.id);
      if (!a) continue;

      const h = (new Date(a).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60);
      if (!Number.isFinite(h) || h < 0) continue;

      hours.push(h);
      if (h <= 24) within24h++;
      if (h <= 72) within72h++;
    }

    hours.sort((a, b) => a - b);
    const assignedClients = hours.length;

    const avgHours = assignedClients ? hours.reduce((s, x) => s + x, 0) / assignedClients : 0;
    const medianHours = assignedClients
      ? assignedClients % 2 === 1
        ? hours[Math.floor(assignedClients / 2)]
        : (hours[assignedClients / 2 - 1] + hours[assignedClients / 2]) / 2
      : 0;

    const reassignedClients = Array.from(assignCountByClient.values()).filter((n) => n > 1).length;

    return {
      assignedClients,
      avgHours: Math.round(avgHours * 10) / 10,
      medianHours: Math.round(medianHours * 10) / 10,
      within24h,
      within72h,
      reassignedClients,
    } satisfies AssignmentSLA;
  }

  /* =====================
     Export
  ===================== */

  async function exportJSON() {
    if (!metrics) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    setExporting(true);
    try {
      const payload = {
        meta: {
          report: 'clients_created',
          generatedAt: new Date().toISOString(),
          generatedBy: currentEmployee?.name,
          role: currentEmployee?.role,
          dateRange,
          projectId,
        },
        metrics,
        assignmentSLA,
        projectBreakdown,
        topEmployees,
      };

      const dataStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `clients_created_${dateRange.start}_to_${dateRange.end}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  function exportCSV() {
    if (!metrics) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    // Sheet-like CSV: Summary then Employees
    const summaryRows = [
      ['Metric', 'Value'],
      ['Total Created', metrics.totalCreated],
      ['Assigned', metrics.assigned],
      ['Unassigned', metrics.unassigned],
      ['Distribution Rate', `${metrics.distributionRate}%`],
      ['Edited Within Range', metrics.editedWithinRange],
      ['Status Lead', metrics.lead],
      ['Status Reserved', metrics.reserved],
      ['Status Visited', metrics.visited],
      ['Status Converted', metrics.converted],
      ['Eligible True', metrics.eligibleTrue],
      ['Eligible False', metrics.eligibleFalse],
      ['Worked Any', metrics.workedAny],
      ['Worked By Followups', metrics.workedByFollowups],
      ['Worked By Reservations', metrics.workedByReservations],
      ['Worked By Reservation Notes', metrics.workedByReservationNotes],
      ['Worked By Visits', metrics.workedByVisits],
      ['Worked By Sales', metrics.workedBySales],
      ['---', '---'],
      ['SLA Assigned Clients', assignmentSLA?.assignedClients ?? 0],
      ['SLA Avg Hours', assignmentSLA?.avgHours ?? 0],
      ['SLA Median Hours', assignmentSLA?.medianHours ?? 0],
      ['SLA Within 24h', assignmentSLA?.within24h ?? 0],
      ['SLA Within 72h', assignmentSLA?.within72h ?? 0],
      ['SLA Reassigned Clients', assignmentSLA?.reassignedClients ?? 0],
    ];

    const empHeader = [
      'Employee',
      'Score',
      'AssignedClients',
      'TouchedUniqueClients',
      'ConversionRate(%)',
      'Followups',
      'Reservations',
      'ReservationNotes',
      'Visits',
      'Sales',
    ];

    const empRows = topEmployees.map((e) => [
      e.employee_name,
      e.score,
      e.assignedClients,
      e.touchedUniqueClients,
      Math.round(e.conversionRate * 1000) / 10,
      e.followups,
      e.reservations,
      e.reservationNotes,
      e.visits,
      e.sales,
    ]);

    const csv = [
      ['Clients Created Report', `${dateRange.start} -> ${dateRange.end}`].join(','),
      ['Project', projectId].join(','),
      '',
      ...summaryRows.map((r) => r.join(',')),
      '',
      empHeader.join(','),
      ...empRows.map((r) => r.join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `clients_created_${dateRange.start}_to_${dateRange.end}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* =====================
     Generate
  ===================== */

  async function generateReport() {
    if (!dateRange.start || !dateRange.end) {
      alert('اختار تاريخ (من/إلى)');
      return;
    }
    if (dateRange.start > dateRange.end) {
      alert('تأكد أن تاريخ "من" أقل أو يساوي تاريخ "إلى"');
      return;
    }

    setGenerating(true);
    setMetrics(null);
    setAssignmentSLA(null);
    setProjectBreakdown([]);
    setTopEmployees([]);

    try {
      const { startISO, endISOExclusive } = buildIsoRange(dateRange.start, dateRange.end);

      setDebug(
        `🔄 توليد تقرير إضافة العملاء...\n📅 ${dateRange.start} → ${dateRange.end}\n- gte: ${startISO}\n- lt: ${endISOExclusive}\n🏗️ المشروع: ${projectId === 'all' ? 'الكل' : projectId}`
      );

      const createdClients = await fetchClientsCreatedInRange(startISO, endISOExclusive);

      if (!createdClients.length) {
        setMetrics({
          totalCreated: 0,
          assigned: 0,
          unassigned: 0,
          distributionRate: 0,
          editedWithinRange: 0,
          lead: 0,
          reserved: 0,
          visited: 0,
          converted: 0,
          eligibleTrue: 0,
          eligibleFalse: 0,
          workedAny: 0,
          workedByFollowups: 0,
          workedByReservations: 0,
          workedByReservationNotes: 0,
          workedByVisits: 0,
          workedBySales: 0,
        });
        setAssignmentSLA({
          assignedClients: 0,
          avgHours: 0,
          medianHours: 0,
          within24h: 0,
          within72h: 0,
          reassignedClients: 0,
        });
        setProjectBreakdown([]);
        setDebug((p) => p + '\n✅ لا يوجد عملاء تم إضافتهم في هذه الفترة');
        return;
      }

      const clientIds = createdClients.map((c) => c.id);

      const lead = createdClients.filter((c) => c.status === 'lead').length;
      const reserved = createdClients.filter((c) => c.status === 'reserved').length;
      const visited = createdClients.filter((c) => c.status === 'visited').length;
      const converted = createdClients.filter((c) => c.status === 'converted').length;

      const eligibleTrue = createdClients.filter((c) => !!c.eligible).length;
      const eligibleFalse = createdClients.length - eligibleTrue;

      const editedWithinRange = computeEditedCount(createdClients, startISO, endISOExclusive);

      setDebug((p) => p + '\n🔄 حساب التوزيع (متوزع/غير متوزع)...');
      const { assignedClientSet, assignedByEmployee, assignmentRows } = await fetchAssignmentsForClients(clientIds);
      const assigned = assignedClientSet.size;
      const unassigned = createdClients.length - assigned;
      const distributionRate = createdClients.length ? (assigned / createdClients.length) * 100 : 0;

      const sla = computeAssignmentSLA(createdClients, assignmentRows);
      setAssignmentSLA(sla);

      const pbd = computeProjectBreakdown(createdClients);
      setProjectBreakdown(pbd);

      setDebug((p) => p + '\n🔄 حساب نشاط الموظفين على العملاء الجدد...');
      const { followups, reservations, visits, sales, reservationNotes, touchedClients, workedSets } =
        await fetchEmployeeActivityOnClients(clientIds, startISO, endISOExclusive);

      const workedAny = workedSets.any.size;

      const workedByFollowups = workedSets.followups.size;
      const workedByReservations = workedSets.reservations.size;
      const workedByReservationNotes = workedSets.reservationNotes.size;
      const workedByVisits = workedSets.visits.size;
      const workedBySales = workedSets.sales.size;

      const empMap = new Map<string, Employee>();
      employees.forEach((e) => empMap.set(e.id, e));

      const allEmployeeIds = new Set<string>();
      [assignedByEmployee, followups, reservations, visits, sales, reservationNotes].forEach((m) => {
        for (const k of m.keys()) allEmployeeIds.add(k);
      });

      const rows: EmployeeImpactRow[] = Array.from(allEmployeeIds).map((eid) => {
        const e = empMap.get(eid);
        const assignedClients = assignedByEmployee.get(eid) || 0;

        const f = followups.get(eid) || 0;
        const r = reservations.get(eid) || 0;
        const v = visits.get(eid) || 0;
        const s = sales.get(eid) || 0;
        const rn = reservationNotes.get(eid) || 0;

        const touched = touchedClients.get(eid)?.size || 0;

        const conversionRate = touched > 0 ? s / touched : 0;

        // Score weights (عملي وبروفشنال):
        // sales أعلى وزن — reservations مهمة — visits — followups — notes
        const score = Math.round(f * 1 + r * 3 + v * 2 + rn * 1 + s * 6 + assignedClients * 0.25);

        return {
          employee_id: eid,
          employee_name: e?.name || 'غير معروف',
          assignedClients,
          followups: f,
          reservations: r,
          reservationNotes: rn,
          visits: v,
          sales: s,
          touchedUniqueClients: touched,
          conversionRate,
          score,
        };
      });

      rows.sort((a, b) => b.score - a.score);

      setMetrics({
        totalCreated: createdClients.length,
        assigned,
        unassigned,
        distributionRate: Math.round(distributionRate * 10) / 10,
        editedWithinRange,
        lead,
        reserved,
        visited,
        converted,
        eligibleTrue,
        eligibleFalse,
        workedAny,
        workedByFollowups,
        workedByReservations,
        workedByReservationNotes,
        workedByVisits,
        workedBySales,
      });

      setTopEmployees(rows.slice(0, 10));

      setDebug(
        (p) =>
          p +
          `\n✅ Done: Created=${createdClients.length} | Assigned=${assigned} | Edited=${editedWithinRange} | Worked=${workedAny}\n✅ Top: ${
            rows[0]?.employee_name || '—'
          } (Score=${rows[0]?.score || 0})`
      );
    } catch (e: any) {
      console.error(e);
      alert(`حدث خطأ أثناء توليد التقرير: ${e?.message || e}`);
      setDebug((p) => p + `\n❌ خطأ: ${e?.message || e}`);
    } finally {
      setGenerating(false);
    }
  }

  /* =====================
     Derived Insights
  ===================== */

  const insights = useMemo(() => {
    if (!metrics) return [];
    const out: { tone: 'info' | 'success' | 'warning' | 'danger'; text: string }[] = [];

    const unassignedRate = metrics.totalCreated ? (metrics.unassigned / metrics.totalCreated) * 100 : 0;
    const workedRate = metrics.totalCreated ? (metrics.workedAny / metrics.totalCreated) * 100 : 0;

    if (unassignedRate >= 40) {
      out.push({ tone: 'danger', text: `🚨 نسبة غير الموزعين عالية: ${pct(unassignedRate)} — محتاجين توزيع أسرع.` });
    } else if (unassignedRate >= 20) {
      out.push({ tone: 'warning', text: `⚠️ نسبة غير الموزعين: ${pct(unassignedRate)} — ممكن تتحسن.` });
    } else {
      out.push({ tone: 'success', text: `✅ توزيع ممتاز — غير موزعين: ${pct(unassignedRate)} فقط.` });
    }

    if (assignmentSLA && assignmentSLA.assignedClients > 0) {
      if (assignmentSLA.medianHours > 24) out.push({ tone: 'warning', text: `⏳ Median وقت التوزيع ${assignmentSLA.medianHours} ساعة — هدفنا أقل من 24 ساعة.` });
      else out.push({ tone: 'success', text: `⚡ التوزيع سريع — Median ${assignmentSLA.medianHours} ساعة.` });
    }

    if (workedRate < 35) out.push({ tone: 'warning', text: `📉 نسبة العمل على العملاء الجدد منخفضة: ${pct(workedRate)} — محتاجين followups أكتر.` });
    else out.push({ tone: 'info', text: `📌 تم العمل على ${pct(workedRate)} من العملاء الجدد خلال نفس الفترة.` });

    return out;
  }, [metrics, assignmentSLA]);

  /* =====================
     UI
  ===================== */

  if (loading) {
    return (
      <RequireAuth>
        <div className="page">
          <Card title="Clients Created Report">
            <div style={{ padding: 14 }}>جاري التحميل...</div>
          </Card>
        </div>
      </RequireAuth>
    );
  }

  const projectLabel =
    projectId === 'all'
      ? 'كل المشاريع'
      : projects.find((p) => p.id === projectId)
      ? (projects.find((p) => p.id === projectId)!.code
          ? `${projects.find((p) => p.id === projectId)!.name} (${projects.find((p) => p.id === projectId)!.code})`
          : projects.find((p) => p.id === projectId)!.name)
      : projectId;

  const topProjectBars = projectBreakdown.slice(0, 10).map((x, i) => ({
    label: x.label,
    value: x.count,
    tone: i < 2 ? ('success' as const) : i < 6 ? ('info' as const) : ('neutral' as const),
  }));

  return (
    <RequireAuth>
      <div className="cc-page">
        <style jsx global>{globalCss}</style>

        {/* HERO */}
        <div className="cc-hero">
          <div className="cc-hero__inner">
            <div className="cc-hero__row">
              <div>
                <div className="cc-crumbs">Dashboard / Reports / <b>Clients Created</b></div>
                <h1 className="cc-title">تقرير العملاء المضافين خلال فترة</h1>
                <p className="cc-sub">
                  Snapshot احترافي عن العملاء الجدد: توزيع، تعديل، Funnel نشاط، SLA للتوزيع، و Top Employees.
                </p>

                <div className="cc-badges">
                  <Badge tone="info">🔐 {currentEmployee?.role}</Badge>
                  <Badge tone="neutral">📅 {dateRange.start} → {dateRange.end}</Badge>
                  <Badge tone="neutral">🏗️ {projectLabel}</Badge>
                </div>
              </div>

              <div className="cc-hero__actions">
                <Button onClick={() => setShowDebug((p) => !p)} variant="secondary">
                  {showDebug ? 'إخفاء Debug' : 'عرض Debug'}
                </Button>
                <Button onClick={exportCSV} disabled={!metrics}>⬇️ CSV</Button>
                <Button onClick={exportJSON} disabled={!metrics || exporting} variant="secondary">
                  {exporting ? 'جاري...' : '⬇️ JSON'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* FILTERS */}
        <div className="cc-wrap">
          <Card title="Filters">
            <div className="cc-filters">
              <div className="cc-field">
                <div className="cc-label">من تاريخ</div>
                <input
                  className="cc-input"
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                />
              </div>

              <div className="cc-field">
                <div className="cc-label">إلى تاريخ</div>
                <input
                  className="cc-input"
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                />
              </div>

              <div className="cc-field">
                <div className="cc-label">المشروع</div>
                <select className="cc-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="all">كل المشاريع</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.name} (${p.code})` : p.name}
                    </option>
                  ))}
                </select>
                {currentEmployee?.role === 'sales_manager' ? (
                  <div className="cc-hint">
                    نطاقك: {myAllowedProjects.length ? `${myAllowedProjects.length} مشروع` : 'لا يوجد مشاريع مفعّلة لك'}
                  </div>
                ) : null}
              </div>

              <div className="cc-actions">
                <div className="cc-quick">
                  <button className="cc-chip" onClick={() => setDateRange({ start: todayStr, end: todayStr })}>اليوم</button>
                  <button
                    className="cc-chip"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(start.getDate() - 6);
                      setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
                    }}
                  >
                    آخر 7 أيام
                  </button>
                  <button
                    className="cc-chip"
                    onClick={() => {
                      const end = new Date();
                      const start = new Date();
                      start.setDate(start.getDate() - 29);
                      setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
                    }}
                  >
                    آخر 30 يوم
                  </button>
                </div>

                <div className="cc-cta">
                  <Button onClick={generateReport} disabled={generating}>
                    {generating ? 'جاري التوليد...' : '⚡ توليد التقرير'}
                  </Button>
                  <Button onClick={() => router.push('/dashboard')} variant="secondary">
                    رجوع
                  </Button>
                </div>
              </div>
            </div>

            {showDebug && debug ? <pre className="cc-debug">{debug}</pre> : null}
          </Card>

          {!metrics ? (
            <div className="cc-empty">
              <div className="cc-empty__icon">📊</div>
              <div className="cc-empty__title">جاهزين</div>
              <div className="cc-empty__sub">اختار الفترة والمشروع واضغط “توليد التقرير”.</div>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="cc-kpis">
                <KpiCard title="إجمالي العملاء المضافين" value={fmt(metrics.totalCreated)} sub="Created in range" tone="info" icon="👥" />
                <KpiCard title="نسبة التوزيع" value={pct(metrics.distributionRate)} sub={`${fmt(metrics.assigned)} موزع • ${fmt(metrics.unassigned)} غير موزع`} tone={metrics.distributionRate >= 80 ? 'success' : metrics.distributionRate >= 50 ? 'warning' : 'danger'} icon="🎯" />
                <KpiCard title="تم تعديلهم" value={fmt(metrics.editedWithinRange)} sub="updated_at within range" tone="warning" icon="✍️" />
                <KpiCard title="تم العمل عليهم" value={fmt(metrics.workedAny)} sub="Any activity within range" tone="success" icon="🛠️" />
              </div>

              {/* Insights */}
              <Panel title="Executive Insights" hint="ملخص سريع يساعدك تاخد قرار بسرعة" right={<Badge tone="info">Auto</Badge>}>
                <div className="cc-ins">
                  {insights.map((x, i) => (
                    <div key={i} className={`cc-ins__item cc-ins__item--${x.tone}`}>{x.text}</div>
                  ))}
                </div>
              </Panel>

              <div className="cc-grid2">
                <Panel
                  title="Status Breakdown"
                  hint="توزيع الحالات داخل الفترة"
                  right={<Badge tone="neutral">Clients</Badge>}
                >
                 type Tone = 'danger' | 'warning' | 'neutral' | 'info' | 'success';

const statusItems = [
  { label: translateStatus('lead'), value: metrics.lead, tone: 'info' },
  { label: translateStatus('reserved'), value: metrics.reserved, tone: 'warning' },
  { label: translateStatus('visited'), value: metrics.visited, tone: 'neutral' },
  { label: translateStatus('converted'), value: metrics.converted, tone: 'success' },
] satisfies { label: string; value: number; tone?: Tone }[];

<MiniBars items={statusItems.filter((x) => x.value > 0)} />
                </Panel>

                <Panel
                  title="Eligibility Mix"
                  hint="مستحق/غير مستحق"
                  right={<Badge tone="neutral">Risk</Badge>}
                >
                  <MiniBars
                    items={[
                      { label: 'مستحق', value: metrics.eligibleTrue, tone: 'success' },
                      { label: 'غير مستحق', value: metrics.eligibleFalse, tone: 'danger' },
                    ]}
                  />
                </Panel>
              </div>

              <div className="cc-grid2">
                <Panel
                  title="Distribution SLA"
                  hint="سرعة توزيع العملاء (من created_at إلى أول assigned_at)"
                  right={<Badge tone={assignmentSLA && assignmentSLA.medianHours <= 24 ? 'success' : 'warning'}>SLA</Badge>}
                >
                  {assignmentSLA ? (
                    <div className="cc-sla">
                      <div className="cc-sla__kpi">
                        <div className="cc-sla__k">Median</div>
                        <div className="cc-sla__v">{assignmentSLA.medianHours}h</div>
                      </div>
                      <div className="cc-sla__kpi">
                        <div className="cc-sla__k">Average</div>
                        <div className="cc-sla__v">{assignmentSLA.avgHours}h</div>
                      </div>
                      <div className="cc-sla__kpi">
                        <div className="cc-sla__k">≤ 24h</div>
                        <div className="cc-sla__v">{fmt(assignmentSLA.within24h)}</div>
                      </div>
                      <div className="cc-sla__kpi">
                        <div className="cc-sla__k">≤ 72h</div>
                        <div className="cc-sla__v">{fmt(assignmentSLA.within72h)}</div>
                      </div>
                      <div className="cc-sla__kpi">
                        <div className="cc-sla__k">Reassigned</div>
                        <div className="cc-sla__v">{fmt(assignmentSLA.reassignedClients)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="cc-muted">لا يوجد بيانات SLA.</div>
                  )}
                </Panel>

                <Panel
                  title="Activity Funnel on New Clients"
                  hint="قد إيه من العملاء الجدد اتعمل عليهم activity داخل نفس الفترة"
                  right={<Badge tone="info">Funnel</Badge>}
                >
                  <MiniBars
                    items={[
                      { label: 'أي نشاط', value: metrics.workedAny, tone: 'success' },
                      { label: 'Followups', value: metrics.workedByFollowups, tone: 'info' },
                      { label: 'Reservations', value: metrics.workedByReservations, tone: 'warning' },
                      { label: 'Reservation Notes', value: metrics.workedByReservationNotes, tone: 'neutral' },
                      { label: 'Visits', value: metrics.workedByVisits, tone: 'info' },
                      { label: 'Sales', value: metrics.workedBySales, tone: 'success' },
                    ].filter((x) => x.value > 0)}
                    maxLabel={200}
                  />
                </Panel>
              </div>

              <Panel
                title="Top Projects"
                hint="أكثر المشاريع اللي دخلها عملاء جدد خلال الفترة"
                right={<Badge tone="neutral">Top 10</Badge>}
              >
                {topProjectBars.length ? (
                  <MiniBars items={topProjectBars} maxLabel={260} />
                ) : (
                  <div className="cc-muted">لا يوجد بيانات مشاريع (أو العملاء بدون مشروع).</div>
                )}
              </Panel>

              <Panel
                title="Top Employees"
                hint="مين اشتغل أكتر على العملاء الجدد (Score + Conversion)"
                right={<Badge tone="info">Leaderboard</Badge>}
              >
                {topEmployees.length === 0 ? (
                  <div className="cc-muted">لا يوجد نشاط موظفين على العملاء الجدد داخل الفترة.</div>
                ) : (
                  <div className="cc-tableWrap">
                    <table className="cc-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>الموظف</th>
                          <th>Score</th>
                          <th>Assigned</th>
                          <th>Touched</th>
                          <th>Conv%</th>
                          <th>Followups</th>
                          <th>Reservations</th>
                          <th>Notes</th>
                          <th>Visits</th>
                          <th>Sales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topEmployees.map((r, idx) => (
                          <tr key={r.employee_id}>
                            <td>{idx + 1}</td>
                            <td><b>{r.employee_name}</b></td>
                            <td><b>{r.score}</b></td>
                            <td>{r.assignedClients}</td>
                            <td>{r.touchedUniqueClients}</td>
                            <td>{Math.round(r.conversionRate * 1000) / 10}%</td>
                            <td>{r.followups}</td>
                            <td>{r.reservations}</td>
                            <td>{r.reservationNotes}</td>
                            <td>{r.visits}</td>
                            <td>{r.sales}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="cc-foot">
                      Score = Followups×1 + Reservations×3 + Visits×2 + Notes×1 + Sales×6 + Assigned×0.25
                    </div>
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}

/* =====================
   Global CSS (pro)
===================== */

const globalCss = `
  .cc-page{ background:#f6f7fb; min-height:100vh; }
  .cc-wrap{ max-width:1280px; margin:0 auto; padding: 14px 14px 56px; }

  .cc-hero{
    background: radial-gradient(900px 420px at 70% -10%, rgba(99,102,241,.22), transparent 60%),
                radial-gradient(900px 420px at 10% 0%, rgba(14,165,233,.18), transparent 60%),
                linear-gradient(180deg, #0b1220 0%, #0b1220 60%, rgba(246,247,251,0) 100%);
    padding: 18px 0 10px;
    color:#fff;
  }
  .cc-hero__inner{ max-width:1280px; margin:0 auto; padding:0 14px; }
  .cc-hero__row{ display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:flex-start; }
  .cc-title{ margin:6px 0 0; font-size:24px; font-weight:900; letter-spacing:-.2px; }
  .cc-sub{ margin:8px 0 0; color: rgba(226,232,240,.84); max-width:820px; line-height:1.6; font-size:13px; }
  .cc-crumbs{ color: rgba(226,232,240,.80); font-size:12px; }
  .cc-badges{ margin-top:12px; display:flex; gap:8px; flex-wrap:wrap; }
  .cc-hero__actions{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; }

  .cc-badge{
    display:inline-flex; align-items:center; gap:6px;
    padding:6px 10px; border-radius:999px;
    font-size:12px; font-weight:900;
    border:1px solid rgba(226,232,240,.25);
    background: rgba(255,255,255,.10);
    color:#fff;
    backdrop-filter: blur(8px);
  }
  .cc-badge--neutral{ background: rgba(255,255,255,.10); }
  .cc-badge--info{ background: rgba(14,165,233,.18); border-color: rgba(14,165,233,.35); }
  .cc-badge--success{ background: rgba(34,197,94,.18); border-color: rgba(34,197,94,.35); }
  .cc-badge--warning{ background: rgba(245,158,11,.18); border-color: rgba(245,158,11,.35); }
  .cc-badge--danger{ background: rgba(239,68,68,.18); border-color: rgba(239,68,68,.35); }

  .cc-filters{ display:grid; grid-template-columns: repeat(3, minmax(220px,1fr)); gap:12px; }
  @media (max-width: 980px){ .cc-filters{ grid-template-columns: 1fr; } }
  .cc-field{ display:flex; flex-direction:column; gap:6px; }
  .cc-label{ font-size:12px; font-weight:900; color:#334155; }
  .cc-input{
    width:100%;
    padding:10px 12px;
    border-radius:14px;
    border:1px solid rgba(226,232,240,.95);
    background: rgba(255,255,255,.95);
    font-weight:800;
    color:#0f172a;
    outline:none;
  }
  .cc-input:focus{
    border-color: rgba(99,102,241,.45);
    box-shadow: 0 0 0 4px rgba(99,102,241,.12);
  }
  .cc-hint{ font-size:12px; color:#64748b; }

  .cc-actions{
    grid-column: span 3;
    display:flex; align-items:center; justify-content:space-between;
    gap: 12px; flex-wrap:wrap;
    margin-top: 6px;
  }
  @media (max-width: 980px){ .cc-actions{ grid-column: span 1; } }
  .cc-quick{ display:flex; gap:8px; flex-wrap:wrap; }
  .cc-chip{
    border:1px solid rgba(226,232,240,.95);
    background: rgba(255,255,255,.95);
    padding:8px 10px;
    border-radius:999px;
    font-weight:900;
    font-size:12px;
    cursor:pointer;
    color:#0f172a;
    transition: transform .12s ease, box-shadow .12s ease;
  }
  .cc-chip:hover{ transform: translateY(-1px); box-shadow: 0 12px 26px rgba(2,6,23,.08); }
  .cc-cta{ display:flex; gap:10px; flex-wrap:wrap; }

  .cc-debug{
    margin-top: 12px;
    padding: 12px;
    background: #0b1220;
    color: rgba(226,232,240,.95);
    border-radius: 14px;
    border: 1px solid rgba(148,163,184,.2);
    font-size: 12px;
    white-space: pre-wrap;
    overflow:auto;
    max-height: 260px;
  }

  .cc-empty{
    margin-top: 12px;
    background: rgba(255,255,255,.95);
    border: 1px dashed rgba(148,163,184,.6);
    border-radius: 16px;
    padding: 28px;
    text-align:center;
    box-shadow: 0 10px 24px rgba(2,6,23,.08);
  }
  .cc-empty__icon{ font-size:30px; }
  .cc-empty__title{ margin-top:8px; font-weight:900; color:#0f172a; }
  .cc-empty__sub{ margin-top:6px; color:#64748b; font-size:12px; }

  .cc-kpis{
    display:grid;
    grid-template-columns: repeat(4, minmax(220px,1fr));
    gap:12px;
    margin-top: 12px;
    margin-bottom: 12px;
  }
  @media (max-width: 1100px){ .cc-kpis{ grid-template-columns: repeat(2, minmax(220px,1fr)); } }
  @media (max-width: 620px){ .cc-kpis{ grid-template-columns: 1fr; } }

  .cc-kpi{
    background: rgba(255,255,255,.95);
    border: 1px solid rgba(226,232,240,.95);
    border-radius: 16px;
    box-shadow: 0 10px 24px rgba(2,6,23,.08);
    padding: 14px;
    display:flex;
    gap: 12px;
    align-items:flex-start;
  }
  .cc-kpi__icon{
    width: 44px; height: 44px;
    border-radius: 14px;
    display:flex; align-items:center; justify-content:center;
    font-size: 18px;
    border: 1px solid rgba(226,232,240,.95);
    background: rgba(248,250,252,.9);
  }
  .cc-kpi__icon--info{ background: rgba(14,165,233,.12); border-color: rgba(14,165,233,.25); }
  .cc-kpi__icon--success{ background: rgba(34,197,94,.12); border-color: rgba(34,197,94,.25); }
  .cc-kpi__icon--warning{ background: rgba(245,158,11,.12); border-color: rgba(245,158,11,.25); }
  .cc-kpi__icon--danger{ background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.25); }
  .cc-kpi__title{ font-size: 12px; color: #64748b; font-weight: 900; }
  .cc-kpi__value{ margin-top: 6px; font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -.2px; }
  .cc-kpi__sub{ margin-top: 6px; font-size: 12px; color: #64748b; line-height: 1.4; }

  .cc-panel{
    background: rgba(255,255,255,.95);
    border: 1px solid rgba(226,232,240,.95);
    border-radius: 16px;
    box-shadow: 0 10px 24px rgba(2,6,23,.08);
    overflow:hidden;
    margin-top: 12px;
  }
  .cc-panel__head{
    padding: 14px;
    display:flex; justify-content:space-between; align-items:flex-start;
    border-bottom: 1px solid rgba(226,232,240,.85);
    background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(255,255,255,.92));
  }
  .cc-panel__title{ font-weight: 900; color:#0f172a; font-size:14px; }
  .cc-panel__hint{ margin-top:4px; color:#64748b; font-size:12px; line-height:1.5; }
  .cc-panel__body{ padding: 14px; }
  .cc-muted{ padding: 12px; color:#64748b; font-size:12px; }

  .cc-grid2{ display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 980px){ .cc-grid2{ grid-template-columns: 1fr; } }

  .cc-bars{ display:flex; flex-direction:column; gap:10px; }
  .cc-bars__row{ display:flex; gap:10px; align-items:center; }
  .cc-bars__label{
    width: 260px;
    font-size: 12px;
    font-weight: 900;
    color: #334155;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cc-bars__track{
    flex:1; height: 12px;
    border-radius: 999px;
    background: #eef2f7;
    overflow:hidden;
    border: 1px solid rgba(226,232,240,.9);
  }
  .cc-bars__fill{ height:100%; border-radius: 999px; }
  .cc-bars__fill--neutral{ background:#111827; }
  .cc-bars__fill--info{ background: linear-gradient(90deg, #0ea5e9, #6366f1); }
  .cc-bars__fill--success{ background: linear-gradient(90deg, #22c55e, #16a34a); }
  .cc-bars__fill--warning{ background: linear-gradient(90deg, #f59e0b, #f97316); }
  .cc-bars__fill--danger{ background: linear-gradient(90deg, #ef4444, #f43f5e); }
  .cc-bars__val{ width: 56px; text-align:left; font-weight:900; color:#0f172a; font-size:12px; }

  .cc-ins{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  @media (max-width: 980px){ .cc-ins{ grid-template-columns: 1fr; } }
  .cc-ins__item{
    border: 1px solid rgba(226,232,240,.95);
    border-radius: 14px;
    padding: 12px;
    background: rgba(248,250,252,.75);
    font-weight: 900;
    color:#0f172a;
  }
  .cc-ins__item--success{ border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.10); }
  .cc-ins__item--warning{ border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.10); }
  .cc-ins__item--danger{ border-color: rgba(239,68,68,.35); background: rgba(239,68,68,.10); }
  .cc-ins__item--info{ border-color: rgba(14,165,233,.35); background: rgba(14,165,233,.10); }

  .cc-sla{
    display:grid;
    grid-template-columns: repeat(5, minmax(120px, 1fr));
    gap: 10px;
  }
  @media (max-width: 980px){ .cc-sla{ grid-template-columns: repeat(2, minmax(120px, 1fr)); } }
  .cc-sla__kpi{
    border: 1px solid rgba(226,232,240,.95);
    border-radius: 14px;
    padding: 12px;
    background: rgba(248,250,252,.75);
  }
  .cc-sla__k{ font-size: 12px; color:#64748b; font-weight:900; }
  .cc-sla__v{ margin-top: 6px; font-size: 18px; color:#0f172a; font-weight: 900; }

  .cc-tableWrap{
    border: 1px solid rgba(226,232,240,.95);
    border-radius: 16px;
    overflow:auto;
    background:#fff;
  }
  .cc-table{ width:100%; border-collapse: separate; border-spacing:0; min-width: 980px; }
  .cc-table thead th{
    position: sticky; top:0; z-index:1;
    background:#f8fafc;
    border-bottom: 1px solid rgba(226,232,240,.95);
    font-size:12px; font-weight:900; color:#334155;
    text-align:right;
    padding:12px;
    white-space: nowrap;
  }
  .cc-table tbody td{
    border-bottom: 1px solid rgba(241,245,249,.95);
    font-size:13px; color:#0f172a;
    padding:12px;
    text-align:right;
    white-space: nowrap;
  }
  .cc-foot{
    padding: 10px 12px;
    font-size: 12px;
    color:#64748b;
    background:#f8fafc;
    border-top: 1px solid rgba(226,232,240,.85);
  }
` as const;