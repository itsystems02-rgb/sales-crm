'use client';

import { useEffect, useMemo, useState } from 'react';
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

type ClientCreationMetrics = {
  totalCreated: number;

  assigned: number;
  unassigned: number;
  distributionRate: number;

  editedWithinRange: number;

  statusLead: number;
  statusReserved: number;
  statusVisited: number;
  statusConverted: number;
};

type EmployeeImpactRow = {
  employee_id: string;
  employee_name: string;

  assignedClients: number;

  followups: number;
  reservations: number;
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
    await new Promise((r) => setTimeout(r, 70));
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

function safeNum(n: any) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v : 0;
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

  const [metrics, setMetrics] = useState<ClientCreationMetrics | null>(null);
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
     Fetch + Generate
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

      // project filter
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
    const byEmployee = new Map<string, number>();

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

        if (r.employee_id) byEmployee.set(r.employee_id, (byEmployee.get(r.employee_id) || 0) + 1);
      });
    }

    return { assignedClientSet, assignedByEmployee: byEmployee };
  }

  async function fetchEmployeeActivityCountsOnClients(
    clientIds: string[],
    startISO: string,
    endISOExclusive: string
  ) {
    // maps employee_id -> count
    const followups = new Map<string, number>();
    const reservations = new Map<string, number>();
    const visits = new Map<string, number>();
    const sales = new Map<string, number>();

    // for unique touched clients per employee
    const touchedClients = new Map<string, Set<string>>();

    const chunks = chunkArray(clientIds, 500);

    // Followups
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

    // Reservations
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

    // Visits
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

    // Sales
    // ⚠️ IMPORTANT: This assumes sales employee column is "sales_employee_id"
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

    return { followups, reservations, visits, sales, touchedClients };
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
          statusLead: 0,
          statusReserved: 0,
          statusVisited: 0,
          statusConverted: 0,
        });
        setDebug((p) => p + '\n✅ لا يوجد عملاء تم إضافتهم في هذه الفترة');
        return;
      }

      const clientIds = createdClients.map((c) => c.id);

      // status buckets
      const statusLead = createdClients.filter((c) => c.status === 'lead').length;
      const statusReserved = createdClients.filter((c) => c.status === 'reserved').length;
      const statusVisited = createdClients.filter((c) => c.status === 'visited').length;
      const statusConverted = createdClients.filter((c) => c.status === 'converted').length;

      // edited count
      const editedWithinRange = computeEditedCount(createdClients, startISO, endISOExclusive);

      // assignments
      setDebug((p) => p + '\n🔄 حساب (متوزع/غير متوزع)...');
      const { assignedClientSet, assignedByEmployee } = await fetchAssignmentsForClients(clientIds);
      const assigned = assignedClientSet.size;
      const unassigned = createdClients.length - assigned;
      const distributionRate = createdClients.length ? (assigned / createdClients.length) * 100 : 0;

      // employee activity
      setDebug((p) => p + '\n🔄 حساب نشاط الموظفين على العملاء الجدد...');
      const { followups, reservations, visits, sales, touchedClients } = await fetchEmployeeActivityCountsOnClients(
        clientIds,
        startISO,
        endISOExclusive
      );

      // build employee ranking
      const empMap = new Map<string, Employee>();
      employees.forEach((e) => empMap.set(e.id, e));

      const allEmployeeIds = new Set<string>();
      [assignedByEmployee, followups, reservations, visits, sales].forEach((m) => {
        for (const k of m.keys()) allEmployeeIds.add(k);
      });

      const rows: EmployeeImpactRow[] = Array.from(allEmployeeIds).map((eid) => {
        const e = empMap.get(eid);
        const assignedClients = assignedByEmployee.get(eid) || 0;

        const f = followups.get(eid) || 0;
        const r = reservations.get(eid) || 0;
        const v = visits.get(eid) || 0;
        const s = sales.get(eid) || 0;

        const touched = touchedClients.get(eid)?.size || 0;

        // ✅ “Score” عملي: البيع أعلى وزن، الحجز/زيارة متوسط، المتابعة أقل
        // تقدر تغيّر الأوزان بسهولة
        const score = Math.round(f * 1 + r * 2 + v * 2 + s * 5 + assignedClients * 0.5);

        return {
          employee_id: eid,
          employee_name: e?.name || 'غير معروف',
          assignedClients,
          followups: f,
          reservations: r,
          visits: v,
          sales: s,
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
        statusLead,
        statusReserved,
        statusVisited,
        statusConverted,
      });

      setTopEmployees(rows.slice(0, 10));

      setDebug(
        (p) =>
          p +
          `\n✅ تم: Clients=${createdClients.length} | Assigned=${assigned} | Edited=${editedWithinRange}\n✅ Top employee: ${
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

  const canChooseProject = true;

  return (
    <RequireAuth>
      <div className="page">
        <Card title="تقرير إضافة العملاء (Clients Created Report)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
            <div style={{ minWidth: 200 }}>
              <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 6 }}>من تاريخ</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />
            </div>

            <div style={{ minWidth: 200 }}>
              <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 6 }}>إلى تاريخ</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              />
            </div>

            {canChooseProject && (
              <div style={{ minWidth: 240 }}>
                <label style={{ fontSize: 12, fontWeight: 800, display: 'block', marginBottom: 6 }}>المشروع</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
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
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button onClick={generateReport} disabled={generating}>
                {generating ? 'جاري التوليد...' : '⚡ توليد التقرير'}
              </Button>

              <Button onClick={() => router.push('/dashboard')} variant="secondary">
                رجوع
              </Button>
            </div>
          </div>

          {debug ? (
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                background: '#0b1220',
                color: '#e5e7eb',
                borderRadius: 12,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                overflowX: 'auto',
              }}
            >
              {debug}
            </pre>
          ) : null}
        </Card>

        {metrics && (
          <>
            <Card title="ملخص الفترة">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                <div style={kpiStyle}>
                  <div style={kpiTitle}>إجمالي العملاء المضافين</div>
                  <div style={kpiValue}>{metrics.totalCreated.toLocaleString('ar-EG')}</div>
                  <div style={kpiSub}>Clients created in range</div>
                </div>

                <div style={kpiStyle}>
                  <div style={kpiTitle}>الموزعين</div>
                  <div style={kpiValue}>{metrics.assigned.toLocaleString('ar-EG')}</div>
                  <div style={kpiSub}>
                    نسبة التوزيع: <b>{pct(metrics.distributionRate)}</b>
                  </div>
                </div>

                <div style={kpiStyle}>
                  <div style={kpiTitle}>غير موزعين</div>
                  <div style={kpiValue}>{metrics.unassigned.toLocaleString('ar-EG')}</div>
                  <div style={kpiSub}>Unassigned leads</div>
                </div>

                <div style={kpiStyle}>
                  <div style={kpiTitle}>تم تعديلهم داخل الفترة</div>
                  <div style={kpiValue}>{metrics.editedWithinRange.toLocaleString('ar-EG')}</div>
                  <div style={kpiSub}>Updated within range</div>
                </div>
              </div>
            </Card>

            <Card title="حالات العملاء داخل الفترة (Status Breakdown)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={miniStyle}>
                  <div style={miniTitle}>متابعة</div>
                  <div style={miniValue}>{metrics.statusLead.toLocaleString('ar-EG')}</div>
                </div>
                <div style={miniStyle}>
                  <div style={miniTitle}>حجز</div>
                  <div style={miniValue}>{metrics.statusReserved.toLocaleString('ar-EG')}</div>
                </div>
                <div style={miniStyle}>
                  <div style={miniTitle}>زيارة</div>
                  <div style={miniValue}>{metrics.statusVisited.toLocaleString('ar-EG')}</div>
                </div>
                <div style={miniStyle}>
                  <div style={miniTitle}>بيع</div>
                  <div style={miniValue}>{metrics.statusConverted.toLocaleString('ar-EG')}</div>
                </div>
              </div>
            </Card>

            <Card title="Top Employees — مين اشتغل أكتر على العملاء الجدد؟">
              {topEmployees.length === 0 ? (
                <div style={{ padding: 14, color: '#6b7280' }}>لا يوجد نشاط موظفين على العملاء الجدد داخل الفترة.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={th}>الترتيب</th>
                        <th style={th}>الموظف</th>
                        <th style={th}>Score</th>
                        <th style={th}>عملاء تم تعيينهم</th>
                        <th style={th}>متابعات</th>
                        <th style={th}>حجوزات</th>
                        <th style={th}>زيارات</th>
                        <th style={th}>مبيعات</th>
                        <th style={th}>عملاء فريدين تم لمسهم</th>
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
                          <td style={td}>{r.visits}</td>
                          <td style={td}>{r.sales}</td>
                          <td style={td}>{r.touchedUniqueClients}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ padding: 10, fontSize: 12, color: '#6b7280' }}>
                    * Score = (Followups×1) + (Reservations×2) + (Visits×2) + (Sales×5) + (Assigned×0.5)
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
   UI styles (simple + pro)
===================== */

const kpiStyle: React.CSSProperties = {
  padding: 14,
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: 'white',
};

const kpiTitle: React.CSSProperties = { fontSize: 12, color: '#6b7280', fontWeight: 800 };
const kpiValue: React.CSSProperties = { fontSize: 26, fontWeight: 900, color: '#0f172a', marginTop: 6 };
const kpiSub: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginTop: 6 };

const miniStyle: React.CSSProperties = {
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
};

const td: React.CSSProperties = {
  textAlign: 'right',
  padding: 12,
  fontSize: 13,
  color: '#0f172a',
};