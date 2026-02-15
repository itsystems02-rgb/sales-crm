'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */
type EmployeeLite = {
  id: string;
  name?: string | null;
  role: 'admin' | 'sales' | 'sales_manager';
};

type Project = {
  id: string;
  name: string;
  code: string | null;
};

type ClientListItem = {
  id: string;
  name: string;
  mobile: string | null;
  eligible: boolean;
  status: string;
  interested_in_project_id: string | null;
  created_at: string;
};

type ClientFilters = {
  search: string;
  status: string[];
  eligible: string | null;
  interested_in_project_id: string | null;
  from_date: string;
  to_date: string;
};

const STATUS_OPTIONS = [
  { value: 'lead', label: 'متابعة' },
  { value: 'reserved', label: 'محجوز' },
  { value: 'visited', label: 'تمت الزيارة' },
  { value: 'converted', label: 'تم البيع' },
];

function translateStatus(status: string) {
  switch (status) {
    case 'lead': return 'متابعة';
    case 'reserved': return 'محجوز';
    case 'visited': return 'تمت الزيارة';
    case 'converted': return 'تم البيع';
    default: return status;
  }
}

function getProjectText(project: Project | null | undefined) {
  if (!project) return '-';
  return project.code ? `${project.name} (${project.code})` : project.name;
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* =====================
   Page
===================== */
export default function AssignmentsPage() {
  const router = useRouter();

  const [me, setMe] = useState<EmployeeLite | null>(null);

  // نطاق المشاريع للـ sales_manager (أو مشاريع الموظف عمومًا)
  const [myAllowedProjects, setMyAllowedProjects] = useState<Project[]>([]);
  const myAllowedProjectIds = useMemo(
    () => myAllowedProjects.map(p => p.id),
    [myAllowedProjects]
  );

  // المشاريع للفلتر
  const [filterProjects, setFilterProjects] = useState<Project[]>([]);

  // الموظفين المتاحين في الصفحة
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // Tabs: all | assigned
  const [tab, setTab] = useState<'all' | 'assigned'>('all');

  // Filters
  const [filters, setFilters] = useState<ClientFilters>({
    search: '',
    status: [],
    eligible: null,
    interested_in_project_id: null,
    from_date: '',
    to_date: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  // ✅ Unassigned only filter (يطبق على tab=all فقط)
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  // Data lists
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalRows, setTotalRows] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalRows / itemsPerPage));

  // Assignments sets
  const [assignedFromDB, setAssignedFromDB] = useState<Set<string>>(new Set());
  const [selectedInUI, setSelectedInUI] = useState<Set<string>>(new Set());

  // Save state
  const [saving, setSaving] = useState(false);

  // ✅ bulk selection count
  const [bulkCount, setBulkCount] = useState<number>(20);

  const selectAllPageRef = useRef<HTMLInputElement>(null);

  /* =====================
     Permissions
  ===================== */
  const ensureAllowed = useCallback((emp: EmployeeLite | null) => {
    if (!emp) return;
    if (emp.role !== 'admin' && emp.role !== 'sales_manager') {
      alert('لا تملك صلاحية الوصول لهذه الصفحة');
      router.push('/dashboard');
    }
  }, [router]);

  /* =====================
     Load my allowed projects (sales_manager scope)
  ===================== */
  const loadMyAllowedProjects = useCallback(async (emp: EmployeeLite) => {
    // admin مش محتاجين scope
    if (emp.role === 'admin') {
      setMyAllowedProjects([]);
      return [];
    }

    // sales_manager: المشاريع من employee_projects
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
     Load employees list
  ===================== */
  const loadEmployees = useCallback(async (emp: EmployeeLite, allowedProjectIds: string[]) => {
    // admin: كل الموظفين (sales + sales_manager)
    if (emp.role === 'admin') {
      const { data, error } = await supabase
        .from('employees')
        .select('id, role, name')
        .in('role', ['sales', 'sales_manager'])
        .order('name');
      if (error) throw error;
      setEmployees(data || []);
      return data || [];
    }

    // sales_manager: TEAM employees from employee_projects where project_id in managerProjects
    if (allowedProjectIds.length === 0) {
      setEmployees([]);
      return [];
    }

    const { data: epRows, error: epErr } = await supabase
      .from('employee_projects')
      .select('employee_id')
      .in('project_id', allowedProjectIds);

    if (epErr) throw epErr;

    // ✅ unique + exclude manager نفسه
    const employeeIds = Array.from(
      new Set((epRows || []).map(r => (r as any).employee_id).filter(Boolean))
    ).filter(id => id !== emp.id);

    if (employeeIds.length === 0) {
      setEmployees([]);
      return [];
    }

    // ✅ team = sales فقط (زي الداشبورد)
    const { data: emps, error: eErr } = await supabase
      .from('employees')
      .select('id, role, name')
      .in('id', employeeIds)
      .eq('role', 'sales')
      .order('name');

    if (eErr) throw eErr;

    setEmployees(emps || []);
    return emps || [];
  }, []);

  /* =====================
     Load projects for filter dropdown
  ===================== */
  const loadFilterProjects = useCallback(async (emp: EmployeeLite, allowedProjects: Project[]) => {
    if (emp.role === 'admin') {
      const { data, error } = await supabase
        .from('projects')
        .select('id,name,code')
        .order('name');
      if (error) throw error;
      setFilterProjects(data || []);
      return;
    }
    setFilterProjects(allowedProjects || []);
  }, []);

  /* =====================
     Load assignments (IDs) for selected employee
  ===================== */
  const loadAssignedIdsForEmployee = useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setAssignedFromDB(new Set());
      setSelectedInUI(new Set());
      return;
    }

    const { data, error } = await supabase
      .from('client_assignments')
      .select('client_id')
      .eq('employee_id', employeeId);

    if (error) throw error;

    const ids = new Set((data || []).map((r: any) => r.client_id));
    setAssignedFromDB(ids);
    setSelectedInUI(new Set(ids));
  }, []);

  /* =====================
     Helpers - filters
  ===================== */
  const updateFilter = (key: keyof ClientFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleStatusFilter = (status: string, checked: boolean) => {
    const next = checked ? [...filters.status, status] : filters.status.filter(s => s !== status);
    updateFilter('status', next);
  };

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search ||
      filters.status.length > 0 ||
      filters.eligible !== null ||
      filters.interested_in_project_id !== null ||
      filters.from_date ||
      filters.to_date ||
      unassignedOnly
    );
  }, [filters, unassignedOnly]);

  /* =====================
     RPC: get unassigned ids
     (لازم تكون عامل function في Supabase)
  ===================== */
  const fetchUnassignedIds = useCallback(async (): Promise<string[]> => {
    const { data, error } = await supabase.rpc('get_unassigned_client_ids');
    if (error) throw error;

    // data = [{ id: '...' }, ...]
    const ids = (data || []).map((r: any) => r.id).filter(Boolean);
    return ids as string[];
  }, []);

  /* =====================
     Load Clients (Two modes)
  ===================== */
  const loadClients = useCallback(async (emp: EmployeeLite, page = currentPage) => {
    setLoading(true);
    try {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      // ---------------------------
      // TAB: ASSIGNED ONLY
      // ---------------------------
      if (tab === 'assigned') {
        if (!selectedEmployeeId) {
          setClients([]);
          setTotalRows(0);
          return;
        }

        let q = supabase
          .from('client_assignments')
          .select(
            'client_id, assigned_at, clients!inner(id,name,mobile,eligible,status,interested_in_project_id,created_at)',
            { count: 'exact' }
          )
          .eq('employee_id', selectedEmployeeId)
          .order('assigned_at', { ascending: false })
          .range(from, to);

        if (filters.search) {
          q = q.or(
            `name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%`,
            { foreignTable: 'clients' as any }
          );
        }

        if (filters.status.length > 0) q = q.in('clients.status', filters.status);
        if (filters.eligible !== null) q = q.eq('clients.eligible', filters.eligible === 'true');
        if (filters.interested_in_project_id !== null) q = q.eq('clients.interested_in_project_id', filters.interested_in_project_id);
        if (filters.from_date) q = q.gte('clients.created_at', filters.from_date);

        if (filters.to_date) {
          const nextDay = new Date(filters.to_date);
          nextDay.setDate(nextDay.getDate() + 1);
          q = q.lt('clients.created_at', nextDay.toISOString().split('T')[0]);
        }

        if (emp.role === 'sales_manager') {
          if (myAllowedProjectIds.length === 0) {
            setClients([]);
            setTotalRows(0);
            return;
          }
          q = q.in('clients.interested_in_project_id', myAllowedProjectIds);
        }

        const { data, error, count } = await q;
        if (error) throw error;

        const mapped = (data || [])
          .map((row: any) => row.clients)
          .filter(Boolean) as ClientListItem[];

        setClients(mapped);
        setTotalRows(count || 0);
        return;
      }

      // ---------------------------
      // TAB: ALL CLIENTS
      // ---------------------------
      // ✅ رجعنا select الطبيعي (بدون join) لأن الفلترة هتيجي من RPC
      let query = supabase
        .from('clients')
        .select('id,name,mobile,eligible,status,interested_in_project_id,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // Scope: sales_manager يرى عملاء مشاريعه فقط
      if (emp.role === 'sales_manager') {
        if (myAllowedProjectIds.length === 0) {
          setClients([]);
          setTotalRows(0);
          return;
        }
        query = query.in('interested_in_project_id', myAllowedProjectIds);
      }

      // Filters
      if (filters.search) query = query.or(`name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%`);
      if (filters.status.length > 0) query = query.in('status', filters.status);
      if (filters.eligible !== null) query = query.eq('eligible', filters.eligible === 'true');
      if (filters.interested_in_project_id !== null) query = query.eq('interested_in_project_id', filters.interested_in_project_id);
      if (filters.from_date) query = query.gte('created_at', filters.from_date);

      if (filters.to_date) {
        const nextDay = new Date(filters.to_date);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('created_at', nextDay.toISOString().split('T')[0]);
      }

      // ✅ Unassigned only filter via RPC + OR chunks
      if (unassignedOnly) {
        const ids = await fetchUnassignedIds();

        if (ids.length === 0) {
          setClients([]);
          setTotalRows(0);
          return;
        }

        // مهم: in لها حدود، فنعمل OR على chunks
        const chunks = chunkArray(ids, 500);
        const orParts = chunks.map(
          (ch) => `id.in.(${ch.map(x => `"${x}"`).join(',')})`
        );
        query = query.or(orParts.join(','));
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setClients((data || []) as ClientListItem[]);
      setTotalRows(count || 0);
    } catch (e: any) {
      console.error('loadClients error:', e);
      setClients([]);
      setTotalRows(0);
      alert('حدث خطأ في تحميل العملاء: ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    itemsPerPage,
    tab,
    selectedEmployeeId,
    filters,
    myAllowedProjectIds,
    unassignedOnly,
    fetchUnassignedIds
  ]);

  /* =====================
     Init
  ===================== */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const emp = await getCurrentEmployee();
        setMe(emp);
        ensureAllowed(emp);

        const allowed = await loadMyAllowedProjects(emp);

        const allowedIds = allowed.map(p => p.id);
        const emps = await loadEmployees(emp, allowedIds);

        if (emps.length > 0) setSelectedEmployeeId(emps[0].id);
        else setSelectedEmployeeId('');

        await loadFilterProjects(emp, allowed);
      } catch (e) {
        console.error('init error:', e);
        alert('حدث خطأ في تحميل الصفحة');
      } finally {
        setLoading(false);
      }
    })();
  }, [ensureAllowed, loadMyAllowedProjects, loadEmployees, loadFilterProjects]);

  useEffect(() => {
    if (!selectedEmployeeId) return;
    loadAssignedIdsForEmployee(selectedEmployeeId).catch((e) => {
      console.error('loadAssignedIdsForEmployee error:', e);
      alert('حدث خطأ في تحميل تعيينات الموظف');
    });
  }, [selectedEmployeeId, loadAssignedIdsForEmployee]);

  useEffect(() => {
    if (!me) return;
    loadClients(me, currentPage);
  }, [me, currentPage, itemsPerPage, tab, loadClients]);

  const applyFilters = () => {
    setCurrentPage(1);
    if (!me) return;
    loadClients(me, 1);
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      status: [],
      eligible: null,
      interested_in_project_id: null,
      from_date: '',
      to_date: '',
    });
    setUnassignedOnly(false);
    setCurrentPage(1);
    if (!me) return;
    loadClients(me, 1);
  };

  /* =====================
     Selection handlers
  ===================== */
  const toggleClient = (clientId: string) => {
    setSelectedInUI(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const selectPage = () => {
    setSelectedInUI(prev => {
      const next = new Set(prev);
      clients.forEach(c => next.add(c.id));
      return next;
    });
  };

  const unselectPage = () => {
    setSelectedInUI(prev => {
      const next = new Set(prev);
      clients.forEach(c => next.delete(c.id));
      return next;
    });
  };

  const selectBulk = (count: number) => {
    setSelectedInUI(prev => {
      const next = new Set(prev);
      clients.slice(0, Math.max(0, count)).forEach(c => next.add(c.id));
      return next;
    });
  };

  /* =====================
     Save assignments
  ===================== */
  const handleSave = async () => {
    if (!me) return;
    if (!selectedEmployeeId) {
      alert('اختر موظف أولاً');
      return;
    }

    setSaving(true);
    try {
      const fromDB = assignedFromDB;
      const ui = selectedInUI;

      const toAdd: string[] = [];
      const toRemove: string[] = [];

      ui.forEach(id => { if (!fromDB.has(id)) toAdd.push(id); });
      fromDB.forEach(id => { if (!ui.has(id)) toRemove.push(id); });

      if (toAdd.length === 0 && toRemove.length === 0) {
        alert('لا توجد تغييرات للحفظ');
        return;
      }

      // Insert in chunks
      const addChunks = chunkArray(toAdd, 500);
      for (const ch of addChunks) {
        const payload = ch.map(clientId => ({
          client_id: clientId,
          employee_id: selectedEmployeeId,
          assigned_by: me.id,
        }));
        const { error } = await supabase.from('client_assignments').insert(payload);
        if (error) throw error;
      }

      // Delete in chunks
      const delChunks = chunkArray(toRemove, 500);
      for (const ch of delChunks) {
        const { error } = await supabase
          .from('client_assignments')
          .delete()
          .eq('employee_id', selectedEmployeeId)
          .in('client_id', ch);
        if (error) throw error;
      }

      await loadAssignedIdsForEmployee(selectedEmployeeId);

      alert(`تم الحفظ بنجاح ✅\nتمت إضافة: ${toAdd.length}\nتمت إزالة: ${toRemove.length}`);

      setCurrentPage(1);
      await loadClients(me, 1);
    } catch (e: any) {
      console.error('save error:', e);
      alert('حدث خطأ أثناء الحفظ: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  /* =====================
     UI helpers
  ===================== */
  const changes = useMemo(() => {
    let add = 0;
    let remove = 0;
    selectedInUI.forEach(id => { if (!assignedFromDB.has(id)) add++; });
    assignedFromDB.forEach(id => { if (!selectedInUI.has(id)) remove++; });
    return { add, remove };
  }, [assignedFromDB, selectedInUI]);

  const displayProjectsMap = useMemo(() => {
    const map = new Map<string, Project>();
    (filterProjects || []).forEach(p => map.set(p.id, p));
    return map;
  }, [filterProjects]);

  /* =====================
     Render
  ===================== */
  return (
    <RequireAuth>
      <div className="page">
        <Card title="توزيع العملاء على الموظفين">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ minWidth: 260, flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#666' }}>
                اختر الموظف:
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => {
                  setSelectedEmployeeId(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #ddd',
                }}
              >
                {employees.length === 0 ? (
                  <option value="">لا يوجد موظفين متاحين</option>
                ) : (
                  employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name || emp.id}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
              <Button
                onClick={() => {
                  setTab('all');
                  setCurrentPage(1);
                }}
                variant={tab === 'all' ? 'primary' : undefined}
              >
                كل العملاء
              </Button>

              <Button
                onClick={() => {
                  setTab('assigned');
                  setUnassignedOnly(false);
                  setCurrentPage(1);
                }}
                variant={tab === 'assigned' ? 'primary' : undefined}
              >
                المعيّنين فقط
              </Button>

              <Button onClick={() => setShowFilters(!showFilters)} variant={showFilters ? 'danger' : 'primary'}>
                {showFilters ? 'إخفاء الفلاتر' : 'إظهار الفلاتر'}
              </Button>

              <Button onClick={handleSave} disabled={saving || !selectedEmployeeId}>
                {saving ? 'جاري الحفظ...' : `حفظ التغييرات (+${changes.add} / -${changes.remove})`}
              </Button>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: '#666', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span>المعيّنين حاليًا (DB): <b>{assignedFromDB.size}</b></span>
            <span>المحدد بالواجهة: <b>{selectedInUI.size}</b></span>
            {tab === 'assigned' && <span>عرض: <b>المعيّنين فقط</b></span>}
          </div>
        </Card>

        <Card title="فلاتر العملاء">
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <Input
                  placeholder="بحث بالاسم أو الجوال..."
                  value={filters.search}
                  onChange={(e) => updateFilter('search', e.target.value)}
                />
              </div>

              <Button onClick={applyFilters} disabled={loading}>
                {loading ? 'جاري...' : 'تطبيق'}
              </Button>

              {hasActiveFilters && (
                <Button onClick={resetFilters} variant="danger">
                  إعادة تعيين
                </Button>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#444' }}>
                <input
                  type="checkbox"
                  checked={unassignedOnly}
                  onChange={(e) => {
                    setUnassignedOnly(e.target.checked);
                    setCurrentPage(1);
                  }}
                  disabled={tab === 'assigned'}
                />
                عرض العملاء غير الموزعين فقط
                {tab === 'assigned' && (
                  <span style={{ color: '#999', fontSize: 12 }}>
                    (متاح في "كل العملاء" فقط)
                  </span>
                )}
              </label>
            </div>
          </div>

          {showFilters && (
            <div style={{
              background: '#f8f9fa',
              border: '1px solid #e9ecef',
              padding: 16,
              borderRadius: 8
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', fontSize: 13 }}>الحالة:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {STATUS_OPTIONS.map(opt => (
                      <label key={opt.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={filters.status.includes(opt.value)}
                          onChange={(e) => handleStatusFilter(opt.value, e.target.checked)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', fontSize: 13 }}>الأهلية:</label>
                  <select
                    value={filters.eligible || ''}
                    onChange={(e) => updateFilter('eligible', e.target.value || null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd' }}
                  >
                    <option value="">الكل</option>
                    <option value="true">مستحق فقط</option>
                    <option value="false">غير مستحق فقط</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', fontSize: 13 }}>المشروع:</label>
                  <select
                    value={filters.interested_in_project_id || ''}
                    onChange={(e) => updateFilter('interested_in_project_id', e.target.value || null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd' }}
                  >
                    <option value="">كل المشاريع</option>
                    {filterProjects.map(p => (
                      <option key={p.id} value={p.id}>{getProjectText(p)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold', fontSize: 13 }}>تاريخ الإضافة:</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>من</label>
                      <input
                        type="date"
                        value={filters.from_date}
                        onChange={(e) => updateFilter('from_date', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>إلى</label>
                      <input
                        type="date"
                        value={filters.to_date}
                        onChange={(e) => updateFilter('to_date', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd' }}
                      />
                    </div>
                  </div>
                </div>

              </div>

              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <Button onClick={applyFilters} disabled={loading}>
                  {loading ? 'جاري التطبيق...' : 'تطبيق الفلاتر'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card title={`قائمة العملاء (${totalRows.toLocaleString()})`}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <select
              value={bulkCount}
              onChange={(e) => setBulkCount(parseInt(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd' }}
              disabled={clients.length === 0 || !selectedEmployeeId}
            >
              <option value={20}>تحديد 20</option>
              <option value={50}>تحديد 50</option>
              <option value={100}>تحديد 100</option>
              <option value={200}>تحديد 200</option>
            </select>

            <Button
              onClick={() => selectBulk(bulkCount)}
              disabled={clients.length === 0 || !selectedEmployeeId}
            >
              تحديد أول {bulkCount}
            </Button>

            <Button onClick={selectPage} disabled={clients.length === 0 || !selectedEmployeeId}>
              تحديد كل عملاء الصفحة
            </Button>
            <Button onClick={unselectPage} disabled={clients.length === 0 || !selectedEmployeeId} variant="danger">
              إلغاء تحديد الصفحة
            </Button>

            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#666' }}>عرض:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd' }}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
          </div>

          <Table headers={['', 'الاسم', 'الجوال', 'مستحق', 'الحالة', 'المشروع', 'فتح']}>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>جاري التحميل...</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>لا يوجد عملاء</td></tr>
            ) : (
              clients.map(c => {
                const checked = selectedInUI.has(c.id);
                const proj = c.interested_in_project_id ? displayProjectsMap.get(c.interested_in_project_id) : null;

                return (
                  <tr key={c.id}>
                    <td style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClient(c.id)}
                        disabled={!selectedEmployeeId}
                      />
                    </td>
                    <td>{c.name}</td>
                    <td>{c.mobile || '-'}</td>
                    <td>
                      <span className={`badge ${c.eligible ? 'success' : 'danger'}`}>
                        {c.eligible ? 'مستحق' : 'غير مستحق'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge status-${c.status}`}>
                        {translateStatus(c.status)}
                      </span>
                    </td>
                    <td>
                      {c.interested_in_project_id ? (
                        <span className="badge" style={{ backgroundColor: '#e1f5fe', color: '#0288d1' }}>
                          {getProjectText(proj)}
                        </span>
                      ) : (
                        <span style={{ color: '#999', fontSize: 12 }}>-</span>
                      )}
                    </td>
                    <td>
                      <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>
                        فتح
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </Table>

          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              borderTop: '1px solid #e0e0e0',
              background: '#f9f9f9',
              borderRadius: '0 0 6px 6px',
              flexWrap: 'wrap',
              gap: 10
            }}>
              <div style={{ fontSize: 13, color: '#666' }}>
                عرض {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalRows)} من {totalRows.toLocaleString()}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '6px 10px',
                    background: currentPage === 1 ? '#e5e7eb' : '#3b82f6',
                    color: currentPage === 1 ? '#9ca3af' : 'white',
                    border: 'none', borderRadius: 6,
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >⟨⟨</button>

                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: '6px 10px',
                    background: currentPage === 1 ? '#e5e7eb' : '#3b82f6',
                    color: currentPage === 1 ? '#9ca3af' : 'white',
                    border: 'none', borderRadius: 6,
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >⟨</button>

                <span style={{ padding: '6px 10px', fontSize: 13, color: '#666' }}>
                  صفحة {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '6px 10px',
                    background: currentPage === totalPages ? '#e5e7eb' : '#3b82f6',
                    color: currentPage === totalPages ? '#9ca3af' : 'white',
                    border: 'none', borderRadius: 6,
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >⟩</button>

                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '6px 10px',
                    background: currentPage === totalPages ? '#e5e7eb' : '#3b82f6',
                    color: currentPage === totalPages ? '#9ca3af' : 'white',
                    border: 'none', borderRadius: 6,
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >⟩⟩</button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </RequireAuth>
  );
}
