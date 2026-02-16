'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

type Role = 'admin' | 'sales' | 'sales_manager';

type EmployeeLite = {
  id: string;
  name?: string | null;
  role: Role;
};

type Project = {
  id: string;
  name: string;
  code: string | null;
};

type Metrics = {
  totalClients: number;

  assignedClients: number;
  unassignedClients: number;

  workedClients: number;

  workedByFollowups: number;
  workedBySales: number;
  workedByReservations: number;
  workedByReservationNotes: number;

  editedClients: number;

  // extras مفيدة
  distributionRate: number; // %
};

function toISOStart(d: string) {
  return d ? `${d}T00:00:00.000Z` : '';
}
function toISOEnd(d: string) {
  return d ? `${d}T23:59:59.999Z` : '';
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function ClientsReportPage() {
  const [me, setMe] = useState<EmployeeLite | null>(null);

  // نطاق مشاريع الـ sales_manager
  const [myAllowedProjects, setMyAllowedProjects] = useState<Project[]>([]);
  const myAllowedProjectIds = useMemo(() => myAllowedProjects.map(p => p.id), [myAllowedProjects]);

  // employees dropdown
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [employeeId, setEmployeeId] = useState<string>('all');

  // date range
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string>('');

  /* =====================
     Detect optional tables safely
  ===================== */
  const tableExists = useCallback(async (table: string) => {
    // محاولة select بسيطة. لو table مش موجود هيرجع error.
    const { error } = await supabase.from(table).select('id').limit(1);
    return !error;
  }, []);

  const pickFirstExistingTable = useCallback(async (candidates: string[]) => {
    for (const t of candidates) {
      const ok = await tableExists(t);
      if (ok) return t;
    }
    return null;
  }, [tableExists]);

  /* =====================
     Load my allowed projects (sales_manager scope)
  ===================== */
  const loadMyAllowedProjects = useCallback(async (emp: EmployeeLite) => {
    if (emp.role === 'admin') {
      setMyAllowedProjects([]);
      return [];
    }

    const { data: rows, error } = await supabase
      .from('employee_projects')
      .select('project_id')
      .eq('employee_id', emp.id);

    if (error) throw error;

    const ids = (rows || []).map(r => (r as any).project_id).filter(Boolean);
    if (ids.length === 0) {
      setMyAllowedProjects([]);
      return [];
    }

    const { data: projects, error: pErr } = await supabase
      .from('projects')
      .select('id,name,code')
      .in('id', ids)
      .order('name');

    if (pErr) throw pErr;

    setMyAllowedProjects(projects || []);
    return projects || [];
  }, []);

  /* =====================
     Load employees (admin: all sales+managers, manager: sales ضمن scope)
  ===================== */
  const loadEmployees = useCallback(async (emp: EmployeeLite, allowedProjectIds: string[]) => {
    if (emp.role === 'admin') {
      const { data, error } = await supabase
        .from('employees')
        .select('id, role, name')
        .in('role', ['sales', 'sales_manager'])
        .order('name');
      if (error) throw error;
      setEmployees(data || []);
      return;
    }

    if (allowedProjectIds.length === 0) {
      setEmployees([]);
      return;
    }

    const { data: epRows, error: epErr } = await supabase
      .from('employee_projects')
      .select('employee_id')
      .in('project_id', allowedProjectIds);

    if (epErr) throw epErr;

    const employeeIds = Array.from(
      new Set((epRows || []).map(r => (r as any).employee_id).filter(Boolean))
    );

    if (employeeIds.length === 0) {
      setEmployees([]);
      return;
    }

    const { data: emps, error: eErr } = await supabase
      .from('employees')
      .select('id, role, name')
      .in('id', employeeIds)
      .in('role', ['sales', 'sales_manager'])
      .order('name');

    if (eErr) throw eErr;

    setEmployees(emps || []);
  }, []);

  /* =====================
     Init
  ===================== */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const emp = await getCurrentEmployee();
        setMe(emp);

        const allowed = await loadMyAllowedProjects(emp);
        await loadEmployees(emp, allowed.map(p => p.id));
      } catch (e: any) {
        console.error(e);
        setError('حدث خطأ في تحميل البيانات الأساسية');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMyAllowedProjects, loadEmployees]);

  const canRun = useMemo(() => !!from && !!to, [from, to]);

  /* =====================
     Core: Run report
  ===================== */
  const runReport = useCallback(async () => {
    if (!me || !canRun) return;

    setLoading(true);
    setError('');
    setMetrics(null);

    try {
      const fromISO = toISOStart(from);
      const toISO = toISOEnd(to);

      // Optional tables detection
      const reservationsTable = await pickFirstExistingTable(['reservations', 'reservation']);
      const reservationNotesTable = await pickFirstExistingTable(['reservation_notes', 'booking_notes', 'client_notes', 'notes']);

      // 1) Get clients IDs in date range (+ scope if sales_manager)
      let clientsQ = supabase
        .from('clients')
        .select('id, created_at, updated_at, interested_in_project_id', { count: 'exact' })
        .gte('created_at', fromISO)
        .lte('created_at', toISO);

      if (me.role === 'sales_manager') {
        if (myAllowedProjectIds.length === 0) {
          setMetrics({
            totalClients: 0,
            assignedClients: 0,
            unassignedClients: 0,
            workedClients: 0,
            workedByFollowups: 0,
            workedBySales: 0,
            workedByReservations: 0,
            workedByReservationNotes: 0,
            editedClients: 0,
            distributionRate: 0,
          });
          return;
        }
        clientsQ = clientsQ.in('interested_in_project_id', myAllowedProjectIds);
      }

      const { data: clients, error: cErr } = await clientsQ;
      if (cErr) throw cErr;

      const clientRows = (clients || []) as any[];
      const allClientIds = clientRows.map(c => c.id);
      const totalClients = allClientIds.length;

      if (totalClients === 0) {
        setMetrics({
          totalClients: 0,
          assignedClients: 0,
          unassignedClients: 0,
          workedClients: 0,
          workedByFollowups: 0,
          workedBySales: 0,
          workedByReservations: 0,
          workedByReservationNotes: 0,
          editedClients: 0,
          distributionRate: 0,
        });
        return;
      }

      // If employee filter selected: restrict to clients assigned to that employee (داخل نفس الفترة)
      let clientIds = allClientIds;
      if (employeeId !== 'all') {
        // اجلب العملاء المعيّنين للموظف المختار داخل القائمة
        const chunks = chunkArray(allClientIds, 500);
        const assignedToEmp = new Set<string>();

        for (const ch of chunks) {
          const { data: rows, error } = await supabase
            .from('client_assignments')
            .select('client_id')
            .eq('employee_id', employeeId)
            .in('client_id', ch);

          if (error) throw error;
          (rows || []).forEach((r: any) => assignedToEmp.add(r.client_id));
        }

        clientIds = Array.from(assignedToEmp);
      }

      // 2) Assigned / Unassigned (بالنسبة لمجموعة clientIds النهائية)
      const chunks2 = chunkArray(clientIds, 500);
      const assignedSet = new Set<string>();

      for (const ch of chunks2) {
        let q = supabase
          .from('client_assignments')
          .select('client_id')
          .in('client_id', ch);

        // لو مختار موظف: ده معناه كلهم assigned له، بس نخليه صحيح برضو
        if (employeeId !== 'all') q = q.eq('employee_id', employeeId);

        const { data: rows, error } = await q;
        if (error) throw error;
        (rows || []).forEach((r: any) => assignedSet.add(r.client_id));
      }

      const assignedClients = assignedSet.size;
      const unassignedClients = clientIds.length - assignedClients;

      // 3) Edited clients: updated_at > created_at (لو updated_at موجود)
      const editedClients = clientRows
        .filter((c) => clientIds.includes(c.id))
        .filter((c) => c.updated_at && c.created_at && new Date(c.updated_at).getTime() > new Date(c.created_at).getTime())
        .length;

      // helper: get distinct client ids from a table using IN chunks
      async function distinctClientIdsFromTable(table: string, column = 'client_id') {
        const out = new Set<string>();
        const chunks = chunkArray(clientIds, 500);
        for (const ch of chunks) {
          const { data, error } = await supabase
            .from(table)
            .select(column)
            .in(column, ch);

          if (error) throw error;
          (data || []).forEach((r: any) => out.add(r[column]));
        }
        return out;
      }

      // 4) Worked clients (followups / sales / reservations / reservation notes)
      const followupsSet = await distinctClientIdsFromTable('client_followups', 'client_id');
      const salesSet = await distinctClientIdsFromTable('sales', 'client_id');

      let reservationsSet = new Set<string>();
      if (reservationsTable) {
        reservationsSet = await distinctClientIdsFromTable(reservationsTable, 'client_id');
      }

      let reservationNotesSet = new Set<string>();
      if (reservationNotesTable) {
        // بعض الجداول ممكن يكون عمود client_id أو reservation_id… هنا نفترض client_id
        // لو طلع عندك مختلف هنعدله بسرعة.
        try {
          reservationNotesSet = await distinctClientIdsFromTable(reservationNotesTable, 'client_id');
        } catch {
          reservationNotesSet = new Set<string>();
        }
      }

      const workedUnion = new Set<string>();
      [followupsSet, salesSet, reservationsSet, reservationNotesSet].forEach((s) => {
        s.forEach((id) => workedUnion.add(id));
      });

      const workedClients = workedUnion.size;

      const distributionRate = clientIds.length ? Math.round((assignedClients / clientIds.length) * 1000) / 10 : 0;

      setMetrics({
        totalClients: clientIds.length,
        assignedClients,
        unassignedClients,
        workedClients,
        workedByFollowups: followupsSet.size,
        workedBySales: salesSet.size,
        workedByReservations: reservationsSet.size,
        workedByReservationNotes: reservationNotesSet.size,
        editedClients,
        distributionRate,
      });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'حصل خطأ أثناء إنشاء التقرير');
    } finally {
      setLoading(false);
    }
  }, [me, canRun, from, to, employeeId, myAllowedProjectIds, pickFirstExistingTable]);

  return (
    <RequireAuth>
      <div className="page" style={{ display: 'grid', gap: 16 }}>
        <Card title="📊 تقرير العملاء">
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#666' }}>من تاريخ إنشاء</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#666' }}>إلى تاريخ إنشاء</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#666' }}>الموظف</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd' }}
              >
                <option value="all">الكل</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name || emp.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={runReport} disabled={!canRun || loading}>
              {loading ? 'جاري إنشاء التقرير...' : 'إنشاء التقرير'}
            </Button>

            {error && <span style={{ color: 'crimson', fontSize: 13 }}>{error}</span>}
          </div>
        </Card>

        {metrics && (
          <>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Card title="إجمالي العملاء">
                <h3 style={{ marginTop: 6 }}>{metrics.totalClients}</h3>
              </Card>

              <Card title="العملاء الموزعين">
                <h3 style={{ marginTop: 6 }}>{metrics.assignedClients}</h3>
              </Card>

              <Card title="العملاء غير الموزعين">
                <h3 style={{ marginTop: 6 }}>{metrics.unassignedClients}</h3>
              </Card>

              <Card title="نسبة التوزيع">
                <h3 style={{ marginTop: 6 }}>{metrics.distributionRate}%</h3>
              </Card>

              <Card title="عملاء تم العمل عليهم (أي نشاط)">
                <h3 style={{ marginTop: 6 }}>{metrics.workedClients}</h3>
              </Card>

              <Card title="عملاء تم تعديل بياناتهم">
                <h3 style={{ marginTop: 6 }}>{metrics.editedClients}</h3>
              </Card>
            </div>

            <Card title="تفصيل (تم العمل عليهم)">
              <Table
                headers={['النوع', 'عدد العملاء']}
              >
                <tr><td>متابعات (client_followups)</td><td><b>{metrics.workedByFollowups}</b></td></tr>
                <tr><td>تنفيذات (sales)</td><td><b>{metrics.workedBySales}</b></td></tr>
                <tr><td>حجوزات (reservations/reservation إن وُجد)</td><td><b>{metrics.workedByReservations}</b></td></tr>
                <tr><td>ملاحظات حجز (reservation_notes/… إن وُجد)</td><td><b>{metrics.workedByReservationNotes}</b></td></tr>
              </Table>

              <p style={{ marginTop: 10, fontSize: 13, color: '#666' }}>
                “تم العمل عليهم” = اتحاد العملاء الذين ظهر لهم أي نشاط من الأنواع أعلاه خلال حياتهم (داخل مجموعة العملاء المختارة في الفترة).
              </p>
            </Card>
          </>
        )}
      </div>
    </RequireAuth>
  );
}
