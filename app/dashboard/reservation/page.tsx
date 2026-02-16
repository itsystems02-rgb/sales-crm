'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Note Options (Dropdown)
===================== */

const NOTE_OPTIONS = [
  'حجز قائم - المستفيد يرغب في الإلغاء',
  'جاري رفع الطلب',
  'لم يتم الرد',
  'تحويل راتب - تغيير الجهة التمويلية',
  'جديد - جاري المتابعة',
  'توفير دفعة أولى',
  'انتظار موافقة البنك',
  'البحث عن نسبة',
  'البحث عن جهة تمويلية',
  'تم التنفيذ',
  'تأخير من قبل الجهة التمويلية',
  'سداد التزامات',
  'العميل غير جاد',
  'فترة انتظار البنك',
  'في انتظار نزول الراتب',
  'تم الرفض من الجهة التمويلية',
  'لا يمكن تمويل العميل',
] as const;

/* =====================
   Types
===================== */

type Reservation = {
  id: string;
  reservation_date: string;
  status: string;
  bank_name: string | null;
  client_id: string;
  unit_id: string;
  employee_id: string | null;
  created_at: string;
  clients: {
    name: string;
    mobile: string;
    status: string;
  } | null;
  units: {
    unit_code: string;
    unit_type: string | null;
    project_id: string;
    project_name?: string;
  } | null;
  employees: {
    name: string;
    role: string;
  } | null;
};

type FilterState = {
  status: string;
  employee: string;
  project: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  unitType: string;
  sortBy: 'created_at' | 'reservation_date' | 'client_name';
  sortOrder: 'asc' | 'desc';
};

type ReservationNote = {
  id: string;
  note_text: string;
  created_at: string;
  employees: { id: string; name: string } | null;
};

/* =====================
   StatusBadge
===================== */

function StatusBadge({
  children,
  status = 'default',
}: {
  children: ReactNode;
  status?: 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'default';
}) {
  const colors = {
    success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
    warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7' },
    danger: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
    info: { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' },
    primary: { bg: '#cce5ff', color: '#004085', border: '#b8daff' },
    default: { bg: '#e2e3e5', color: '#383d41', border: '#d6d8db' },
  };

  const c = colors[status];

  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600',
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}

/* =====================
   Helpers
===================== */

function chunkArray<T>(arr: T[], size: number) {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

function uniq(arr: (string | null | undefined)[]) {
  return Array.from(new Set(arr.filter(Boolean) as string[]));
}

function normalizeIds(ids: any[]) {
  return (ids || [])
    .map((x) => (x ?? '').toString().trim())
    .filter((x) => x.length > 0);
}

function dedupeById<T extends { id: string }>(rows: T[]) {
  const m = new Map<string, T>();
  (rows || []).forEach((r) => m.set(r.id, r));
  return Array.from(m.values());
}

// جلب المشاريع المسموحة للموظف
async function fetchAllowedProjects(employee: any) {
  try {
    if (employee?.role === 'admin') {
      const { data, error } = await supabase.from('projects').select('id, name, code').order('name');
      if (error) throw error;
      return data || [];
    }

    if (employee?.role === 'sales' || employee?.role === 'sales_manager') {
      const { data: employeeProjects, error: empError } = await supabase
        .from('employee_projects')
        .select('project_id')
        .eq('employee_id', employee.id);

      if (empError) throw empError;

      const allowedProjectIds = normalizeIds((employeeProjects || []).map((p: any) => p.project_id));
      if (allowedProjectIds.length === 0) return [];

      const chunks = chunkArray(allowedProjectIds, 200);
      const all: any[] = [];

      for (const ch of chunks) {
        const { data, error: projectsError } = await supabase
          .from('projects')
          .select('id, name, code')
          .in('id', ch)
          .order('name');

        if (projectsError) throw projectsError;
        if (data?.length) all.push(...data);
      }

      return dedupeById(all);
    }

    return [];
  } catch (err) {
    console.error('Error fetching allowed projects:', err);
    return [];
  }
}

// جلب جميع المشاريع (للادمن فقط)
async function fetchAllProjects() {
  try {
    const { data, error } = await supabase.from('projects').select('id, name, code').order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching all projects:', err);
    return [];
  }
}

/* =====================
   Page
===================== */

export default function ReservationsPage() {
  const router = useRouter();

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [employees, setEmployees] = useState<{ id: string; name: string; role: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [allowedProjects, setAllowedProjects] = useState<{ id: string; name: string }[]>([]);

  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    employee: 'all',
    project: 'all',
    dateFrom: '',
    dateTo: '',
    search: '',
    unitType: 'all',
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const [showFilters, setShowFilters] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    cancelled: 0,
    converted: 0,
  });

  const [debugInfo, setDebugInfo] = useState<string>('');

  // ===== Notes Modal =====
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesReservation, setNotesReservation] = useState<Reservation | null>(null);

  const [selectedNote, setSelectedNote] = useState<string>('');
  const [customNote, setCustomNote] = useState<string>(''); // ✅ NEW
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string>('');

  const [notes, setNotes] = useState<ReservationNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  useEffect(() => {
    initPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, filters]);

  function isActiveReservation(r: Reservation | null) {
    return !!r && (r.status || '').toLowerCase() === 'active';
  }

  // ✅ صلاحيات الملاحظات (عرض + متابعة) للسيلز كمان
  function canViewNotes(user: any, r: Reservation) {
    const role = (user?.role || '').toLowerCase();
    if (role === 'admin' || role === 'sales_manager') return true;
    if (role === 'sales') return r.employee_id === user.id; // يشوف حجوزاته فقط
    return false;
  }

  function canAddNote(user: any, r: Reservation) {
    if (!canViewNotes(user, r)) return false;
    return (r.status || '').toLowerCase() === 'active'; // متابعة للحجز Active فقط
  }

  async function initPage() {
    setLoading(true);
    setDebugInfo('جاري تحميل البيانات...');

    try {
      const user = await getCurrentEmployee();
      setCurrentUser(user);

      const userProjects = await fetchAllowedProjects(user);
      setAllowedProjects(userProjects);

      if (user?.role === 'admin') {
        const allProjects = await fetchAllProjects();
        setProjects(allProjects);
      } else {
        setProjects(userProjects);
      }

      await fetchReservations(user, userProjects);
      await fetchEmployees(user, userProjects);
    } catch (error) {
      console.error('Error initializing page:', error);
      setDebugInfo(`خطأ في تحميل الصفحة: ${error instanceof Error ? error.message : 'حدث خطأ غير معروف'}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchReservationNotes(reservationId: string) {
    setNotesLoading(true);
    try {
      const { data, error } = await supabase
        .from('reservation_notes')
        .select('id, note_text, created_at, employees:created_by(id, name)')
        .eq('reservation_id', reservationId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) throw error;

      setNotes((data || []) as any);
    } catch (err: any) {
      console.error('Error fetching reservation notes:', err);
      setNotes([]);
      setNoteError(err?.message || 'حدث خطأ أثناء جلب الملاحظات.');
    } finally {
      setNotesLoading(false);
    }
  }

  function openNotesModal(r: Reservation) {
    if (!currentUser) return;
    if (!canViewNotes(currentUser, r)) return;

    setNotesReservation(r);
    setSelectedNote('');
    setCustomNote(''); // ✅ NEW
    setNoteError('');
    setNotes([]);
    setNotesOpen(true);
    fetchReservationNotes(r.id);
  }

  // ✅ UPDATED: يحفظ الاتنين معًا (كسطرين منفصلين في reservation_notes)
  async function addNote() {
    if (!currentUser) {
      setNoteError('غير مسموح لك.');
      return;
    }
    if (!notesReservation) return;

    if (!canAddNote(currentUser, notesReservation)) {
      setNoteError('غير مسموح لك أو حالة الحجز ليست Active.');
      return;
    }

    const picked = (selectedNote || '').trim();
    const typed = (customNote || '').trim();

    if (!picked && !typed) {
      setNoteError('اختار ملاحظة أو اكتب ملاحظة.');
      return;
    }

    if (picked && !NOTE_OPTIONS.includes(picked as any)) {
      setNoteError('الملاحظة المختارة غير صحيحة.');
      return;
    }

    // حد أقصى (اختياري)
    if (typed && typed.length > 500) {
      setNoteError('الملاحظة طويلة جدًا (حد أقصى 500 حرف).');
      return;
    }

    const rowsToInsert: any[] = [];
    if (picked) {
      rowsToInsert.push({
        reservation_id: notesReservation.id,
        note_text: picked,
        created_by: currentUser.id,
      });
    }
    if (typed) {
      rowsToInsert.push({
        reservation_id: notesReservation.id,
        note_text: typed,
        created_by: currentUser.id,
      });
    }

    setNoteSaving(true);
    setNoteError('');

    const { error } = await supabase.from('reservation_notes').insert(rowsToInsert);

    if (error) {
      setNoteSaving(false);
      setNoteError(error.message || 'حدث خطأ أثناء حفظ الملاحظة.');
      return;
    }

    setNoteSaving(false);
    setSelectedNote('');
    setCustomNote('');
    await fetchReservationNotes(notesReservation.id);
  }

  function closeNotesModal() {
    if (noteSaving) return;
    setNotesOpen(false);
    setNotesReservation(null);
    setSelectedNote('');
    setCustomNote(''); // ✅ NEW
    setNoteError('');
    setNotes([]);
  }

  /**
   * ✅ fetchEmployees (للفلاتر فقط)
   */
  async function fetchEmployees(user: any, userProjects: { id: string; name: string }[]) {
    try {
      if (user?.role === 'admin') {
        const { data, error } = await supabase.from('employees').select('id, name, role').order('name');
        if (error) throw error;
        setEmployees(data || []);
        return;
      }

      if (user?.role === 'sales') {
        setEmployees([{ id: user.id, name: user.name, role: user.role }]);
        return;
      }

      if (user?.role === 'sales_manager') {
        const allowedProjectIds = normalizeIds((userProjects || []).map((p) => p.id));

        if (allowedProjectIds.length === 0) {
          setEmployees([{ id: user.id, name: user.name, role: user.role }]);
          return;
        }

        const epAll: any[] = [];
        const projChunks = chunkArray(allowedProjectIds, 150);

        for (const ch of projChunks) {
          const { data: empProjects, error: epErr } = await supabase
            .from('employee_projects')
            .select('employee_id')
            .in('project_id', ch);

          if (epErr) throw epErr;
          if (empProjects?.length) epAll.push(...empProjects);
        }

        const employeeIds = normalizeIds(uniq([...(epAll || []).map((x: any) => x.employee_id), user.id]));

        const employeesAll: any[] = [];
        const empChunks = chunkArray(employeeIds, 200);

        for (const ch of empChunks) {
          const { data: employeesData, error: empErr } = await supabase
            .from('employees')
            .select('id, name, role')
            .in('id', ch)
            .order('name');

          if (empErr) throw empErr;
          if (employeesData?.length) employeesAll.push(...employeesData);
        }

        const final = dedupeById(employeesAll).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setEmployees(final);
        return;
      }

      setEmployees([{ id: user.id, name: user.name, role: user.role }]);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees(user ? [{ id: user.id, name: user.name, role: user.role }] : []);
    }
  }

  /**
   * ✅ fetchReservations
   */
  async function fetchReservations(user: any, userProjects: { id: string; name: string }[]) {
    setDebugInfo('جاري تحميل الحجوزات...');
    try {
      let reservationsBase: any[] = [];

      if (user?.role === 'sales') {
        let page = 0;
        const pageSize = 1000;
        const all: any[] = [];

        while (true) {
          const from = page * pageSize;
          const to = from + pageSize - 1;

          const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('employee_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to);

          if (error) throw error;

          const rows = data || [];
          all.push(...rows);

          if (rows.length < pageSize) break;
          page++;
        }

        reservationsBase = all;
      } else if (user?.role === 'admin') {
        let page = 0;
        const pageSize = 1000;
        const all: any[] = [];

        while (true) {
          const from = page * pageSize;
          const to = from + pageSize - 1;

          const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, to);

          if (error) throw error;

          const rows = data || [];
          all.push(...rows);

          if (rows.length < pageSize) break;
          page++;
        }

        reservationsBase = all;
      } else if (user?.role === 'sales_manager') {
        const allowedProjectIds = normalizeIds((userProjects || []).map((p) => p.id));

        if (!allowedProjectIds.length) {
          setReservations([]);
          calculateStats([]);
          setDebugInfo('لا توجد مشاريع مسموحة لمدير المبيعات.');
          return;
        }

        const projChunks = chunkArray(allowedProjectIds, 120);
        const unitsAll: any[] = [];

        for (const ch of projChunks) {
          let page = 0;
          const pageSize = 1000;

          while (true) {
            const from = page * pageSize;
            const to = from + pageSize - 1;

            const { data, error } = await supabase
              .from('units')
              .select('id, unit_code, unit_type, project_id')
              .in('project_id', ch)
              .range(from, to);

            if (error) throw error;

            const rows = data || [];
            unitsAll.push(...rows);

            if (rows.length < pageSize) break;
            page++;
          }
        }

        const unitIds = normalizeIds(unitsAll.map((u: any) => u.id));

        if (!unitIds.length) {
          setReservations([]);
          calculateStats([]);
          setDebugInfo('لا توجد وحدات داخل المشاريع المسموحة.');
          return;
        }

        const unitChunks = chunkArray(unitIds, 200);
        const allRes: any[] = [];
        const pageSize = 1000;

        for (const ch of unitChunks) {
          let page = 0;

          while (true) {
            const from = page * pageSize;
            const to = from + pageSize - 1;

            const { data, error } = await supabase
              .from('reservations')
              .select('*')
              .in('unit_id', ch)
              .order('created_at', { ascending: false })
              .range(from, to);

            if (error) throw error;

            const rows = data || [];
            allRes.push(...rows);

            if (rows.length < pageSize) break;
            page++;
          }
        }

        reservationsBase = dedupeById(allRes).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else {
        reservationsBase = [];
      }

      setDebugInfo(`تم جلب ${reservationsBase.length} حجز (بدون تفاصيل)`);

      if (!reservationsBase.length) {
        setReservations([]);
        calculateStats([]);
        return;
      }

      const clientIds = normalizeIds(uniq(reservationsBase.map((r) => r.client_id)));
      const unitIds = normalizeIds(uniq(reservationsBase.map((r) => r.unit_id)));
      const employeeIds = normalizeIds(uniq(reservationsBase.map((r) => r.employee_id)));

      const clientsMap = new Map<string, any>();
      if (clientIds.length) {
        const clientChunks = chunkArray(clientIds, 200);
        for (const ch of clientChunks) {
          const { data, error } = await supabase.from('clients').select('id, name, mobile, status').in('id', ch);
          if (error) throw error;
          (data || []).forEach((c: any) => clientsMap.set(c.id, c));
        }
      }

      const unitsMap = new Map<string, any>();
      let projectIds: string[] = [];

      if (unitIds.length) {
        const unitChunks = chunkArray(unitIds, 200);
        const tmpUnits: any[] = [];

        for (const ch of unitChunks) {
          const { data, error } = await supabase
            .from('units')
            .select('id, unit_code, unit_type, project_id')
            .in('id', ch);
          if (error) throw error;
          if (data?.length) tmpUnits.push(...data);
        }

        tmpUnits.forEach((u: any) => unitsMap.set(u.id, u));
        projectIds = normalizeIds(uniq(tmpUnits.map((u: any) => u.project_id)));
      }

      const projectsMap = new Map<string, any>();
      if (projectIds.length) {
        const projChunks = chunkArray(projectIds, 200);
        for (const ch of projChunks) {
          const { data, error } = await supabase.from('projects').select('id, name').in('id', ch);
          if (error) throw error;
          (data || []).forEach((p: any) => projectsMap.set(p.id, p));
        }
      }

      const employeesMap = new Map<string, any>();
      if (employeeIds.length) {
        const empChunks = chunkArray(employeeIds, 200);
        for (const ch of empChunks) {
          const { data, error } = await supabase.from('employees').select('id, name, role').in('id', ch);
          if (error) throw error;
          (data || []).forEach((e: any) => employeesMap.set(e.id, e));
        }
      }

      const finalData: Reservation[] = reservationsBase.map((r: any) => {
        const c = r.client_id ? clientsMap.get(r.client_id) : null;
        const u = r.unit_id ? unitsMap.get(r.unit_id) : null;
        const p = u?.project_id ? projectsMap.get(u.project_id) : null;
        const e = r.employee_id ? employeesMap.get(r.employee_id) : null;

        return {
          ...r,
          clients: c ? { name: c.name, mobile: c.mobile, status: c.status } : null,
          units: u
            ? {
                unit_code: u.unit_code,
                unit_type: u.unit_type,
                project_id: u.project_id,
                project_name: p?.name,
              }
            : null,
          employees: e ? { name: e.name, role: e.role } : null,
        };
      });

      setReservations(finalData);
      calculateStats(finalData);
      setDebugInfo(`تم تحميل ${finalData.length} حجز بالتفاصيل ✅`);
    } catch (error: any) {
      console.error('Error in fetchReservations:', error);
      setDebugInfo(`خطأ في جلب الحجوزات: ${error?.message || 'Unknown error'}`);
      setReservations([]);
      calculateStats([]);
    }
  }

  const displayProjects = useMemo(() => {
    return currentUser?.role === 'admin' ? projects : allowedProjects;
  }, [currentUser?.role, projects, allowedProjects]);

  const displayEmployees = useMemo(() => {
    if (currentUser?.role === 'admin') return employees;
    if (currentUser?.role === 'sales_manager') return employees;
    return employees.filter((e) => e.id === currentUser?.id);
  }, [currentUser?.role, currentUser?.id, employees]);

  function calculateStats(data: Reservation[]) {
    const s = {
      total: data.length,
      active: data.filter((r) => (r.status || '').toLowerCase() === 'active').length,
      cancelled: data.filter((r) => (r.status || '').toLowerCase() === 'cancelled').length,
      converted: data.filter((r) => (r.status || '').toLowerCase() === 'converted').length,
    };
    setStats(s);
  }

  function applyFilters() {
    let filtered = [...reservations];

    if (filters.status !== 'all') {
      filtered = filtered.filter((r) => (r.status || '').toLowerCase() === filters.status.toLowerCase());
    }

    if (filters.employee !== 'all') {
      filtered = filtered.filter((r) => r.employee_id === filters.employee);
    }

    if (filters.project !== 'all') {
      filtered = filtered.filter((r) => r.units?.project_id === filters.project);
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter((r) => new Date(r.reservation_date) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((r) => new Date(r.reservation_date) <= toDate);
    }

    if (filters.unitType !== 'all') {
      filtered = filtered.filter((r) => r.units?.unit_type === filters.unitType);
    }

    if (filters.search) {
      const t = filters.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.clients?.name?.toLowerCase().includes(t) ||
          r.clients?.mobile?.includes(filters.search) ||
          r.units?.unit_code?.toLowerCase().includes(t) ||
          r.id.toLowerCase().includes(t)
      );
    }

    filtered.sort((a, b) => {
      let av: any, bv: any;

      switch (filters.sortBy) {
        case 'client_name':
          av = a.clients?.name || '';
          bv = b.clients?.name || '';
          break;
        case 'reservation_date':
          av = new Date(a.reservation_date).getTime();
          bv = new Date(b.reservation_date).getTime();
          break;
        default:
          av = new Date(a.created_at).getTime();
          bv = new Date(b.created_at).getTime();
      }

      return filters.sortOrder === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });

    setFilteredReservations(filtered);
  }

  function handleFilterChange(key: keyof FilterState, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters({
      status: 'all',
      employee: 'all',
      project: 'all',
      dateFrom: '',
      dateTo: '',
      search: '',
      unitType: 'all',
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
  }

  function getStatusColor(status: string) {
    switch ((status || '').toLowerCase()) {
      case 'active':
        return 'success';
      case 'cancelled':
        return 'danger';
      case 'converted':
        return 'primary';
      default:
        return 'default';
    }
  }

  function formatDate(dateString: string) {
    try {
      return new Date(dateString).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'تاريخ غير صالح';
    }
  }

  function formatDateTime(dt: string) {
    try {
      return new Date(dt).toLocaleString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dt;
    }
  }

  function getProjectName(unit: any) {
    if (unit?.project_name) return unit.project_name;
    if (unit?.project_id) {
      const p = projects.find((x) => x.id === unit.project_id);
      return p ? p.name : 'غير محدد';
    }
    return 'غير محدد';
  }

  function getUserPermissionInfo() {
    if (!currentUser) return '';
    switch (currentUser.role) {
      case 'admin':
        return 'مدير النظام - مشاهدة جميع الحجوزات';
      case 'sales_manager':
        return `مدير مبيعات - مشاهدة حجوزات ${allowedProjects.length} مشروع`;
      case 'sales':
        return 'مندوب مبيعات - مشاهدة حجوزاتك فقط';
      default:
        return 'صلاحية غير معروفة';
    }
  }

  if (loading) {
    return (
      <div
        className="page"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '50px',
              height: '50px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #3498db',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px',
            }}
          />
          <div style={{ color: '#666', marginBottom: '10px' }}>جاري تحميل الحجوزات...</div>
          <div style={{ fontSize: '12px', color: '#999' }}>{debugInfo}</div>
          {currentUser && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                backgroundColor: '#e3f2fd',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#1565c0',
              }}
            >
              ⚙️ {getUserPermissionInfo()}
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="page">
      {/* ===== HEADER ===== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '30px',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 10px 0', color: '#2c3e50', fontSize: '28px' }}>📋 إدارة الحجوزات</h1>
          <p style={{ color: '#666', margin: 0 }}>
            إجمالي الحجوزات: <strong>{reservations.length}</strong> حجز
          </p>

          {currentUser && (
            <div
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                backgroundColor: '#e3f2fd',
                borderRadius: '4px',
                fontSize: '13px',
                color: '#1565c0',
                display: 'inline-block',
              }}
            >
              ⚙️ {getUserPermissionInfo()}
            </div>
          )}

          {debugInfo && (
            <div
              style={{
                marginTop: '5px',
                fontSize: '12px',
                color: '#666',
                backgroundColor: '#f8f9fa',
                padding: '5px 10px',
                borderRadius: '4px',
                display: 'inline-block',
              }}
            >
              {debugInfo}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? '✖ إخفاء الفلاتر' : '🔍 عرض الفلاتر'}
          </Button>

          <Button onClick={() => router.push('/dashboard/reservations/new')}>➕ حجز جديد</Button>

          <Button variant="secondary" onClick={() => window.print()}>
            🖨️ طباعة التقرير
          </Button>

          <Button variant="secondary" onClick={initPage}>
            🔄 تحديث البيانات
          </Button>
        </div>
      </div>

      {/* ===== STATISTICS CARDS ===== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '30px',
        }}
      >
        <StatCard title="إجمالي الحجوزات" value={stats.total} color="#3498db" icon="📋" />
        <StatCard title="نشطة" value={stats.active} color="#2ecc71" icon="✅" />
        <StatCard title="ملغاة" value={stats.cancelled} color="#e74c3c" icon="❌" />
        <StatCard title="محوّلة (Converted)" value={stats.converted} color="#9b59b6" icon="🎉" />
      </div>

      {/* ===== FILTERS PANEL ===== */}
      {showFilters && (
        <div style={{ marginBottom: '30px' }}>
          <Card title="🔍 فلاتر البحث">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px',
                padding: '20px',
              }}
            >
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                  بحث سريع
                </label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  placeholder="ابحث بالعميل، رقم الجوال، كود الوحدة..."
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                  حالة الحجز
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white',
                  }}
                >
                  <option value="all">جميع الحالات</option>
                  <option value="active">نشطة</option>
                  <option value="cancelled">ملغاة</option>
                  <option value="converted">محوّلة (Converted)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                  الموظف
                </label>
                <select
                  value={filters.employee}
                  onChange={(e) => handleFilterChange('employee', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white',
                  }}
                >
                  <option value="all">جميع الموظفين</option>
                  {displayEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role === 'admin' ? 'مدير' : emp.role === 'sales_manager' ? 'مدير مبيعات' : 'مندوب'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                  المشروع
                </label>
                <select
                  value={filters.project}
                  onChange={(e) => handleFilterChange('project', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white',
                  }}
                >
                  <option value="all">جميع المشاريع</option>
                  {displayProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                  من تاريخ
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                  إلى تاريخ
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                  نوع الوحدة
                </label>
                <select
                  value={filters.unitType}
                  onChange={(e) => handleFilterChange('unitType', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 15px',
                    borderRadius: '8px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white',
                  }}
                >
                  <option value="all">جميع الأنواع</option>
                  <option value="شقة">شقة</option>
                  <option value="فيلا">فيلا</option>
                  <option value="متجر">متجر</option>
                  <option value="أرض">أرض</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                  ترتيب حسب
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => handleFilterChange('sortBy', e.target.value as any)}
                    style={{
                      flex: 1,
                      padding: '10px 15px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '14px',
                      backgroundColor: 'white',
                    }}
                  >
                    <option value="created_at">تاريخ الإنشاء</option>
                    <option value="reservation_date">تاريخ الحجز</option>
                    <option value="client_name">اسم العميل</option>
                  </select>

                  <select
                    value={filters.sortOrder}
                    onChange={(e) => handleFilterChange('sortOrder', e.target.value as any)}
                    style={{
                      padding: '10px 15px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '14px',
                      backgroundColor: 'white',
                    }}
                  >
                    <option value="desc">تنازلي</option>
                    <option value="asc">تصاعدي</option>
                  </select>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                padding: '20px',
                borderTop: '1px solid #eee',
              }}
            >
              <Button variant="secondary" onClick={resetFilters}>
                🔄 إعادة الضبط
              </Button>
              <Button onClick={() => setShowFilters(false)}>تطبيق الفلاتر</Button>
            </div>
          </Card>
        </div>
      )}

      {/* ===== RESULTS SUMMARY ===== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #e9ecef',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#495057', fontWeight: '500' }}>نتائج البحث:</span>
          <span style={{ color: '#2c3e50', fontWeight: '600' }}>{filteredReservations.length} حجز</span>
        </div>

        {filters.search && (
          <div
            style={{
              backgroundColor: '#e3f2fd',
              padding: '5px 15px',
              borderRadius: '20px',
              fontSize: '14px',
              color: '#1565c0',
            }}
          >
            🔍 البحث: "{filters.search}"
          </div>
        )}
      </div>

      {/* ===== RESERVATIONS TABLE ===== */}
      <Card>
        {filteredReservations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📭</div>
            <h3 style={{ marginBottom: '10px', color: '#495057' }}>
              {reservations.length === 0 ? 'لا توجد حجوزات' : 'لا توجد حجوزات تطابق معايير البحث'}
            </h3>
            <p style={{ marginBottom: '20px' }}>
              {reservations.length === 0
                ? 'لم يتم إضافة أي حجوزات بعد. يمكنك إضافة حجوزات جديدة من الزر أعلاه.'
                : 'لم يتم العثور على حجوزات تطابق معايير البحث. حاول تغيير الفلاتر.'}
            </p>

            {reservations.length === 0 ? (
              <Button onClick={() => router.push('/dashboard/reservations/new')}>➕ إضافة حجز جديد</Button>
            ) : (
              <Button variant="secondary" onClick={resetFilters}>
                🔄 عرض جميع الحجوزات
              </Button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  {['رقم الحجز', 'العميل', 'الوحدة', 'المشروع', 'تاريخ الحجز', 'الحالة', 'الموظف', 'الإجراءات'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '15px',
                        textAlign: 'right',
                        fontWeight: '600',
                        color: '#495057',
                        fontSize: '14px',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredReservations.map((reservation, index) => (
                  <tr
                    key={reservation.id}
                    style={{
                      backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa',
                      borderBottom: '1px solid #e9ecef',
                      transition: 'background-color 0.2s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e9ecef')}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f8f9fa')
                    }
                    onClick={() => router.push(`/dashboard/clients/${reservation.client_id}/reservation/${reservation.id}`)}
                  >
                    <td style={{ padding: '15px' }}>
                      <div
                        style={{
                          fontWeight: '600',
                          color: '#2c3e50',
                          fontFamily: 'monospace',
                          fontSize: '13px',
                        }}
                      >
                        #{reservation.id.substring(0, 8)}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {reservation.clients?.name || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        📱 {reservation.clients?.mobile || 'غير متوفر'}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {reservation.units?.unit_code || 'غير محدد'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {reservation.units?.unit_type || 'غير محدد'}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{getProjectName(reservation.units)}</div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{formatDate(reservation.reservation_date)}</div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                        {new Date(reservation.created_at).toLocaleTimeString('ar-SA', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <StatusBadge status={getStatusColor(reservation.status)}>{reservation.status}</StatusBadge>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ color: '#495057' }}>{reservation.employees?.name || 'غير محدد'}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                        {reservation.employees?.role === 'admin'
                          ? 'مدير'
                          : reservation.employees?.role === 'sales_manager'
                          ? 'مدير مبيعات'
                          : 'مندوب'}
                      </div>
                    </td>

                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/dashboard/clients/${reservation.client_id}/reservation/${reservation.id}`);
                          }}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#e3f2fd',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#1565c0',
                            cursor: 'pointer',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          👁️ عرض
                        </button>

                        {/* ✅ 👁️ ملاحظات: تظهر للـ admin & sales_manager & sales (على حجوزه) */}
                        {currentUser && canViewNotes(currentUser, reservation) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openNotesModal(reservation);
                            }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#f3e5f5',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#6a1b9a',
                              cursor: 'pointer',
                              fontSize: '13px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            👁️ ملاحظات
                          </button>
                        )}

                        {/* ✅ 📝 متابعة: تظهر للـ admin & sales_manager & sales (Active فقط + على حجوزه) */}
                        {currentUser && canAddNote(currentUser, reservation) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openNotesModal(reservation);
                            }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#e8f5e9',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#2e7d32',
                              cursor: 'pointer',
                              fontSize: '13px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            📝 متابعة
                          </button>
                        )}

                        {currentUser?.role === 'admin' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/dashboard/reservations/edit/${reservation.id}`);
                            }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#fff3e0',
                              border: 'none',
                              borderRadius: '6px',
                              color: '#f57c00',
                              cursor: 'pointer',
                              fontSize: '13px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            ✏️ تعديل
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ===== Notes Modal ===== */}
      {notesOpen && notesReservation && (
        <div
          onClick={closeNotesModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '820px',
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid #eee',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #eee' }}>
              <div style={{ fontWeight: 800, color: '#2c3e50', fontSize: '16px' }}>
                🗂️ ملاحظات الحجز #{notesReservation.id.substring(0, 8)}
              </div>
              <div style={{ marginTop: '6px', fontSize: '13px', color: '#666' }}>
                العميل: {notesReservation.clients?.name || 'غير محدد'} — الوحدة: {notesReservation.units?.unit_code || 'غير محدد'}
              </div>
            </div>

            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* إضافة ملاحظة (Active فقط + صلاحية) */}
              <div>
                <div style={{ fontWeight: 800, marginBottom: '8px', color: '#2c3e50' }}>➕ إضافة ملاحظة</div>

                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>
                  اختر الملاحظة
                </label>

                <select
                  value={selectedNote}
                  onChange={(e) => setSelectedNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'white',
                  }}
                  disabled={!currentUser || !canAddNote(currentUser, notesReservation) || noteSaving}
                >
                  <option value="">— اختر ملاحظة —</option>
                  {NOTE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>

                {/* ✅ NEW: كتابة ملاحظة (مع الاختيار) */}
                <div style={{ marginTop: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>
                    أو اكتب ملاحظة
                  </label>

                  <textarea
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    placeholder="اكتب ملاحظتك هنا..."
                    style={{
                      width: '100%',
                      minHeight: '90px',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid #ddd',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'white',
                      resize: 'vertical',
                    }}
                    disabled={!currentUser || !canAddNote(currentUser, notesReservation) || noteSaving}
                  />

                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '12px',
                      color: '#999',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>ممكن تختار من القائمة وتكتب كمان — الاتنين هيتسجلوا.</span>
                    <span>{(customNote || '').trim().length}/500</span>
                  </div>
                </div>

                {currentUser && !canAddNote(currentUser, notesReservation) && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
                    لا يمكن إضافة ملاحظة (إما الحالة ليست Active أو لا تملك صلاحية على هذا الحجز).
                  </div>
                )}

                {noteError && (
                  <div
                    style={{
                      marginTop: '10px',
                      background: '#fdecea',
                      border: '1px solid #f5c6cb',
                      color: '#721c24',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                  >
                    ⚠️ {noteError}
                  </div>
                )}

                <div style={{ marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  {currentUser && canAddNote(currentUser, notesReservation) && (
                    <Button onClick={addNote} disabled={noteSaving}>
                      {noteSaving ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                  )}
                </div>
              </div>

              {/* عرض السجل */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 800, color: '#2c3e50' }}>📌 سجل الملاحظات (بالترتيب)</div>

                  <button
                    onClick={() => fetchReservationNotes(notesReservation.id)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: '#333',
                    }}
                    disabled={notesLoading}
                  >
                    🔄 تحديث
                  </button>
                </div>

                <div
                  style={{
                    border: '1px solid #eee',
                    borderRadius: '10px',
                    padding: '10px',
                    maxHeight: '320px',
                    overflowY: 'auto',
                    background: '#fafafa',
                  }}
                >
                  {notesLoading ? (
                    <div style={{ color: '#666', fontSize: '13px' }}>جاري تحميل الملاحظات...</div>
                  ) : notes.length === 0 ? (
                    <div style={{ color: '#666', fontSize: '13px' }}>لا توجد ملاحظات مسجلة لهذا الحجز.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {notes.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            background: '#fff',
                            border: '1px solid #eee',
                            borderRadius: '10px',
                            padding: '10px',
                          }}
                        >
                          <div style={{ fontSize: '13px', color: '#2c3e50', whiteSpace: 'pre-wrap' }}>{n.note_text}</div>
                          <div style={{ marginTop: '8px', fontSize: '12px', color: '#777' }}>
                            👤 {n.employees?.name || 'غير محدد'} — 🕒 {formatDateTime(n.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '16px 18px',
                borderTop: '1px solid #eee',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <Button variant="secondary" onClick={closeNotesModal} disabled={noteSaving}>
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== FOOTER INFO ===== */}
      <div
        style={{
          marginTop: '30px',
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#6c757d',
          textAlign: 'center',
          border: '1px dashed #dee2e6',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span>آخر تحديث للحجوزات: {new Date().toLocaleString('ar-SA')}</span>
          <span>
            إجمالي النتائج: {filteredReservations.length} من {reservations.length}
          </span>
          <span>عدد الموظفين: {displayEmployees.length}</span>
          <span>عدد المشاريع: {displayProjects.length}</span>
        </div>
      </div>
    </div>
  );
}

/* =====================
   Stat Card Component
===================== */

function StatCard({ title, value, color, icon }: { title: string; value: number; color: string; icon: string }) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '25px',
        border: `1px solid ${color}20`,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
        transition: 'transform 0.3s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
      }}
      onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-5px)')}
      onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '12px',
          backgroundColor: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          color: color,
        }}
      >
        {icon}
      </div>

      <div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>{title}</div>
      </div>
    </div>
  );
}
