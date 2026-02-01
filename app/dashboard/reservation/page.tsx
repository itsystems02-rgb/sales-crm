'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
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
   Unit Types (لازم تطابق قيم units.unit_type في الداتا)
===================== */

const UNIT_TYPES = [
  { value: 'villa', label: 'فيلا' },
  { value: 'duplex', label: 'دوبلكس' },
  { value: 'apartment', label: 'شقة' },
  { value: 'townhouse', label: 'تاون هاوس' },
] as const;

/* =====================
   Types
===================== */

type Employee = {
  id: string;
  name: string;
  role: 'admin' | 'sales' | 'sales_manager';
};

type ReservationRow = {
  id: string;
  reservation_date: string;
  status: string;
  bank_name: string | null;
  client_id: string;
  unit_id: string;
  employee_id: string | null;
  created_at: string;
  clients: { name: string; mobile: string; status: string } | null;
  units: { unit_code: string; unit_type: string | null; project_id: string; project_name?: string } | null;
  employees: { name: string; role: string } | null;
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

type ProjectOption = { id: string; name: string; code?: string | null };

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

function getRoleLabel(role: string) {
  switch ((role || '').toLowerCase()) {
    case 'admin':
      return 'مدير';
    case 'sales_manager':
      return 'مدير مبيعات';
    case 'sales':
      return 'مندوب';
    default:
      return role;
  }
}

async function fetchAllowedProjects(employee: Employee | null): Promise<ProjectOption[]> {
  try {
    if (!employee) return [];

    if (employee.role === 'admin') {
      const { data, error } = await supabase.from('projects').select('id,name,code').order('name');
      if (error) throw error;
      return (data || []) as any;
    }

    const { data: ep, error: epErr } = await supabase
      .from('employee_projects')
      .select('project_id, projects:projects(id,name,code)')
      .eq('employee_id', employee.id);

    if (epErr) throw epErr;

    const mapped = (ep || [])
      .map((x: any) => x.projects)
      .filter(Boolean)
      .map((p: any) => ({ id: p.id, name: p.name, code: p.code }));

    // dedupe
    const m = new Map<string, ProjectOption>();
    mapped.forEach((p) => m.set(p.id, p));
    return Array.from(m.values()).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  } catch (e) {
    console.error('fetchAllowedProjects error:', e);
    return [];
  }
}

/* =====================
   Page
===================== */

export default function ReservationsPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<Employee | null>(null);

  // server-side rows
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // dropdowns
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; role: string }[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // stats
  const [stats, setStats] = useState({ total: 0, active: 0, cancelled: 0, converted: 0 });

  // Filters
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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const totalPages = Math.max(1, Math.ceil(totalRows / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + rows.length, totalRows);

  // Notes Modal
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesReservation, setNotesReservation] = useState<ReservationRow | null>(null);
  const [selectedNote, setSelectedNote] = useState<string>('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string>('');
  const [notes, setNotes] = useState<ReservationNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const filtersPayload = useMemo(
    () => ({
      status: filters.status,
      employee: filters.employee,
      project: filters.project,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      search: filters.search,
      unitType: filters.unitType,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
    [filters]
  );

  function canManageNotes(user: Employee | null) {
    const role = (user?.role || '').toLowerCase();
    return role === 'admin' || role === 'sales_manager';
  }

  function isActiveReservation(r: ReservationRow | null) {
    return !!r && (r.status || '').toLowerCase() === 'active';
  }

  /* =====================
     Init
  ===================== */

  useEffect(() => {
    initPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initPage = useCallback(async () => {
    setLoading(true);
    setStatsLoading(true);
    setError(null);

    try {
      const user = (await getCurrentEmployee()) as Employee;
      setCurrentUser(user);

      // projects dropdown
      const allowed = await fetchAllowedProjects(user);
      setProjects(allowed);

      // employees dropdown (بسيطة: admin يشوف الكل / sales يشوف نفسه / sales_manager يشوف team)
      // لو عندك جدول/طريقة جاهزة للتيم ابعتهالي ونزبطها أكثر، لكن دي أقل استعلامات:
      if (user.role === 'admin') {
        const { data, error } = await supabase.from('employees').select('id,name,role').order('name');
        if (error) throw error;
        setEmployees((data || []) as any);
      } else if (user.role === 'sales') {
        setEmployees([{ id: user.id, name: user.name, role: user.role }]);
      } else {
        // sales_manager: نجيب كل موظفين المشاريع بتاعته
        const projIds = allowed.map((p) => p.id);
        if (!projIds.length) {
          setEmployees([{ id: user.id, name: user.name, role: user.role }]);
        } else {
          const { data: ep, error: epErr } = await supabase
            .from('employee_projects')
            .select('employee_id, employees:employees(id,name,role)')
            .in('project_id', projIds);

          if (epErr) throw epErr;

          const mapped = (ep || [])
            .map((x: any) => x.employees)
            .filter(Boolean)
            .map((e: any) => ({ id: e.id, name: e.name, role: e.role }));

          const m = new Map<string, any>();
          mapped.forEach((e) => m.set(e.id, e));
          m.set(user.id, { id: user.id, name: user.name, role: user.role });

          setEmployees(Array.from(m.values()).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')));
        }
      }

      // أول تحميل
      await Promise.all([loadReservations(1, itemsPerPage, filtersPayload), loadStats(filtersPayload)]);
      setCurrentPage(1);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'حدث خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
      setStatsLoading(false);
    }
  }, [itemsPerPage, filtersPayload]);

  /* =====================
     RPC Calls
  ===================== */

  async function loadReservations(page: number, pageSize: number, fp: any) {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('reservations_list', {
        filters: fp,
        page,
        page_size: pageSize,
      });

      if (error) throw error;

      const total = Number(data?.total || 0);
      const list = (data?.rows || []) as ReservationRow[];

      setTotalRows(total);
      setRows(list);
    } catch (e: any) {
      console.error('loadReservations error:', e);
      setError(e?.message || 'حدث خطأ في جلب الحجوزات');
      setTotalRows(0);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats(fp: any) {
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.rpc('reservations_stats', { filters: fp });
      if (error) throw error;

      setStats({
        total: Number(data?.total || 0),
        active: Number(data?.active || 0),
        cancelled: Number(data?.cancelled || 0),
        converted: Number(data?.converted || 0),
      });
    } catch (e) {
      console.error('loadStats error:', e);
      setStats({ total: 0, active: 0, cancelled: 0, converted: 0 });
    } finally {
      setStatsLoading(false);
    }
  }

  // Debounce للفلاتر + pagination
  useEffect(() => {
    const t = setTimeout(() => {
      const safePage = Math.min(currentPage, totalPages);
      loadReservations(safePage, itemsPerPage, filtersPayload);
      loadStats(filtersPayload);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersPayload, currentPage, itemsPerPage]);

  // لو الفلاتر اتغيرت رجع للصفحة 1
  useEffect(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.status,
    filters.employee,
    filters.project,
    filters.dateFrom,
    filters.dateTo,
    filters.search,
    filters.unitType,
    filters.sortBy,
    filters.sortOrder,
  ]);

  /* =====================
     Notes
  ===================== */

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
      console.error('fetchReservationNotes error:', err);
      setNotes([]);
      setNoteError(err?.message || 'حدث خطأ أثناء جلب الملاحظات.');
    } finally {
      setNotesLoading(false);
    }
  }

  function openNotesModal(r: ReservationRow) {
    if (!canManageNotes(currentUser)) return;
    setNotesReservation(r);
    setSelectedNote('');
    setNoteError('');
    setNotes([]);
    setNotesOpen(true);
    fetchReservationNotes(r.id);
  }

  async function addNote() {
    if (!canManageNotes(currentUser)) {
      setNoteError('غير مسموح لك.');
      return;
    }
    if (!notesReservation) return;

    if (!isActiveReservation(notesReservation)) {
      setNoteError('لا يمكن إضافة ملاحظة إلا للحجز النشط (Active).');
      return;
    }

    const text = (selectedNote || '').trim();
    if (!text) return setNoteError('اختار الملاحظة الأول.');
    if (!NOTE_OPTIONS.includes(text as any)) return setNoteError('الملاحظة المختارة غير صحيحة.');

    setNoteSaving(true);
    setNoteError('');

    const { error } = await supabase.from('reservation_notes').insert({
      reservation_id: notesReservation.id,
      note_text: text,
      created_by: currentUser!.id,
    });

    if (error) {
      setNoteSaving(false);
      setNoteError(error.message || 'حدث خطأ أثناء حفظ الملاحظة.');
      return;
    }

    setNoteSaving(false);
    setSelectedNote('');
    await fetchReservationNotes(notesReservation.id);
  }

  function closeNotesModal() {
    if (noteSaving) return;
    setNotesOpen(false);
    setNotesReservation(null);
    setSelectedNote('');
    setNoteError('');
    setNotes([]);
  }

  /* =====================
     Filters UI helpers
  ===================== */

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

  function getUserPermissionInfo() {
    if (!currentUser) return '';
    switch (currentUser.role) {
      case 'admin':
        return 'مدير النظام - مشاهدة جميع الحجوزات';
      case 'sales_manager':
        return 'مدير مبيعات - مشاهدة حجوزات مشاريعك';
      case 'sales':
        return 'مندوب مبيعات - مشاهدة حجوزاتك فقط';
      default:
        return 'صلاحية غير معروفة';
    }
  }

  /* =====================
     Render
  ===================== */

  if (loading && rows.length === 0 && !error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            width: '50px',
            height: '50px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #3498db',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ color: '#666' }}>جاري تحميل الحجوزات...</div>
        {currentUser && (
          <div style={{ padding: '8px 16px', backgroundColor: '#e3f2fd', borderRadius: '6px', fontSize: '12px', color: '#1565c0' }}>
            ⚙️ {getUserPermissionInfo()}
          </div>
        )}
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '20px', borderRadius: '10px', marginBottom: '16px' }}>
          <h2 style={{ marginTop: 0 }}>⚠️ حدث خطأ</h2>
          <p style={{ marginBottom: 0 }}>{error}</p>
        </div>
        <button
          onClick={initPage}
          style={{ padding: '10px 18px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          🔄 حاول مرة أخرى
        </button>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', color: '#2c3e50', fontSize: '28px' }}>📋 إدارة الحجوزات</h1>
          <div style={{ color: '#666' }}>
            إجمالي النتائج: <strong>{totalRows.toLocaleString('ar-SA')}</strong>
            {currentUser && (
              <span style={{ marginRight: '12px', color: '#1565c0' }}>• {getUserPermissionInfo()}</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? '✖ إخفاء الفلاتر' : '🔍 عرض الفلاتر'}
          </Button>

          <Button onClick={() => router.push('/dashboard/reservations/new')}>➕ حجز جديد</Button>

          <Button variant="secondary" onClick={() => window.print()}>🖨️ طباعة</Button>

          <Button variant="secondary" onClick={async () => {
            await Promise.all([
              loadReservations(currentPage, itemsPerPage, filtersPayload),
              loadStats(filtersPayload)
            ]);
          }}>
            🔄 تحديث
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {statsLoading ? (
          <>
            {[1,2,3,4].map(i => <div key={i} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, height: 96 }} />)}
          </>
        ) : (
          <>
            <StatCard title="إجمالي الحجوزات" value={stats.total} color="#3498db" icon="📋" />
            <StatCard title="نشطة" value={stats.active} color="#2ecc71" icon="✅" />
            <StatCard title="ملغاة" value={stats.cancelled} color="#e74c3c" icon="❌" />
            <StatCard title="محوّلة (Converted)" value={stats.converted} color="#9b59b6" icon="🎉" />
          </>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <div style={{ marginBottom: '20px' }}>
          <Card title="🔍 فلاتر البحث">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', padding: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>بحث سريع</label>
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="عميل / جوال / كود وحدة / رقم الحجز..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>حالة الحجز</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', background: '#fff' }}
                >
                  <option value="all">جميع الحالات</option>
                  <option value="active">Active</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="converted">Converted</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>الموظف</label>
                <select
                  value={filters.employee}
                  onChange={(e) => setFilters(prev => ({ ...prev, employee: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', background: '#fff' }}
                >
                  <option value="all">جميع الموظفين</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({getRoleLabel(emp.role)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>المشروع</label>
                <select
                  value={filters.project}
                  onChange={(e) => setFilters(prev => ({ ...prev, project: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', background: '#fff' }}
                >
                  <option value="all">جميع المشاريع</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.code ? ` (${p.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>من تاريخ</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>إلى تاريخ</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>نوع الوحدة</label>
                <select
                  value={filters.unitType}
                  onChange={(e) => setFilters(prev => ({ ...prev, unitType: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', background: '#fff' }}
                >
                  <option value="all">جميع الأنواع</option>
                  {UNIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>ترتيب حسب</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', background: '#fff' }}
                  >
                    <option value="created_at">تاريخ الإنشاء</option>
                    <option value="reservation_date">تاريخ الحجز</option>
                    <option value="client_name">اسم العميل</option>
                  </select>

                  <select
                    value={filters.sortOrder}
                    onChange={(e) => setFilters(prev => ({ ...prev, sortOrder: e.target.value as any }))}
                    style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #ddd', background: '#fff' }}
                  >
                    <option value="desc">تنازلي</option>
                    <option value="asc">تصاعدي</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px', borderTop: '1px solid #eee' }}>
              <Button variant="secondary" onClick={resetFilters}>🔄 إعادة الضبط</Button>
              <Button onClick={() => setShowFilters(false)}>تطبيق</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Summary + page size */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', padding: '12px', background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '10px' }}>
        <div style={{ color: '#495057', fontSize: '14px' }}>
          عرض <strong>{(startIndex + 1).toLocaleString('ar-SA')} - {endIndex.toLocaleString('ar-SA')}</strong> من <strong>{totalRows.toLocaleString('ar-SA')}</strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>عرض:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #ddd' }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <Card>
        {totalRows === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <div style={{ fontSize: '44px', marginBottom: '12px' }}>📭</div>
            <h3 style={{ marginBottom: '8px', color: '#495057' }}>لا توجد حجوزات</h3>
            <p style={{ marginBottom: '18px' }}>حاول تغيير الفلاتر أو البحث.</p>
            <Button onClick={() => router.push('/dashboard/reservations/new')}>➕ إضافة حجز جديد</Button>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1050px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                    {['رقم الحجز', 'العميل', 'الوحدة', 'المشروع', 'تاريخ الحجز', 'الحالة', 'الموظف', 'الإجراءات'].map((h) => (
                      <th key={h} style={{ padding: '14px', textAlign: 'right', fontWeight: 700, color: '#495057', fontSize: '14px' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r, index) => (
                    <tr
                      key={r.id}
                      style={{ backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa', borderBottom: '1px solid #e9ecef', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e9ecef')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f8f9fa')}
                      onClick={() => router.push(`/dashboard/clients/${r.client_id}/reservation/${r.id}`)}
                    >
                      <td style={{ padding: '14px' }}>
                        <div style={{ fontWeight: 700, color: '#2c3e50', fontFamily: 'monospace', fontSize: '13px' }}>
                          #{r.id.substring(0, 8)}
                        </div>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <div style={{ fontWeight: 700, color: '#2c3e50' }}>{r.clients?.name || 'غير محدد'}</div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>📱 {r.clients?.mobile || 'غير متوفر'}</div>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <div style={{ fontWeight: 700, color: '#2c3e50' }}>{r.units?.unit_code || 'غير محدد'}</div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                          {UNIT_TYPES.find(x => x.value === (r.units?.unit_type || ''))?.label || (r.units?.unit_type || 'غير محدد')}
                        </div>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <div style={{ color: '#495057' }}>{r.units?.project_name || 'غير محدد'}</div>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <div style={{ color: '#495057' }}>{formatDate(r.reservation_date)}</div>
                        <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                          {new Date(r.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <StatusBadge status={getStatusColor(r.status)}>{r.status}</StatusBadge>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <div style={{ color: '#495057' }}>{r.employees?.name || 'غير محدد'}</div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{getRoleLabel(r.employees?.role || '')}</div>
                      </td>

                      <td style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/dashboard/clients/${r.client_id}/reservation/${r.id}`);
                            }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#e3f2fd',
                              border: 'none',
                              borderRadius: '8px',
                              color: '#1565c0',
                              cursor: 'pointer',
                              fontSize: '13px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            👁️ عرض
                          </button>

                          {canManageNotes(currentUser) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openNotesModal(r);
                              }}
                              style={{
                                padding: '8px 12px',
                                backgroundColor: '#f3e5f5',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#6a1b9a',
                                cursor: 'pointer',
                                fontSize: '13px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              👁️ ملاحظات
                            </button>
                          )}

                          {canManageNotes(currentUser) && isActiveReservation(r) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openNotesModal(r);
                              }}
                              style={{
                                padding: '8px 12px',
                                backgroundColor: '#e8f5e9',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#2e7d32',
                                cursor: 'pointer',
                                fontSize: '13px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              📝 متابعة
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderTop: '1px solid #e9ecef', background: '#f8f9fa', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  صفحة <strong>{currentPage.toLocaleString('ar-SA')}</strong> من <strong>{totalPages.toLocaleString('ar-SA')}</strong>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    style={{ padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', background: currentPage === 1 ? '#e5e7eb' : '#3b82f6', color: currentPage === 1 ? '#9ca3af' : '#fff' }}
                  >
                    ⟨⟨
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', background: currentPage === 1 ? '#e5e7eb' : '#3b82f6', color: currentPage === 1 ? '#9ca3af' : '#fff' }}
                  >
                    ⟨
                  </button>

                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    style={{ padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', background: currentPage === totalPages ? '#e5e7eb' : '#3b82f6', color: currentPage === totalPages ? '#9ca3af' : '#fff' }}
                  >
                    ⟩
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    style={{ padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', background: currentPage === totalPages ? '#e5e7eb' : '#3b82f6', color: currentPage === totalPages ? '#9ca3af' : '#fff' }}
                  >
                    ⟩⟩
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Notes Modal */}
      {notesOpen && notesReservation && (
        <div
          onClick={closeNotesModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 9999 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '820px', background: '#fff', borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', overflow: 'hidden' }}
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
              <div>
                <div style={{ fontWeight: 800, marginBottom: '8px', color: '#2c3e50' }}>➕ إضافة ملاحظة</div>

                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#2c3e50' }}>
                  اختر الملاحظة
                </label>

                <select
                  value={selectedNote}
                  onChange={(e) => setSelectedNote(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
                  disabled={!isActiveReservation(notesReservation) || noteSaving}
                >
                  <option value="">— اختر ملاحظة —</option>
                  {NOTE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>

                {!isActiveReservation(notesReservation) && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>لا يمكن إضافة ملاحظة لأن حالة الحجز ليست Active.</div>
                )}

                {noteError && (
                  <div style={{ marginTop: '10px', background: '#fdecea', border: '1px solid #f5c6cb', color: '#721c24', padding: '8px 10px', borderRadius: '10px', fontSize: '13px' }}>
                    ⚠️ {noteError}
                  </div>
                )}

                <div style={{ marginTop: '12px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  {isActiveReservation(notesReservation) && canManageNotes(currentUser) && (
                    <Button onClick={addNote} disabled={noteSaving}>
                      {noteSaving ? 'جاري الحفظ...' : 'حفظ'}
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 800, color: '#2c3e50' }}>📌 سجل الملاحظات (بالترتيب)</div>

                  <button
                    onClick={() => fetchReservationNotes(notesReservation.id)}
                    style={{ padding: '6px 10px', borderRadius: '10px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '12px', color: '#333' }}
                    disabled={notesLoading}
                  >
                    🔄 تحديث
                  </button>
                </div>

                <div style={{ border: '1px solid #eee', borderRadius: '12px', padding: '10px', maxHeight: '320px', overflowY: 'auto', background: '#fafafa' }}>
                  {notesLoading ? (
                    <div style={{ color: '#666', fontSize: '13px' }}>جاري تحميل الملاحظات...</div>
                  ) : notes.length === 0 ? (
                    <div style={{ color: '#666', fontSize: '13px' }}>لا توجد ملاحظات مسجلة لهذا الحجز.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {notes.map((n) => (
                        <div key={n.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '10px' }}>
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

            <div style={{ padding: '16px 18px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="secondary" onClick={closeNotesModal} disabled={noteSaving}>إغلاق</Button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
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
        padding: '22px',
        border: `1px solid ${color}20`,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
        transition: 'transform 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}
      onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
      onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '12px',
          backgroundColor: `${color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '26px',
          color: color,
        }}
      >
        {icon}
      </div>

      <div>
        <div style={{ fontSize: '30px', fontWeight: 800, color: color, lineHeight: 1 }}>{value.toLocaleString('ar-SA')}</div>
        <div style={{ fontSize: '14px', color: '#666', marginTop: '6px' }}>{title}</div>
      </div>
    </div>
  );
}
