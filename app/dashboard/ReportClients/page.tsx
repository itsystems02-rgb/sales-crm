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
  score: number;
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

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [topEmployees, setTopEmployees] = useState<EmployeeImpactRow[]>([]);
  const [debug, setDebug] = useState<string>('');

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

  async function fetchAssignmentsForClients(clientIds: string[]) {
    const assignedClientSet = new Set<string>();
    const assignedByEmployee = new Map<string, number>();

    const chunks = chunkArray(clientIds, 500);
    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('client_assignments')
        .select('client_id, employee_id')
        .in('client_id', ch);

      if (error) throw error;

      (data || []).forEach((r: any) => {
        if (!r?.client_id) return;
        assignedClientSet.add(r.client_id);
        if (r.employee_id) assignedByEmployee.set(r.employee_id, (assignedByEmployee.get(r.employee_id) || 0) + 1);
      });
    }

    return { assignedClientSet, assignedByEmployee };
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

        followups.set(eid, (followups.get(eid) || 0) + 1);
        if (!touchedClients.has(eid)) touchedClients.set(eid, new Set());
        touchedClients.get(eid)!.add(cid);
      });
    }

    // Reservations (employee_id)
    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('reservations')
        .select('employee_id, client_id, created_at')
        .in('client_id', ch)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive);

      if (error) throw error;

      (data || []).forEach((r: any) => {
        const eid = r.employee_id;
        const cid = r.client_id;
        if (!eid || !cid) return;

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

        sales.set(eid, (sales.get(eid) || 0) + 1);
        if (!touchedClients.has(eid)) touchedClients.set(eid, new Set());
        touchedClients.get(eid)!.add(cid);
      });
    }

    // Reservation notes:
    // reservation_notes has reservation_id, created_by (employee), but no client_id.
    // We map reservation_id -> client_id using reservations.
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
            if (!touchedClients.has(eid)) touchedClients.set(eid, new Set());
            touchedClients.get(eid)!.add(cid);
          }
        });
      }
    }

    return { followups, reservations, visits, sales, reservationNotes, touchedClients };
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
        });
        setDebug((p) => p + '\n✅ لا يوجد عملاء تم إضافتهم في هذه الفترة');
        return;
      }

      const clientIds = createdClients.map((c) => c.id);

      const lead = createdClients.filter((c) => c.status === 'lead').length;
      const reserved = createdClients.filter((c) => c.status === 'reserved').length;
      const visited = createdClients.filter((c) => c.status === 'visited').length;
      const converted = createdClients.filter((c) => c.status === 'converted').length;

      const editedWithinRange = computeEditedCount(createdClients, startISO, endISOExclusive);

      setDebug((p) => p + '\n🔄 حساب التوزيع (متوزع/غير متوزع)...');
      const { assignedClientSet, assignedByEmployee } = await fetchAssignmentsForClients(clientIds);
      const assigned = assignedClientSet.size;
      const unassigned = createdClients.length - assigned;
      const distributionRate = createdClients.length ? (assigned / createdClients.length) * 100 : 0;

      setDebug((p) => p + '\n🔄 حساب نشاط الموظفين على العملاء الجدد...');
      const { followups, reservations, visits, sales, reservationNotes, touchedClients } =
        await fetchEmployeeActivityOnClients(clientIds, startISO, endISOExclusive);

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

        // Score weights (عملية ومحترمة):
        // البيع أعلى وزن، بعده الحجز، الزيارة، المتابعة، ملاحظات الحجز
        const score = Math.round(f * 1 + r * 3 + v * 2 + rn * 1 + s * 6 + assignedClients * 0.25);

        return {
          employee_id: eid,
          employee_name: e?.name || 'غير معروف',
          assignedClients,
          followups: f,
          reservations: r,
          visits: v,
          sales: s,
          reservationNotes: rn,
          touchedUniqueClients: touched,
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
      });

      setTopEmployees(rows.slice(0, 10));

      setDebug(
        (p) =>
          p +
          `\n✅ تم: Clients=${createdClients.length} | Assigned=${assigned} | Edited=${editedWithinRange}\n✅ Top: ${
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
     UI
  ===================== */

  if (loading) {
    return (
      <RequireAuth>
        <div className="page">
          <Card title="تقرير إضافة العملاء">
            <div style={{ padding: 14 }}>جاري التحميل...</div>
          </Card>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="page">
        <Card title="تقرير إضافة العملاء (حسب تاريخ الإضافة)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
            <div style={{ minWidth: 200 }}>
              <label style={lbl}>من تاريخ</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                style={inp}
              />
            </div>

            <div style={{ minWidth: 200 }}>
              <label style={lbl}>إلى تاريخ</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                style={inp}
              />
            </div>

            <div style={{ minWidth: 260 }}>
              <label style={lbl}>المشروع (اختياري)</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inp}>
                <option value="all">كل المشاريع</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.name} (${p.code})` : p.name}
                  </option>
                ))}
              </select>

              {currentEmployee?.role === 'sales_manager' ? (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                  نطاقك: {myAllowedProjects.length ? `${myAllowedProjects.length} مشروع` : 'لا يوجد مشاريع مفعّلة لك'}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button onClick={generateReport} disabled={generating}>
                {generating ? 'جاري التوليد...' : '⚡ توليد التقرير'}
              </Button>

              <Button onClick={() => router.push('/dashboard')} variant="secondary">
                رجوع
              </Button>
            </div>
          </div>

          {debug ? <pre style={debugBox}>{debug}</pre> : null}
        </Card>

        {metrics && (
          <>
            <Card title="ملخص الفترة (KPIs)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                <div style={kpi}>
                  <div style={kpiTitle}>إجمالي العملاء المضافين</div>
                  <div style={kpiValue}>{metrics.totalCreated.toLocaleString('ar-EG')}</div>
                  <div style={kpiSub}>Clients created in range</div>
                </div>

                <div style={kpi}>
                  <div style={kpiTitle}>موزعين</div>
                  <div style={kpiValue}>{metrics.assigned.toLocaleString('ar-EG')}</div>
                  <div style={kpiSub}>
                    نسبة التوزيع: <b>{pct(metrics.distributionRate)}</b>
                  </div>
                </div>

                <div style={kpi}>
                  <div style={kpiTitle}>غير موزعين</div>
                  <div style={kpiValue}>{metrics.unassigned.toLocaleString('ar-EG')}</div>
                  <div style={kpiSub}>Unassigned leads</div>
                </div>

                <div style={kpi}>
                  <div style={kpiTitle}>تم تعديلهم داخل الفترة</div>
                  <div style={kpiValue}>{metrics.editedWithinRange.toLocaleString('ar-EG')}</div>
                  <div style={kpiSub}>updated_at within range</div>
                </div>
              </div>
            </Card>

            <Card title="حالات العملاء (Status Breakdown)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={mini}>
                  <div style={miniTitle}>{translateStatus('lead')}</div>
                  <div style={miniValue}>{metrics.lead.toLocaleString('ar-EG')}</div>
                </div>
                <div style={mini}>
                  <div style={miniTitle}>{translateStatus('reserved')}</div>
                  <div style={miniValue}>{metrics.reserved.toLocaleString('ar-EG')}</div>
                </div>
                <div style={mini}>
                  <div style={miniTitle}>{translateStatus('visited')}</div>
                  <div style={miniValue}>{metrics.visited.toLocaleString('ar-EG')}</div>
                </div>
                <div style={mini}>
                  <div style={miniTitle}>{translateStatus('converted')}</div>
                  <div style={miniValue}>{metrics.converted.toLocaleString('ar-EG')}</div>
                </div>
              </div>
            </Card>

            <Card title="Top Employees — مين اشتغل أكتر على العملاء الجدد؟">
              {topEmployees.length === 0 ? (
                <div style={{ padding: 14, color: '#6b7280' }}>لا يوجد نشاط موظفين على العملاء الجدد داخل الفترة.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={th}>#</th>
                        <th style={th}>الموظف</th>
                        <th style={th}>Score</th>
                        <th style={th}>Clients Assigned</th>
                        <th style={th}>Followups</th>
                        <th style={th}>Reservations</th>
                        <th style={th}>Reservation Notes</th>
                        <th style={th}>Visits</th>
                        <th style={th}>Sales</th>
                        <th style={th}>Unique Clients Touched</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topEmployees.map((r, idx) => (
                        <tr key={r.employee_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={td}>{idx + 1}</td>
                          <td style={td}><b>{r.employee_name}</b></td>
                          <td style={td}><b>{r.score}</b></td>
                          <td style={td}>{r.assignedClients}</td>
                          <td style={td}>{r.followups}</td>
                          <td style={td}>{r.reservations}</td>
                          <td style={td}>{r.reservationNotes}</td>
                          <td style={td}>{r.visits}</td>
                          <td style={td}>{r.sales}</td>
                          <td style={td}>{r.touchedUniqueClients}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ padding: 10, fontSize: 12, color: '#6b7280' }}>
                    * Score = Followups×1 + Reservations×3 + Visits×2 + Notes×1 + Sales×6 + Assigned×0.25
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </RequireAuth>
  );
}

/* =====================
   Styles
===================== */

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 6 };

const inp: React.CSSProperties = {
  width: '100%',
  padding: 10,
  borderRadius: 10,
  border: '1px solid #e5e7eb',
};

const debugBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: '#0b1220',
  color: '#e5e7eb',
  borderRadius: 12,
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
};

const kpi: React.CSSProperties = {
  padding: 14,
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: 'white',
};

const kpiTitle: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 800 };
const kpiValue: React.CSSProperties = { fontSize: 26, fontWeight: 900, color: '#0f172a', marginTop: 6 };
const kpiSub: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginTop: 6 };

const mini: React.CSSProperties = {
  padding: 14,
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: '#f9fafb',
};

const miniTitle: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 900 };
const miniValue: React.CSSProperties = { fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 6 };

const th: React.CSSProperties = {
  textAlign: 'right',
  padding: 12,
  fontSize: 12,
  fontWeight: 900,
  color: '#334155',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  textAlign: 'right',
  padding: 12,
  fontSize: 13,
  color: '#0f172a',
  whiteSpace: 'nowrap',
};