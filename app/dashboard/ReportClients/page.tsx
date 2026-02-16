'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/* =====================
   Types
===================== */
type Role = 'admin' | 'sales' | 'sales_manager' | 'manager' | string;

type Employee = {
  id: string;
  name: string;
  role: Role;
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
  eligible: boolean;
  status: string;
  interested_in_project_id: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ClientMetrics = {
  totalClients: number;

  assignedClients: number;
  unassignedClients: number;
  distributionRate: number; // %

  workedClients: number;
  workedByFollowups: number;
  workedByReservations: number;
  workedBySales: number;
  workedByReservationNotes: number;
  workedByVisits: number;

  editedClients: number;

  statusCounts: Record<string, number>;
};

type WorkedSets = {
  followups: Set<string>;
  reservations: Set<string>;
  sales: Set<string>;
  reservationNotes: Set<string>;
  visits: Set<string>;
  union: Set<string>;
};

/* =====================
   Utils
===================== */
function buildIsoRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000`);
  const end = new Date(`${endDate}T00:00:00.000`);
  end.setDate(end.getDate() + 1); // exclusive
  return {
    startISO: start.toISOString(),
    endISOExclusive: end.toISOString(),
  };
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * ✅ Pagination helper (زي اللي عندك)
 */
async function fetchAllPaged<T>(queryFactory: (from: number, to: number) => any): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  let all: T[] = [];

  while (true) {
    const res = await queryFactory(from, from + pageSize - 1);
    const { data, error } = res || {};

    if (error) {
      console.error('Paged fetch error:', error);
      break;
    }

    const batch = (data || []) as T[];
    all = all.concat(batch);

    if (batch.length < pageSize) break;

    from += pageSize;
    await new Promise((r) => setTimeout(r, 60));
  }

  return all;
}

function safeText(v: any) {
  return (v ?? '').toString();
}

function translateStatus(status: string) {
  switch (status) {
    case 'lead':
      return 'متابعة';
    case 'reserved':
      return 'محجوز';
    case 'visited':
      return 'تمت الزيارة';
    case 'converted':
      return 'تم البيع';
    default:
      return status;
  }
}

/* =====================
   Page
===================== */
export default function ClientsReportPage() {
  const router = useRouter();

  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: todayStr,
    end: todayStr,
  });

  // employees filter (الموظف أو الكل)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');

  // sales_manager scope
  const [myAllowedProjects, setMyAllowedProjects] = useState<Project[]>([]);
  const myAllowedProjectIds = useMemo(() => myAllowedProjects.map((p) => p.id), [myAllowedProjects]);

  // projects dropdown
  const [filterProjects, setFilterProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('all');

  // UI / results
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [metrics, setMetrics] = useState<ClientMetrics | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [workedSets, setWorkedSets] = useState<WorkedSets | null>(null);

  const [showClients, setShowClients] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const [searchTerm, setSearchTerm] = useState('');

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      setDebugInfo('🔄 جاري تهيئة تقرير العملاء...');

      const emp = await getCurrentEmployee();
      if (!emp) {
        router.push('/login');
        return;
      }

      // ✅ صلاحيات التقرير
      if (emp.role !== 'admin' && emp.role !== 'sales_manager') {
        alert('غير مصرح لك بالوصول إلى تقرير العملاء');
        router.push('/dashboard');
        return;
      }

      setCurrentEmployee(emp);
      setDebugInfo((p) => p + `\n✅ المستخدم: ${emp.name} (${emp.role})`);

      const allowedProjects = await loadMyAllowedProjects(emp);
      await loadEmployees(emp, allowedProjects.map((p) => p.id));
      await loadFilterProjects(emp, allowedProjects);

      setLoading(false);
      setDebugInfo((p) => p + '\n✅ تم تهيئة الصفحة بنجاح');
    } catch (err: any) {
      console.error(err);
      setDebugInfo(`❌ خطأ غير متوقع: ${err?.message || err}`);
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

    const ids = (rows || []).map((r) => (r as any).project_id).filter(Boolean);
    if (ids.length === 0) {
      setMyAllowedProjects([]);
      return [];
    }

    const { data: projects, error: pErr } = await supabase.from('projects').select('id,name,code').in('id', ids).order('name');

    if (pErr) throw pErr;

    setMyAllowedProjects(projects || []);
    return projects || [];
  }

  async function loadEmployees(emp: Employee, allowedProjectIds: string[]) {
    // Admin: كل الموظفين
    if (emp.role === 'admin') {
      const { data, error } = await supabase
        .from('employees')
        .select('id,name,role')
        .in('role', ['sales', 'sales_manager'])
        .order('name', { ascending: true });

      if (error) throw error;

      setEmployees((data || []).map((e: any) => ({ id: e.id, name: e.name || 'غير معروف', role: e.role })));
      return;
    }

    // Sales manager: الموظفين ضمن نطاق مشاريعه
    if (allowedProjectIds.length === 0) {
      setEmployees([]);
      return;
    }

    const { data: epRows, error: epErr } = await supabase.from('employee_projects').select('employee_id').in('project_id', allowedProjectIds);

    if (epErr) throw epErr;

    const employeeIds = Array.from(new Set((epRows || []).map((r: any) => r.employee_id).filter(Boolean)));

    if (employeeIds.length === 0) {
      setEmployees([]);
      return;
    }

    const { data: emps, error: eErr } = await supabase
      .from('employees')
      .select('id,name,role')
      .in('id', employeeIds)
      .in('role', ['sales', 'sales_manager'])
      .order('name', { ascending: true });

    if (eErr) throw eErr;

    setEmployees((emps || []).map((e: any) => ({ id: e.id, name: e.name || 'غير معروف', role: e.role })));
  }

  async function loadFilterProjects(emp: Employee, allowedProjects: Project[]) {
    if (emp.role === 'admin') {
      const { data, error } = await supabase.from('projects').select('id,name,code').order('name');
      if (error) throw error;
      setFilterProjects(data || []);
      return;
    }
    setFilterProjects(allowedProjects || []);
  }

  /* =====================
     Report core
  ===================== */
  async function fetchClientsInRange(startISO: string, endISOExclusive: string): Promise<ClientRow[]> {
    const rows = await fetchAllPaged<any>((from, to) => {
      let q = supabase
        .from('clients')
        .select('id,name,mobile,eligible,status,interested_in_project_id,created_at,updated_at')
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (currentEmployee?.role === 'sales_manager') {
        if (myAllowedProjectIds.length === 0) return supabase.from('clients').select('id').limit(0);
        q = q.in('interested_in_project_id', myAllowedProjectIds);
      }

      if (projectId !== 'all') {
        q = q.eq('interested_in_project_id', projectId);
      }

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
    // Map client_id -> Set employee_ids
    const map = new Map<string, Set<string>>();
    const chunks = chunkArray(clientIds, 500);

    for (const ch of chunks) {
      const { data, error } = await supabase.from('client_assignments').select('client_id, employee_id').in('client_id', ch);
      if (error) throw error;

      for (const r of data || []) {
        const cid = (r as any).client_id as string;
        const eid = (r as any).employee_id as string;
        if (!map.has(cid)) map.set(cid, new Set());
        map.get(cid)!.add(eid);
      }
    }

    return map;
  }

  async function distinctClientIdsFromTableInRange(
    table: string,
    clientIds: string[],
    startISO: string,
    endISOExclusive: string,
    clientCol = 'client_id'
  ) {
    const out = new Set<string>();
    const chunks = chunkArray(clientIds, 500);

    for (const ch of chunks) {
      const { data, error } = await supabase
        .from(table)
        .select(`${clientCol},created_at`)
        .in(clientCol, ch)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive);

      if (error) throw error;
      (data || []).forEach((r: any) => out.add(r[clientCol]));
    }

    return out;
  }

  /**
   * ✅ FIX: reservation_notes لا يحتوي client_id
   * نحسب العملاء عن طريق:
   * reservation_notes.reservation_id -> reservations.id -> reservations.client_id
   */
  async function distinctClientsFromReservationNotesInRange(clientIds: string[], startISO: string, endISOExclusive: string) {
    // 1) هات reservation ids الخاصة بالعملاء
    const resIdToClientId = new Map<string, string>();
    const reservationIds: string[] = [];

    const clientChunks = chunkArray(clientIds, 500);
    for (const ch of clientChunks) {
      const { data, error } = await supabase.from('reservations').select('id, client_id').in('client_id', ch);
      if (error) throw error;

      (data || []).forEach((r: any) => {
        if (!r?.id || !r?.client_id) return;
        reservationIds.push(r.id);
        resIdToClientId.set(r.id, r.client_id);
      });
    }

    if (reservationIds.length === 0) return new Set<string>();

    // 2) هات notes خلال الفترة على reservations دي
    const out = new Set<string>();
    const resChunks = chunkArray(reservationIds, 500);

    for (const rch of resChunks) {
      let q = supabase
        .from('reservation_notes')
        .select('reservation_id, created_at')
        .in('reservation_id', rch)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive);

      // لو التقرير مختار موظف (مش الكل) وعايز notes بتاعته فقط:
      // لو تحب ده فعلاً، فعّل السطرين دول.
      // if (selectedEmployeeId !== 'all') q = q.eq('created_by', selectedEmployeeId);

      const { data, error } = await q;
      if (error) throw error;

      (data || []).forEach((n: any) => {
        const cid = resIdToClientId.get(n.reservation_id);
        if (cid) out.add(cid);
      });
    }

    return out;
  }

  async function fetchWorkedSets(clientIds: string[], startISO: string, endISOExclusive: string): Promise<WorkedSets> {
    const [followups, sales, visits] = await Promise.all([
      distinctClientIdsFromTableInRange('client_followups', clientIds, startISO, endISOExclusive, 'client_id'),
      distinctClientIdsFromTableInRange('sales', clientIds, startISO, endISOExclusive, 'client_id'),
      distinctClientIdsFromTableInRange('visits', clientIds, startISO, endISOExclusive, 'client_id'),
    ]);

    const reservations = await distinctClientIdsFromTableInRange('reservations', clientIds, startISO, endISOExclusive, 'client_id');

    // ✅ هنا التعديل الحقيقي
    const reservationNotes = await distinctClientsFromReservationNotesInRange(clientIds, startISO, endISOExclusive);

    const union = new Set<string>();
    [followups, sales, visits, reservations, reservationNotes].forEach((s) => s.forEach((id) => union.add(id)));

    return { followups, sales, visits, reservations, reservationNotes, union };
  }

  async function generateReport() {
    if (!dateRange.start || !dateRange.end) {
      alert('الرجاء اختيار الفترة (من / إلى)');
      return;
    }
    if (dateRange.start > dateRange.end) {
      alert('تأكد أن تاريخ "من" أقل أو يساوي تاريخ "إلى"');
      return;
    }

    setGenerating(true);
    setMetrics(null);
    setClients([]);
    setWorkedSets(null);

    const { startISO, endISOExclusive } = buildIsoRange(dateRange.start, dateRange.end);

    setDebugInfo(
      `🔄 توليد تقرير العملاء...\n🗓️ الفترة: ${dateRange.start} → ${dateRange.end}\n⏱️ حدود الاستعلام:\n- gte: ${startISO}\n- lt: ${endISOExclusive}\n👤 الموظف: ${
        selectedEmployeeId === 'all' ? 'الكل' : employees.find((e) => e.id === selectedEmployeeId)?.name || selectedEmployeeId
      }\n🏗️ المشروع: ${projectId === 'all' ? 'الكل' : projectId}`
    );

    try {
      // 1) clients in range
      const allClients = await fetchClientsInRange(startISO, endISOExclusive);

      if (allClients.length === 0) {
        setMetrics({
          totalClients: 0,
          assignedClients: 0,
          unassignedClients: 0,
          distributionRate: 0,
          workedClients: 0,
          workedByFollowups: 0,
          workedByReservations: 0,
          workedBySales: 0,
          workedByReservationNotes: 0,
          workedByVisits: 0,
          editedClients: 0,
          statusCounts: {},
        });
        setDebugInfo((p) => p + '\n\n✅ لا يوجد عملاء في الفترة المحددة');
        return;
      }

      const allClientIds = allClients.map((c) => c.id);

      // 2) assignments
      const assignmentMap = await fetchAssignmentsForClients(allClientIds);

      // employee filter: لو اخترت موظف => فقط العملاء المعيّنين له
      let filteredClients = allClients;
      if (selectedEmployeeId !== 'all') {
        filteredClients = allClients.filter((c) => assignmentMap.get(c.id)?.has(selectedEmployeeId));
      }
      const clientIds = filteredClients.map((c) => c.id);

      const assignedClients = filteredClients.filter((c) => (assignmentMap.get(c.id)?.size || 0) > 0).length;
      const unassignedClients = filteredClients.length - assignedClients;
      const distributionRate = filteredClients.length ? Math.round((assignedClients / filteredClients.length) * 1000) / 10 : 0;

      // 3) worked sets (داخل نفس الفترة)
      const worked = await fetchWorkedSets(clientIds, startISO, endISOExclusive);
      setWorkedSets(worked);
      const workedClients = worked.union.size;

      // 4) edited clients (updated_at داخل الفترة + updated_at > created_at)
      const editedClients = filteredClients.filter((c) => {
        if (!c.updated_at) return false;
        const u = new Date(c.updated_at).getTime();
        const cr = new Date(c.created_at).getTime();
        const inRange = u >= new Date(startISO).getTime() && u < new Date(endISOExclusive).getTime();
        return inRange && u > cr;
      }).length;

      // 5) status distribution
      const statusCounts: Record<string, number> = {};
      for (const c of filteredClients) statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;

      setMetrics({
        totalClients: filteredClients.length,
        assignedClients,
        unassignedClients,
        distributionRate,
        workedClients,
        workedByFollowups: worked.followups.size,
        workedByReservations: worked.reservations.size,
        workedBySales: worked.sales.size,
        workedByReservationNotes: worked.reservationNotes.size,
        workedByVisits: worked.visits.size,
        editedClients,
        statusCounts,
      });

      setClients(filteredClients);

      setDebugInfo((p) => {
        return (
          p +
          `\n\n📦 النتائج:` +
          `\n- Clients: ${filteredClients.length}` +
          `\n- Assigned: ${assignedClients}` +
          `\n- Unassigned: ${unassignedClients}` +
          `\n- Worked: ${workedClients}` +
          `\n- Edited: ${editedClients}`
        );
      });
    } catch (err: any) {
      console.error('generateReport error:', err);
      alert(`حدث خطأ أثناء توليد التقرير: ${err?.message || err}`);
      setDebugInfo((p) => p + `\n❌ خطأ: ${err?.message || err}`);
    } finally {
      setGenerating(false);
    }
  }

  /* =====================
     Export
  ===================== */
  async function exportToJSON() {
    setExporting(true);
    try {
      if (!metrics) {
        alert('لا توجد بيانات للتصدير');
        return;
      }

      const payload = {
        meta: {
          dateRange,
          employee:
            selectedEmployeeId === 'all' ? 'الكل' : employees.find((e) => e.id === selectedEmployeeId)?.name || selectedEmployeeId,
          project: projectId,
          generatedAt: new Date().toISOString(),
          generatedBy: currentEmployee?.name,
        },
        metrics,
        clients,
        workedSets: workedSets
          ? {
              followups: Array.from(workedSets.followups),
              reservations: Array.from(workedSets.reservations),
              reservationNotes: Array.from(workedSets.reservationNotes),
              sales: Array.from(workedSets.sales),
              visits: Array.from(workedSets.visits),
            }
          : null,
      };

      const dataStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_العملاء_${dateRange.start}_الى_${dateRange.end}.json`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('تم تصدير التقرير بنجاح');
    } finally {
      setExporting(false);
    }
  }

  function exportToCSV() {
    if (!clients.length || !metrics) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    const headers = [
      'اسم العميل',
      'الجوال',
      'الحالة',
      'مستحق',
      'تاريخ الإضافة',
      'تم العمل عليه داخل الفترة؟',
      'تم تعديل بياناته داخل الفترة؟',
    ];

    const { startISO, endISOExclusive } = buildIsoRange(dateRange.start, dateRange.end);

    const rows = clients.map((c) => {
      const worked = workedSets?.union.has(c.id) ? 'نعم' : 'لا';

      const edited =
        !!c.updated_at &&
        new Date(c.updated_at).getTime() >= new Date(startISO).getTime() &&
        new Date(c.updated_at).getTime() < new Date(endISOExclusive).getTime() &&
        new Date(c.updated_at).getTime() > new Date(c.created_at).getTime()
          ? 'نعم'
          : 'لا';

      return [
        `"${safeText(c.name).replace(/"/g, '""')}"`,
        safeText(c.mobile),
        translateStatus(c.status),
        c.eligible ? 'مستحق' : 'غير مستحق',
        new Date(c.created_at).toLocaleString('ar-SA'),
        worked,
        edited,
      ];
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_العملاء_${dateRange.start}_الى_${dateRange.end}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function printReport() {
    window.print();
  }

  /* =====================
     Filtering (client list)
  ===================== */
  const filteredClients = useMemo(() => {
    let list = clients;
    const t = searchTerm.trim().toLowerCase();
    if (t) {
      list = list.filter((c) => (c.name || '').toLowerCase().includes(t) || (c.mobile || '').toLowerCase().includes(t) || (c.status || '').toLowerCase().includes(t));
    }
    return list;
  }, [clients, searchTerm]);

  /* =====================
     Render
  ===================== */
  if (loading) {
    return (
      <RequireAuth>
        <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 700 }}>
            <div style={{ fontSize: 18, marginBottom: 10 }}>جاري تحميل تقرير العملاء...</div>
            {debugInfo && (
              <div style={{ fontSize: 12, color: '#666', backgroundColor: '#f8f9fa', padding: 10, borderRadius: 6, textAlign: 'left', whiteSpace: 'pre-line', border: '1px solid #eee' }}>
                {debugInfo}
              </div>
            )}
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="page">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0 }}>تقرير العملاء</h1>
            <p style={{ color: '#666', marginTop: 5 }}>إحصائيات العملاء خلال فترة محددة + توزيع + نشاط + تعديل بيانات</p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button onClick={exportToJSON} disabled={exporting || !metrics} variant="secondary">
              {exporting ? 'جاري التصدير...' : 'تصدير JSON'}
            </Button>
            <Button onClick={exportToCSV} disabled={!metrics} variant="secondary">
              تصدير CSV
            </Button>
            <Button onClick={printReport} disabled={!metrics}>
              طباعة
            </Button>
          </div>
        </div>

        {/* Debug */}
        {debugInfo && (
          <div style={{ marginBottom: 20, padding: 15, backgroundColor: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef', fontSize: 12, color: '#666', whiteSpace: 'pre-line', maxHeight: 220, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 'bold' }}>سجل النظام</div>
              <button onClick={() => setDebugInfo('')} style={{ fontSize: 11, padding: '2px 8px', backgroundColor: '#e9ecef', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                مسح
              </button>
            </div>
            {debugInfo}
          </div>
        )}

        {/* Filters */}
        <Card title="فلترة التقرير">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15, padding: 15 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 5, fontSize: 14 }}>الموظف</label>
              <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd' }}>
                <option value="all">الكل</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.role === 'sales_manager' ? '(مشرف)' : emp.role === 'sales' ? '(مبيعات)' : ''}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#666', marginTop: 5 }}>{employees.length} موظف</div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 5, fontSize: 14 }}>المشروع</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd' }}>
                <option value="all">الكل</option>
                {filterProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.name} (${p.code})` : p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 5, fontSize: 14 }}>من تاريخ إنشاء العميل *</label>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd' }} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 5, fontSize: 14 }}>إلى تاريخ إنشاء العميل *</label>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%' }}>
                <Button onClick={generateReport} disabled={generating || !dateRange.start || !dateRange.end}>
                  {generating ? 'جاري التوليد...' : 'توليد التقرير'}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Generating */}
        {generating && (
          <div style={{ textAlign: 'center', padding: 40, backgroundColor: 'white', borderRadius: 8, marginBottom: 20, border: '1px solid #e9ecef', marginTop: 20 }}>
            <div style={{ fontSize: 18, marginBottom: 10 }}>جاري توليد التقرير...</div>
            <div style={{ color: '#666' }}>قد تستغرق العملية بضع لحظات</div>
          </div>
        )}

        {/* Result */}
        {!generating && metrics && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 20, marginBottom: 20 }}>
              <Stat title="إجمالي العملاء" value={metrics.totalClients} />
              <Stat title="موزعين" value={metrics.assignedClients} />
              <Stat title="غير موزعين" value={metrics.unassignedClients} />
              <Stat title="نسبة التوزيع" value={`${metrics.distributionRate}%`} />
              <Stat title="عملاء تم العمل عليهم" value={metrics.workedClients} />
              <Stat title="عملاء تم تعديل بياناتهم" value={metrics.editedClients} />
            </div>

            <Card title="تفصيل (تم العمل عليهم داخل الفترة)">
              <div style={{ padding: 15, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <Stat title="متابعات" value={metrics.workedByFollowups} />
                <Stat title="حجوزات" value={metrics.workedByReservations} />
                <Stat title="ملاحظات حجوزات" value={metrics.workedByReservationNotes} />
                <Stat title="مبيعات" value={metrics.workedBySales} />
                <Stat title="زيارات" value={metrics.workedByVisits} />
              </div>
              <p style={{ padding: '0 15px 15px', color: '#666', fontSize: 13 }}>
                “تم العمل عليهم” = عميل ظهر له أي نشاط من (متابعة/حجز/ملاحظة/بيع/زيارة) داخل نفس الفترة.
              </p>
            </Card>

            <Card title="توزيع حالات العملاء">
              <div style={{ padding: 15, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {Object.entries(metrics.statusCounts).length === 0 ? (
                  <div style={{ color: '#666' }}>لا توجد بيانات</div>
                ) : (
                  Object.entries(metrics.statusCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <div key={k} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                        <div style={{ color: '#666', fontSize: 12 }}>{translateStatus(k)}</div>
                        <div style={{ fontSize: 18, fontWeight: 'bold' }}>{v}</div>
                      </div>
                    ))
                )}
              </div>
            </Card>

            <Card title="قائمة العملاء">
              <div style={{ padding: 15, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <Input placeholder="بحث بالاسم/الجوال/الحالة..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>

                <Button onClick={() => setShowClients((p) => !p)} variant={showClients ? 'secondary' : 'primary'}>
                  {showClients ? 'إخفاء القائمة' : 'عرض القائمة'}
                </Button>
              </div>

              {showClients ? (
                <div style={{ overflowX: 'auto', padding: 15 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                        <th style={{ padding: 12, textAlign: 'right' }}>العميل</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>الجوال</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>الحالة</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>مستحق</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>تاريخ الإضافة</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>تم العمل عليه؟</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>تم تعديله؟</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>فتح</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                            لا توجد نتائج
                          </td>
                        </tr>
                      ) : (
                        filteredClients.slice(0, 500).map((c, idx) => {
                          const worked = workedSets?.union.has(c.id);
                          const { startISO, endISOExclusive } = buildIsoRange(dateRange.start, dateRange.end);
                          const edited =
                            !!c.updated_at &&
                            new Date(c.updated_at).getTime() >= new Date(startISO).getTime() &&
                            new Date(c.updated_at).getTime() < new Date(endISOExclusive).getTime() &&
                            new Date(c.updated_at).getTime() > new Date(c.created_at).getTime();

                          return (
                            <tr key={c.id} style={{ borderBottom: '1px solid #e9ecef', backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                              <td style={{ padding: 12 }}>{c.name}</td>
                              <td style={{ padding: 12 }}>{c.mobile || '-'}</td>
                              <td style={{ padding: 12 }}>{translateStatus(c.status)}</td>
                              <td style={{ padding: 12 }}>{c.eligible ? 'مستحق' : 'غير مستحق'}</td>
                              <td style={{ padding: 12 }}>{new Date(c.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}</td>
                              <td style={{ padding: 12 }}>{worked ? 'نعم' : 'لا'}</td>
                              <td style={{ padding: 12 }}>{edited ? 'نعم' : 'لا'}</td>
                              <td style={{ padding: 12 }}>
                                <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>فتح</Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>

                  {filteredClients.length > 500 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>تم عرض أول 500 عميل فقط في الجدول لتقليل الضغط.</div>
                  )}
                </div>
              ) : (
                <div style={{ padding: 20, color: '#666' }}>تم إخفاء القائمة.</div>
              )}
            </Card>
          </>
        )}

        {/* Empty */}
        {!generating && !metrics && (
          <div style={{ textAlign: 'center', padding: 40, backgroundColor: 'white', borderRadius: 8, border: '1px solid #e9ecef', marginTop: 20 }}>
            <div style={{ fontSize: 24, color: '#999', marginBottom: 20 }}>📊</div>
            <div style={{ fontSize: 18, marginBottom: 10 }}>اختر الفترة ثم اضغط “توليد التقرير”</div>
            <div style={{ color: '#666' }}>سيتم عرض إحصائيات العملاء + النشاط + التعديل + توزيع الحالات</div>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}

/* =====================
   Small Stat component
===================== */
function Stat({ title, value }: { title: string; value: string | number }) {
  return (
    <div style={{ backgroundColor: 'white', borderRadius: 8, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #eee' }}>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}
