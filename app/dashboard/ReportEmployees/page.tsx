'use client';

import { useEffect, useMemo, useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/* =====================
   Types (Merged)
===================== */

type Role = 'admin' | 'sales' | 'sales_manager' | 'manager' | string;

type Employee = {
  id: string;
  name: string;
  email?: string;
  role: Role;
  mobile?: string;
  job_title?: string;
  status?: string;
};

type Project = {
  id: string;
  name: string;
  code: string | null;
};

/* ===== Employee Activity Report Types ===== */

type EmployeeActivityType =
  | 'client_followup'
  | 'reservation'
  | 'reservation_note'
  | 'reservation_followup'
  | 'sale'
  | 'visit';

type EmployeeActivity = {
  id: string;
  type: EmployeeActivityType;
  action: string;
  details: string;

  client_name?: string;
  client_id?: string;

  unit_code?: string;
  unit_id?: string;

  project_name?: string;

  amount?: number;

  timestamp: string; // created_at
  reference_id?: string;

  duration?: number;
  status?: string;
  notes?: string;
};

type TimeSlot = {
  hour: string;
  activities: EmployeeActivity[];
  count: number;
};

type ActivitySummary = {
  totalActivities: number;

  followUps: number;
  reservations: number;
  reservationNotes: number;
  reservationFollowUps: number;

  sales: number;
  visits: number;

  uniqueClientsTouched: number;

  totalDuration: number;
  avgActivityDuration: number;

  peakHour: string;
  busiestActivity: string;

  efficiencyScore: number;
  conversionRate: number; // sales / followups
};

type FollowUp = {
  id: string;
  type: string;
  notes?: string;
  created_at: string;
  client_id: string;
  client_name: string;
  client_status?: string;
  visit_location?: string | null;
};

type ReservationRow = {
  id: string;
  reservation_date: string;
  status: string;
  notes?: string | null;
  created_at: string;

  client_id: string;
  client_name: string;

  unit_id: string;
  unit_code: string;

  project_name?: string;
  follow_employee_id?: string | null;
  follow_up_details?: string | null;
  last_follow_up_at?: string | null;
};

type SaleRow = {
  id: string;
  sale_date: string;
  price_before_tax: number;
  contract_type?: string | null;
  finance_type?: string | null;
  finance_entity?: string | null;
  created_at: string;

  client_id: string;
  client_name: string;

  unit_id: string;
  unit_code: string;

  project_name?: string;
};

type VisitRow = {
  id: string;
  created_at: string;
  visit_date: string;
  visit_location?: string | null;
  details?: string | null;

  client_id: string;
  client_name: string;

  salary?: number | null;
  commitments?: number | null;
  bank?: string | null;
  job_sector?: string | null;
};

type ReservationNoteRow = {
  id: string;
  reservation_id: string;
  note_text: string;
  created_at: string;

  client_id?: string;
  client_name?: string;

  unit_id?: string;
  unit_code?: string;

  project_name?: string;
  reservation_status?: string;
  reservation_date?: string;
};

type DetailedActivity = {
  followUps: FollowUp[];
  reservations: ReservationRow[];
  sales: SaleRow[];
  visits: VisitRow[];
  reservationNotes: ReservationNoteRow[];
};

/* ===== Clients Report Types ===== */

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

type TabKey = 'employee_activity' | 'clients';

/* =====================
   Utils
===================== */

function buildIsoRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000`);
  const end = new Date(`${endDate}T00:00:00.000`);
  end.setDate(end.getDate() + 1); // exclusive
  return { startISO: start.toISOString(), endISOExclusive: end.toISOString() };
}

function safeText(v: any) {
  return (v ?? '').toString();
}

function relOne<T>(rel: any): T | undefined {
  if (!rel) return undefined;
  return Array.isArray(rel) ? rel[0] : rel;
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

    if (error) {
      console.error('Paged fetch error:', error);
      throw error;
    }

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMoneyEGP(v?: number) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('ar-EG')} ج.م`;
}

/* =====================
   Followup Status Buckets (FIXED)
===================== */

// حالات المتابعة (من كود followups NOTE_OPTIONS)
const FOLLOWUP_STATUS_OPTIONS = [
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
'مهتم',
  'غير مهتم',
  'طلب متابعة لاحقًا',
  'تم إرسال التفاصيل',
  'تم تحديد موعد',
  'تمت الزيارة',
  'العميل غير متواجد',
] as const;

type FollowupStatusLabel = (typeof FOLLOWUP_STATUS_OPTIONS)[number] | 'غير محدد';

function normalizeArabic(s: string) {
  return (s || '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * ✅ استخراج الحالة من النص (يدعم: "الحالة - ملاحظة" و "|" و "—")
 * لأن غالبًا الحالة عندك بتتخزن داخل notes وليس type
 */
function extractFollowupStatus(text: string): FollowupStatusLabel {
  const raw = (text || '').toString();
  const t = normalizeArabic(raw);
  if (!t) return 'غير محدد';

  // direct / startsWith / contains
  for (const opt of FOLLOWUP_STATUS_OPTIONS) {
    const o = normalizeArabic(opt);
    if (!o) continue;
    if (t === o || t.startsWith(o) || t.includes(o)) return opt;
  }

  // split parts (لو النص: "جاري رفع الطلب - العميل قال ..." أو "جاري رفع الطلب | ..." إلخ)
  const parts = raw
    .split(/[-|—–]/g)
    .map((p) => normalizeArabic(p))
    .filter(Boolean);

  for (const part of parts) {
    for (const opt of FOLLOWUP_STATUS_OPTIONS) {
      const o = normalizeArabic(opt);
      if (!o) continue;
      if (part === o || part.startsWith(o) || part.includes(o)) return opt;
    }
  }

  return 'غير محدد';
}

function countByLabel(labels: FollowupStatusLabel[]) {
  const map = new Map<FollowupStatusLabel, number>();
  for (const l of labels) map.set(l, (map.get(l) || 0) + 1);

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => {
      if (a.label === 'غير محدد') return 1;
      if (b.label === 'غير محدد') return -1;
      return b.value - a.value;
    });
}

/* =====================
   Premium UI Components (No libs)
===================== */

function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  return <span className={`r-badge r-badge--${tone}`}>{children}</span>;
}

function IconDot({ tone = 'neutral' }: { tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }) {
  return <span className={`r-dot r-dot--${tone}`} aria-hidden />;
}

function SegTabs({ value, onChange }: { value: TabKey; onChange: (v: TabKey) => void }) {
  return (
    <div className="r-tabs" role="tablist" aria-label="Reports tabs">
      <button
        className={`r-tab ${value === 'employee_activity' ? 'is-active' : ''}`}
        onClick={() => onChange('employee_activity')}
        role="tab"
        aria-selected={value === 'employee_activity'}
      >
        <span className="r-tab__icon">📌</span> تقرير الأنشطة
      </button>
      <button
        className={`r-tab ${value === 'clients' ? 'is-active' : ''}`}
        onClick={() => onChange('clients')}
        role="tab"
        aria-selected={value === 'clients'}
      >
        <span className="r-tab__icon">👥</span> تقرير العملاء
      </button>
    </div>
  );
}

function Kpi({
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
    <div className="r-kpi">
      <div className={`r-kpi__icon r-kpi__icon--${tone}`} aria-hidden>
        {icon}
      </div>
      <div className="r-kpi__body">
        <div className="r-kpi__title">{title}</div>
        <div className="r-kpi__value">{value}</div>
        {sub ? <div className="r-kpi__sub">{sub}</div> : null}
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
    <div className="r-panel">
      <div className="r-panel__head">
        <div>
          <div className="r-panel__title">{title}</div>
          {hint ? <div className="r-panel__hint">{hint}</div> : null}
        </div>
        {right ? <div className="r-panel__right">{right}</div> : null}
      </div>
      <div className="r-panel__body">{children}</div>
    </div>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="r-modal__backdrop" onClick={onClose}>
      <div className="r-modal" onClick={(e) => e.stopPropagation()}>
        <div className="r-modal__head">
          <div className="r-modal__title">{title}</div>
          <button className="r-modal__close" onClick={onClose}>
            إغلاق ✕
          </button>
        </div>
        <div className="r-modal__body">{children}</div>
      </div>
    </div>
  );
}

function MiniBars({
  items,
  maxLabel = 120,
}: {
  items: { label: string; value: number; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }[];
  maxLabel?: number;
}) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return (
    <div className="r-bars">
      {items.map((x) => {
        const pct = clamp((x.value / max) * 100, 2, 100);
        const tone = x.tone || 'neutral';
        return (
          <div key={x.label} className="r-bars__row">
            <div className="r-bars__label" style={{ maxWidth: maxLabel }}>
              <IconDot tone={tone} /> {x.label}
            </div>
            <div className="r-bars__track">
              <div className={`r-bars__fill r-bars__fill--${tone}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="r-bars__val">{x.value}</div>
          </div>
        );
      })}
    </div>
  );
}

/* =====================
   Page
===================== */

export default function ReportsPage() {
  const router = useRouter();

  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: todayStr, end: todayStr });

  const [tab, setTab] = useState<TabKey>('employee_activity');

  // common data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [myAllowedProjects, setMyAllowedProjects] = useState<Project[]>([]);
  const myAllowedProjectIds = useMemo(() => myAllowedProjects.map((p) => p.id), [myAllowedProjects]);

  // filters
  const [selectedEmployeeIdActivity, setSelectedEmployeeIdActivity] = useState<string>(''); // required for activity
  const [selectedEmployeeIdClients, setSelectedEmployeeIdClients] = useState<string>('all'); // all or employee
  const [projectId, setProjectId] = useState<string>('all');

  // UI
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  // activity states
  const [activities, setActivities] = useState<EmployeeActivity[]>([]);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [detailedActivity, setDetailedActivity] = useState<DetailedActivity | null>(null);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<EmployeeActivityType | 'all'>('all');
  const [showDetails, setShowDetails] = useState(false);

  // ✅ breakdowns for followup statuses
  const [followupStatusBreakdown, setFollowupStatusBreakdown] = useState<{ label: string; value: number }[]>([]);
  const [reservationFollowupStatusBreakdown, setReservationFollowupStatusBreakdown] = useState<{ label: string; value: number }[]>([]);

  // clients states
  const [clientMetrics, setClientMetrics] = useState<ClientMetrics | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [workedSets, setWorkedSets] = useState<WorkedSets | null>(null);
  const [showClients, setShowClients] = useState(true);
  const [clientSearch, setClientSearch] = useState('');

  // modal for activity rows
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalBody, setModalBody] = useState<React.ReactNode>(null);

  const [filtersOpen, setFiltersOpen] = useState(true);

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      setDebugInfo('🔄 جاري تهيئة صفحة التقارير...');

      const emp = await getCurrentEmployee();
      if (!emp) {
        router.push('/login');
        return;
      }

      if (emp.role !== 'admin' && emp.role !== 'sales_manager') {
        alert('غير مصرح لك بالوصول إلى صفحة التقارير');
        router.push('/dashboard');
        return;
      }

      setCurrentEmployee(emp);
      setDebugInfo((p) => p + `\n✅ المستخدم: ${emp.name} (${emp.role})`);

      const allowed = await loadMyAllowedProjects(emp);
      await loadEmployees(emp, allowed.map((x) => x.id));
      await loadProjects(emp, allowed);

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

  async function loadEmployees(emp: Employee, allowedProjectIds: string[]) {
    if (emp.role === 'admin') {
      const { data, error } = await supabase
        .from('employees')
        .select('id,name,role,email,mobile,job_title,status')
        .in('role', ['sales', 'sales_manager', 'admin'])
        .order('name', { ascending: true });

      if (error) throw error;

      const emps = (data || []).map((e: any) => ({
        id: e.id,
        name: e.name || 'غير معروف',
        role: e.role,
        email: e.email || '',
        mobile: e.mobile || '',
        job_title: e.job_title || '',
        status: e.status || '',
      })) as Employee[];

      setEmployees(emps);
      if (emps.length > 0) setSelectedEmployeeIdActivity((prev) => prev || emps[0].id);
      return;
    }

    // sales_manager
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

    const { data, error } = await supabase
      .from('employees')
      .select('id,name,role,email,mobile,job_title,status')
      .in('id', employeeIds)
      .in('role', ['sales', 'sales_manager'])
      .order('name', { ascending: true });

    if (error) throw error;

    const emps = (data || []).map((e: any) => ({
      id: e.id,
      name: e.name || 'غير معروف',
      role: e.role,
      email: e.email || '',
      mobile: e.mobile || '',
      job_title: e.job_title || '',
      status: e.status || '',
    })) as Employee[];

    setEmployees(emps);
    if (emps.length > 0) setSelectedEmployeeIdActivity((prev) => prev || emps[0].id);
  }

  async function loadProjects(emp: Employee, allowedProjects: Project[]) {
    if (emp.role === 'admin') {
      const { data, error } = await supabase.from('projects').select('id,name,code').order('name');
      if (error) throw error;
      setProjects(data || []);
      return;
    }
    setProjects(allowedProjects || []);
  }

  /* =====================
     Generate Router
  ===================== */

  async function generate() {
    if (!dateRange.start || !dateRange.end) {
      alert('الرجاء اختيار الفترة (من / إلى)');
      return;
    }
    if (dateRange.start > dateRange.end) {
      alert('تأكد أن تاريخ "من" أقل أو يساوي تاريخ "إلى"');
      return;
    }
    if (tab === 'employee_activity' && !selectedEmployeeIdActivity) {
      alert('اختر الموظف (تقرير الأنشطة)');
      return;
    }

    setGenerating(true);
    try {
      if (tab === 'employee_activity') {
        await generateEmployeeActivityReport();
      } else {
        await generateClientsReport();
      }
    } catch (err: any) {
      console.error(err);
      alert(`حدث خطأ أثناء توليد التقرير: ${err?.message || err}`);
      setDebugInfo((p) => p + `\n❌ خطأ: ${err?.message || err}`);
    } finally {
      setGenerating(false);
    }
  }

  /* =====================
     Employee Activity Report Fetchers
  ===================== */

  async function fetchFollowUps(employeeId: string, startISO: string, endISOExclusive: string): Promise<FollowUp[]> {
    const rows = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('client_followups')
        .select('id,type,notes,created_at,client_id,visit_location,clients(name,status)')
        .eq('employee_id', employeeId)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive)
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    return rows.map((f: any) => {
      const c = relOne<{ name: string; status: string }>(f.clients);
      return {
        id: f.id,
        type: f.type,
        notes: f.notes,
        created_at: f.created_at,
        client_id: f.client_id,
        visit_location: f.visit_location ?? null,
        client_name: c?.name || 'غير معروف',
        client_status: c?.status || 'غير معروف',
      };
    });
  }

  async function fetchReservations(
    employeeId: string,
    startISO: string,
    endISOExclusive: string,
    startDateStr: string,
    endDateStr: string
  ): Promise<ReservationRow[]> {
    const selectStr = `
      id,
      reservation_date,
      status,
      notes,
      created_at,
      client_id,
      unit_id,
      follow_employee_id,
      follow_up_details,
      last_follow_up_at,
      clients(name),
      units(unit_code, project_id, projects(name))
    `;

    const createdByMe = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('reservations')
        .select(selectStr)
        .eq('employee_id', employeeId)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive)
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    const followedByMe = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('reservations')
        .select(selectStr)
        .eq('follow_employee_id', employeeId)
        .gte('last_follow_up_at', startDateStr)
        .lte('last_follow_up_at', endDateStr)
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    const map = new Map<string, any>();
    for (const r of createdByMe) map.set(r.id, r);
    for (const r of followedByMe) map.set(r.id, r);

    return Array.from(map.values()).map((r: any) => {
      const client = relOne<{ name: string }>(r.clients);
      const unit = relOne<any>(r.units);
      const project = relOne<{ name: string }>(unit?.projects);

      return {
        id: r.id,
        reservation_date: r.reservation_date,
        status: r.status,
        notes: r.notes ?? null,
        created_at: r.created_at,

        client_id: r.client_id,
        client_name: client?.name || 'غير معروف',

        unit_id: r.unit_id,
        unit_code: unit?.unit_code || 'غير معروف',

        project_name: project?.name || 'غير معروف',

        follow_employee_id: r.follow_employee_id ?? null,
        follow_up_details: r.follow_up_details ?? null,
        last_follow_up_at: r.last_follow_up_at ?? null,
      };
    });
  }

  async function fetchSales(employeeId: string, startISO: string, endISOExclusive: string): Promise<SaleRow[]> {
    const rows = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('sales')
        .select(
          `
          id,
          sale_date,
          price_before_tax,
          contract_type,
          finance_type,
          finance_entity,
          created_at,
          client_id,
          unit_id,
          project_id,
          clients(name),
          units(unit_code),
          projects(name)
        `
        )
        .eq('sales_employee_id', employeeId)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive)
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    return rows.map((s: any) => {
      const client = relOne<{ name: string }>(s.clients);
      const unit = relOne<{ unit_code: string }>(s.units);
      const project = relOne<{ name: string }>(s.projects);

      return {
        id: s.id,
        sale_date: s.sale_date,
        price_before_tax: Number(s.price_before_tax || 0),
        contract_type: s.contract_type ?? null,
        finance_type: s.finance_type ?? null,
        finance_entity: s.finance_entity ?? null,
        created_at: s.created_at,

        client_id: s.client_id,
        client_name: client?.name || 'غير معروف',

        unit_id: s.unit_id,
        unit_code: unit?.unit_code || 'غير معروف',

        project_name: project?.name || 'غير معروف',
      };
    });
  }

  async function fetchVisits(employeeId: string, startISO: string, endISOExclusive: string): Promise<VisitRow[]> {
    const rows = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('visits')
        .select('id,created_at,visit_date,visit_location,details,client_id,salary,commitments,bank,job_sector,clients(name)')
        .eq('employee_id', employeeId)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive)
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    return rows.map((v: any) => {
      const client = relOne<{ name: string }>(v.clients);
      return {
        id: v.id,
        created_at: v.created_at,
        visit_date: v.visit_date,
        visit_location: v.visit_location ?? null,
        details: v.details ?? null,
        client_id: v.client_id,
        client_name: client?.name || 'غير معروف',
        salary: v.salary ?? null,
        commitments: v.commitments ?? null,
        bank: v.bank ?? null,
        job_sector: v.job_sector ?? null,
      };
    });
  }

  async function fetchReservationNotes(employeeId: string, startISO: string, endISOExclusive: string): Promise<ReservationNoteRow[]> {
    const rows = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('reservation_notes')
        .select(
          `
          id,
          reservation_id,
          note_text,
          created_at,
          created_by,
          reservations:reservation_id (
            id,
            status,
            reservation_date,
            client_id,
            unit_id,
            clients(name),
            units(unit_code, project_id, projects(name))
          )
        `
        )
        .eq('created_by', employeeId)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive)
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    return rows.map((n: any) => {
      const res = relOne<any>(n.reservations);
      const client = relOne<{ name: string }>(res?.clients);
      const unit = relOne<any>(res?.units);
      const project = relOne<{ name: string }>(unit?.projects);

      return {
        id: n.id,
        reservation_id: n.reservation_id,
        note_text: n.note_text,
        created_at: n.created_at,

        client_id: res?.client_id,
        client_name: client?.name || 'غير معروف',

        unit_id: res?.unit_id,
        unit_code: unit?.unit_code || 'غير معروف',

        project_name: project?.name || 'غير معروف',

        reservation_status: res?.status || '',
        reservation_date: res?.reservation_date || '',
      };
    });
  }

  function generateActivitySummary(list: EmployeeActivity[]) {
    const followUps = list.filter((a) => a.type === 'client_followup').length;
    const reservations = list.filter((a) => a.type === 'reservation').length;
    const reservationNotes = list.filter((a) => a.type === 'reservation_note').length;
    const reservationFollowUps = list.filter((a) => a.type === 'reservation_followup').length;

    const sales = list.filter((a) => a.type === 'sale').length;
    const visits = list.filter((a) => a.type === 'visit').length;

    const uniqueClientsTouched = new Set(list.map((a) => a.client_id).filter(Boolean) as string[]).size;

    const totalDuration = list.reduce((sum, a) => sum + (a.duration || 0), 0);
    const avgActivityDuration = list.length > 0 ? Math.round(totalDuration / list.length) : 0;

    const hourCounts: Record<string, number> = {};
    for (const a of list) {
      const h = new Date(a.timestamp).getHours();
      const key = `${h.toString().padStart(2, '0')}:00 - ${(h + 1).toString().padStart(2, '0')}:00`;
      hourCounts[key] = (hourCounts[key] || 0) + 1;
    }
    const peakHour = Object.entries(hourCounts).sort((x, y) => y[1] - x[1])[0]?.[0] || 'لا توجد بيانات';

    const activityCounts: Record<string, number> = {};
    for (const a of list) activityCounts[a.action] = (activityCounts[a.action] || 0) + 1;
    const busiestActivity = Object.entries(activityCounts).sort((x, y) => y[1] - x[1])[0]?.[0] || 'لا توجد بيانات';

    let efficiencyScore = 0;
    if (list.length > 0) {
      const score =
        sales * 40 +
        reservations * 20 +
        reservationNotes * 8 +
        reservationFollowUps * 10 +
        followUps * 10 +
        visits * 12;

      const maxScore = list.length * 40;
      efficiencyScore = maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;
    }

    const conversionRate = followUps > 0 ? Math.round((sales / followUps) * 100) : 0;

    setActivitySummary({
      totalActivities: list.length,
      followUps,
      reservations,
      reservationNotes,
      reservationFollowUps,
      sales,
      visits,
      uniqueClientsTouched,
      totalDuration,
      avgActivityDuration,
      peakHour,
      busiestActivity,
      efficiencyScore,
      conversionRate,
    });
  }

  function generateTimeSlots(list: EmployeeActivity[]) {
    const slots: TimeSlot[] = [];
    for (let i = 0; i < 24; i++) {
      const hourStr = `${i.toString().padStart(2, '0')}:00 - ${(i + 1).toString().padStart(2, '0')}:00`;
      const slotActivities = list.filter((a) => new Date(a.timestamp).getHours() === i);
      if (slotActivities.length > 0) slots.push({ hour: hourStr, activities: slotActivities, count: slotActivities.length });
    }
    setTimeSlots(slots);
  }

  async function generateEmployeeActivityReport() {
    setActivities([]);
    setActivitySummary(null);
    setTimeSlots([]);
    setDetailedActivity(null);

    // reset breakdowns
    setFollowupStatusBreakdown([]);
    setReservationFollowupStatusBreakdown([]);

    const { startISO, endISOExclusive } = buildIsoRange(dateRange.start, dateRange.end);
    const emp = employees.find((e) => e.id === selectedEmployeeIdActivity);

    setDebugInfo(
      `🔄 توليد تقرير الأنشطة...\n👤 الموظف: ${emp?.name || selectedEmployeeIdActivity}\n🗓️ الفترة: ${dateRange.start} → ${dateRange.end}\n- gte: ${startISO}\n- lt: ${endISOExclusive}`
    );

    const [followUps, reservations, sales, visits, reservationNotes] = await Promise.all([
      fetchFollowUps(selectedEmployeeIdActivity, startISO, endISOExclusive),
      fetchReservations(selectedEmployeeIdActivity, startISO, endISOExclusive, dateRange.start, dateRange.end),
      fetchSales(selectedEmployeeIdActivity, startISO, endISOExclusive),
      fetchVisits(selectedEmployeeIdActivity, startISO, endISOExclusive),
      fetchReservationNotes(selectedEmployeeIdActivity, startISO, endISOExclusive),
    ]);

    // ✅ FIX #1: client_followups الحالة عندك غالباً في notes (مش type)
    const followupLabels: FollowupStatusLabel[] = followUps.map((f) => extractFollowupStatus(f.notes || f.type || ''));
    setFollowupStatusBreakdown(countByLabel(followupLabels));

    // ✅ FIX #2: reservation followups حاول follow_up_details ولو فاضي خُد notes
    const reservationFollowupLabels: FollowupStatusLabel[] = reservations
      .filter((r) => r.follow_employee_id === selectedEmployeeIdActivity && r.last_follow_up_at)
      .map((r) => extractFollowupStatus(r.follow_up_details || r.notes || ''));
    setReservationFollowupStatusBreakdown(countByLabel(reservationFollowupLabels));

    const all: EmployeeActivity[] = [];

    for (const f of followUps) {
      all.push({
        id: f.id,
        type: 'client_followup',
        action: 'متابعة عميل',
        details: `${f.type || 'متابعة'}${f.visit_location ? ` - ${f.visit_location}` : ''}${f.notes ? ` - ${f.notes}` : ''}`,
        client_id: f.client_id,
        client_name: f.client_name,
        timestamp: f.created_at,
        reference_id: f.client_id,
        duration: 10,
        status: f.client_status,
        notes: f.notes,
      });
    }

    for (const r of reservations) {
      all.push({
        id: r.id,
        type: 'reservation',
        action: 'حجز وحدة',
        details: `حجز الوحدة ${r.unit_code} للعميل ${r.client_name}`,
        client_id: r.client_id,
        client_name: r.client_name,
        unit_id: r.unit_id,
        unit_code: r.unit_code,
        project_name: r.project_name,
        timestamp: r.created_at,
        reference_id: r.id,
        duration: 25,
        status: r.status,
        notes: r.notes || '',
      });

      if (r.follow_employee_id === selectedEmployeeIdActivity && r.last_follow_up_at) {
        const followupTs = new Date(`${r.last_follow_up_at}T12:00:00.000`).toISOString();
        all.push({
          id: `${r.id}-followup-${r.last_follow_up_at}`,
          type: 'reservation_followup',
          action: 'متابعة حجز',
          details: r.follow_up_details ? `متابعة على الحجز (${r.unit_code}) - ${r.follow_up_details}` : `متابعة على الحجز (${r.unit_code})`,
          client_id: r.client_id,
          client_name: r.client_name,
          unit_id: r.unit_id,
          unit_code: r.unit_code,
          project_name: r.project_name,
          timestamp: followupTs,
          reference_id: r.id,
          duration: 10,
          status: r.status,
          notes: r.follow_up_details || r.notes || '',
        });
      }
    }

    for (const s of sales) {
      all.push({
        id: s.id,
        type: 'sale',
        action: 'بيع وحدة',
        details: `بيع الوحدة ${s.unit_code} للعميل ${s.client_name}`,
        client_id: s.client_id,
        client_name: s.client_name,
        unit_id: s.unit_id,
        unit_code: s.unit_code,
        project_name: s.project_name,
        amount: s.price_before_tax,
        timestamp: s.created_at,
        reference_id: s.id,
        duration: 45,
        status: 'مكتمل',
        notes: `عقد: ${s.contract_type || 'غير محدد'} | تمويل: ${s.finance_type || 'غير محدد'}${s.finance_entity ? ` | جهة: ${s.finance_entity}` : ''}`,
      });
    }

    for (const v of visits) {
      const extra = [
        v.visit_location ? `المكان: ${v.visit_location}` : '',
        v.salary != null ? `الراتب: ${v.salary}` : '',
        v.commitments != null ? `الالتزامات: ${v.commitments}` : '',
        v.bank ? `البنك: ${v.bank}` : '',
        v.job_sector ? `القطاع: ${v.job_sector}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      all.push({
        id: v.id,
        type: 'visit',
        action: 'زيارة',
        details: `زيارة للعميل ${v.client_name}${extra ? ` — ${extra}` : ''}${v.details ? ` — ${v.details}` : ''}`,
        client_id: v.client_id,
        client_name: v.client_name,
        timestamp: v.created_at,
        reference_id: v.client_id,
        duration: 35,
        status: 'تمت',
        notes: v.details || '',
      });
    }

    for (const n of reservationNotes) {
      all.push({
        id: n.id,
        type: 'reservation_note',
        action: 'ملاحظة على الحجز',
        details: `ملاحظة: ${n.note_text}`,
        client_id: n.client_id,
        client_name: n.client_name,
        unit_id: n.unit_id,
        unit_code: n.unit_code,
        project_name: n.project_name,
        timestamp: n.created_at,
        reference_id: n.reservation_id,
        duration: 5,
        status: n.reservation_status || '',
        notes: n.note_text,
      });
    }

    all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setActivities(all);
    setDetailedActivity({ followUps, reservations, sales, visits, reservationNotes });
    generateActivitySummary(all);
    generateTimeSlots(all);

    setDebugInfo((p) => p + `\n✅ تم توليد ${all.length} نشاط`);
  }

  /* =====================
     Clients Report (FIXED)
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

  async function fetchAssignedClientIds(clientIds: string[]) {
    const out = new Set<string>();
    const chunks = chunkArray(clientIds, 500);

    for (const ch of chunks) {
      const { data, error } = await supabase.from('client_assignments').select('client_id').in('client_id', ch);
      if (error) throw error;
      (data || []).forEach((r: any) => out.add(r.client_id));
    }
    return out;
  }

  async function fetchClientIdsAssignedToEmployee(clientIds: string[], employeeId: string) {
    const out = new Set<string>();
    const chunks = chunkArray(clientIds, 500);

    for (const ch of chunks) {
      const { data, error } = await supabase
        .from('client_assignments')
        .select('client_id')
        .eq('employee_id', employeeId)
        .in('client_id', ch);

      if (error) throw error;
      (data || []).forEach((r: any) => out.add(r.client_id));
    }
    return out;
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

  async function distinctClientsFromReservationNotesInRange(clientIds: string[], startISO: string, endISOExclusive: string) {
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

    const out = new Set<string>();
    const resChunks = chunkArray(reservationIds, 500);

    for (const rch of resChunks) {
      const { data, error } = await supabase
        .from('reservation_notes')
        .select('reservation_id, created_at')
        .in('reservation_id', rch)
        .gte('created_at', startISO)
        .lt('created_at', endISOExclusive);

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

    setDebugInfo((p) => p + '\n🔄 فحص ملاحظات الحجوزات...');
    const reservationNotes = await distinctClientsFromReservationNotesInRange(clientIds, startISO, endISOExclusive);

    const union = new Set<string>();
    [followups, sales, visits, reservations, reservationNotes].forEach((s) => s.forEach((id) => union.add(id)));

    return { followups, reservations, reservationNotes, sales, visits, union };
  }

  async function generateClientsReport() {
    setClientMetrics(null);
    setClients([]);
    setWorkedSets(null);

    const { startISO, endISOExclusive } = buildIsoRange(dateRange.start, dateRange.end);

    setDebugInfo(
      `🔄 توليد تقرير العملاء...\n🗓️ الفترة: ${dateRange.start} → ${dateRange.end}\n- gte: ${startISO}\n- lt: ${endISOExclusive}\n👤 الموظف: ${
        selectedEmployeeIdClients === 'all'
          ? 'الكل'
          : employees.find((e) => e.id === selectedEmployeeIdClients)?.name || selectedEmployeeIdClients
      }\n🏗️ المشروع: ${projectId === 'all' ? 'الكل' : projectId}`
    );

    setDebugInfo((p) => p + '\n🔄 جلب العملاء داخل الفترة...');
    const allClients = await fetchClientsInRange(startISO, endISOExclusive);

    if (allClients.length === 0) {
      setClientMetrics({
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
      setDebugInfo((p) => p + '\n✅ لا يوجد عملاء في الفترة المحددة');
      return;
    }

    const allClientIds = allClients.map((c) => c.id);

    let filteredClients = allClients;
    if (selectedEmployeeIdClients !== 'all') {
      setDebugInfo((p) => p + '\n🔄 فلترة العملاء حسب تعيين الموظف...');
      const assignedToEmp = await fetchClientIdsAssignedToEmployee(allClientIds, selectedEmployeeIdClients);
      filteredClients = allClients.filter((c) => assignedToEmp.has(c.id));
    }

    const clientIds = filteredClients.map((c) => c.id);

    setDebugInfo((p) => p + '\n🔄 حساب (موزعين/غير موزعين)...');
    let assignedClients = 0;
    let unassignedClients = 0;

    if (selectedEmployeeIdClients === 'all') {
      const assignedSet = await fetchAssignedClientIds(clientIds);
      assignedClients = assignedSet.size;
      unassignedClients = filteredClients.length - assignedClients;
    } else {
      assignedClients = filteredClients.length;
      unassignedClients = 0;
    }

    const distributionRate = filteredClients.length ? Math.round((assignedClients / filteredClients.length) * 1000) / 10 : 0;

    setDebugInfo((p) => p + '\n🔄 حساب (تم العمل عليهم) من الجداول...');
    const worked = await fetchWorkedSets(clientIds, startISO, endISOExclusive);
    setWorkedSets(worked);

    setDebugInfo((p) => p + '\n🔄 حساب (تم تعديل بياناتهم)...');
    const editedClients = filteredClients.filter((c) => {
      if (!c.updated_at) return false;
      const u = new Date(c.updated_at).getTime();
      const cr = new Date(c.created_at).getTime();
      const inRange = u >= new Date(startISO).getTime() && u < new Date(endISOExclusive).getTime();
      return inRange && u > cr;
    }).length;

    const statusCounts: Record<string, number> = {};
    for (const c of filteredClients) statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;

    setClientMetrics({
      totalClients: filteredClients.length,
      assignedClients,
      unassignedClients,
      distributionRate,
      workedClients: worked.union.size,
      workedByFollowups: worked.followups.size,
      workedByReservations: worked.reservations.size,
      workedBySales: worked.sales.size,
      workedByReservationNotes: worked.reservationNotes.size,
      workedByVisits: worked.visits.size,
      editedClients,
      statusCounts,
    });

    setClients(filteredClients);
    setDebugInfo((p) => p + `\n✅ Clients: ${filteredClients.length} | Worked: ${worked.union.size} | Edited: ${editedClients}`);
  }

  /* =====================
     Export
  ===================== */

  async function exportJSON() {
    setExporting(true);
    try {
      const payload: any = {
        meta: {
          tab,
          dateRange,
          generatedAt: new Date().toISOString(),
          generatedBy: currentEmployee?.name,
        },
      };

      if (tab === 'employee_activity') {
        if (!activities.length || !activitySummary) {
          alert('لا توجد بيانات للتصدير');
          return;
        }
        payload.activity = {
          employee: employees.find((e) => e.id === selectedEmployeeIdActivity)?.name || selectedEmployeeIdActivity,
          summary: activitySummary,
          activities,
          timeSlots,
          followupStatusBreakdown,
          reservationFollowupStatusBreakdown,
        };
      } else {
        if (!clientMetrics) {
          alert('لا توجد بيانات للتصدير');
          return;
        }
        payload.clients = {
          employee:
            selectedEmployeeIdClients === 'all'
              ? 'الكل'
              : employees.find((e) => e.id === selectedEmployeeIdClients)?.name || selectedEmployeeIdClients,
          project: projectId,
          metrics: clientMetrics,
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
      }

      const dataStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download =
        tab === 'employee_activity'
          ? `تقرير_الانشطة_${dateRange.start}_الى_${dateRange.end}.json`
          : `تقرير_العملاء_${dateRange.start}_الى_${dateRange.end}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('تم تصدير التقرير بنجاح');
    } finally {
      setExporting(false);
    }
  }

  function exportCSV() {
    if (tab === 'employee_activity') {
      if (!activities.length) {
        alert('لا توجد بيانات للتصدير');
        return;
      }

      const headers = ['النوع', 'النشاط', 'التفاصيل', 'العميل', 'كود الوحدة', 'المشروع', 'المبلغ', 'التاريخ', 'المدة (دقيقة)', 'الحالة', 'ملاحظات'];

      const rows = activities.map((a) => [
        a.type,
        safeText(a.action),
        `"${safeText(a.details).replace(/"/g, '""')}"`,
        safeText(a.client_name),
        safeText(a.unit_code),
        safeText(a.project_name),
        a.amount ?? '',
        new Date(a.timestamp).toLocaleString('ar-SA'),
        a.duration ?? '',
        safeText(a.status),
        `"${safeText(a.notes).replace(/"/g, '""')}"`,
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_الانشطة_${dateRange.start}_الى_${dateRange.end}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    if (!clients.length || !clientMetrics) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    const headers = ['اسم العميل', 'الجوال', 'الحالة', 'مستحق', 'تاريخ الإضافة', 'تم العمل عليه داخل الفترة؟', 'تم تعديل بياناته داخل الفترة؟'];
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
     Filtering UI
  ===================== */

  const filteredActivities = useMemo(() => {
    let list = activities;

    if (activityTypeFilter !== 'all') list = list.filter((a) => a.type === activityTypeFilter);

    if (activitySearch.trim()) {
      const t = activitySearch.toLowerCase();
      list = list.filter((a) => {
        return (
          a.action.toLowerCase().includes(t) ||
          a.details.toLowerCase().includes(t) ||
          (a.client_name || '').toLowerCase().includes(t) ||
          (a.unit_code || '').toLowerCase().includes(t) ||
          (a.project_name || '').toLowerCase().includes(t) ||
          (a.notes || '').toLowerCase().includes(t)
        );
      });
    }

    return list;
  }, [activities, activitySearch, activityTypeFilter]);

  const filteredClients = useMemo(() => {
    let list = clients;
    const t = clientSearch.trim().toLowerCase();
    if (t) {
      list = list.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(t) ||
          (c.mobile || '').toLowerCase().includes(t) ||
          (c.status || '').toLowerCase().includes(t)
      );
    }
    return list;
  }, [clients, clientSearch]);

  /* =====================
     Derived (Nice UI insights)
  ===================== */

  const activityBreakdown = useMemo(() => {
    if (!activitySummary) return [];
    const items = [
      { label: 'متابعات', value: activitySummary.followUps, tone: 'info' as const },
      { label: 'حجوزات', value: activitySummary.reservations, tone: 'success' as const },
      { label: 'متابعات حجوزات', value: activitySummary.reservationFollowUps, tone: 'warning' as const },
      { label: 'ملاحظات', value: activitySummary.reservationNotes, tone: 'neutral' as const },
      { label: 'مبيعات', value: activitySummary.sales, tone: 'success' as const },
      { label: 'زيارات', value: activitySummary.visits, tone: 'info' as const },
    ].filter((x) => x.value > 0);

    return items.sort((a, b) => b.value - a.value);
  }, [activitySummary]);

  const clientsStatusTop = useMemo(() => {
    if (!clientMetrics) return [];
    const entries = Object.entries(clientMetrics.statusCounts || {})
      .map(([k, v]) => ({ label: translateStatus(k), value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    return entries;
  }, [clientMetrics]);

  /* =====================
     Render
  ===================== */

  if (loading) {
    return (
      <RequireAuth>
        <div className="r-center">
          <div className="r-skeleton">
            <div className="r-skeleton__title" />
            <div className="r-skeleton__line" />
            <div className="r-skeleton__grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="r-skeleton__card" />
              ))}
            </div>
            {debugInfo ? <pre className="r-debug">{debugInfo}</pre> : null}
          </div>
        </div>

        <style jsx global>{globalCss}</style>
      </RequireAuth>
    );
  }

  const headerTitle = tab === 'employee_activity' ? 'تقارير الأداء — أنشطة الموظف' : 'تقارير الأداء — العملاء';
  const headerSubtitle =
    tab === 'employee_activity'
      ? 'تحليل شامل لحركة الموظف داخل الفترة: متابعات، حجوزات، ملاحظات، زيارات، ومبيعات.'
      : 'تحليل العملاء داخل فترة الإنشاء: توزيع، نشاط داخل الفترة، وتعديل بيانات.';

  const canSeeProjects = tab === 'clients';
  const canChooseEmployeeModeAll = tab === 'clients';

  const selectedEmpNameActivity = employees.find((e) => e.id === selectedEmployeeIdActivity)?.name || '—';
  const selectedEmpNameClients =
    selectedEmployeeIdClients === 'all'
      ? 'الكل'
      : employees.find((e) => e.id === selectedEmployeeIdClients)?.name || selectedEmployeeIdClients;

  const heroRightBadge =
    tab === 'employee_activity'
      ? `👤 ${selectedEmpNameActivity}`
      : `👤 ${selectedEmpNameClients}${projectId === 'all' ? ' • 🏗️ كل المشاريع' : ' • 🏗️ مشروع محدد'}`;

  const heroTone =
    tab === 'employee_activity'
      ? activitySummary
        ? activitySummary.efficiencyScore >= 80
          ? 'success'
          : activitySummary.efficiencyScore >= 60
          ? 'warning'
          : 'danger'
        : 'neutral'
      : clientMetrics
      ? clientMetrics.distributionRate >= 80
        ? 'success'
        : clientMetrics.distributionRate >= 50
        ? 'warning'
        : 'danger'
      : 'neutral';

  return (
    <RequireAuth>
      <div className="r-page">
        {/* Premium global CSS */}
        <style jsx global>{globalCss}</style>

        {/* HERO HEADER */}
        <div className="r-hero">
          <div className="r-hero__inner">
            <div className="r-crumbs">
              <span className="r-crumb">Dashboard</span>
              <span className="r-crumb-sep">/</span>
              <span className="r-crumb r-crumb--active">Reports</span>
            </div>

            <div className="r-hero__row">
              <div className="r-hero__left">
                <h1 className="r-hero__title">{headerTitle}</h1>
                <p className="r-hero__sub">{headerSubtitle}</p>

                <div className="r-hero__badges">
                  <Badge tone="info">🔐 {currentEmployee?.role}</Badge>
                  <Badge tone="neutral">
                    📅 {dateRange.start} → {dateRange.end}
                  </Badge>
                  <Badge tone={heroTone as any}>{heroRightBadge}</Badge>
                </div>
              </div>

              <div className="r-hero__right">
                <div className="r-actions">
                  <Button
                    onClick={exportJSON}
                    disabled={exporting || (tab === 'employee_activity' ? !activitySummary : !clientMetrics)}
                    variant="secondary"
                  >
                    {exporting ? 'جاري التصدير...' : '⬇️ JSON'}
                  </Button>

                  <Button onClick={exportCSV} disabled={tab === 'employee_activity' ? !activities.length : !clientMetrics} variant="secondary">
                    ⬇️ CSV
                  </Button>

                  <Button onClick={printReport} disabled={tab === 'employee_activity' ? !activities.length : !clientMetrics}>
                    🖨️ طباعة
                  </Button>
                </div>

                <div className="r-tabsWrap">
                  <SegTabs value={tab} onChange={setTab} />
                </div>
              </div>
            </div>
          </div>

          <div className="r-hero__glow" aria-hidden />
        </div>

        {/* STICKY FILTER BAR */}
        <div className="r-sticky">
          <div className="r-sticky__inner">
            <div className="r-sticky__left">
              <button className="r-linkBtn" onClick={() => setFiltersOpen((p) => !p)}>
                {filtersOpen ? 'إخفاء الفلاتر ▲' : 'عرض الفلاتر ▼'}
              </button>

              {tab === 'employee_activity' && activitySummary ? (
                <div className="r-mini">
                  <IconDot tone={heroTone as any} /> الكفاءة: <b>{activitySummary.efficiencyScore}%</b> • التحويل: <b>{activitySummary.conversionRate}%</b>
                </div>
              ) : null}

              {tab === 'clients' && clientMetrics ? (
                <div className="r-mini">
                  <IconDot tone={heroTone as any} /> نسبة التوزيع: <b>{clientMetrics.distributionRate}%</b> • تم العمل عليهم: <b>{clientMetrics.workedClients}</b>
                </div>
              ) : null}
            </div>

            <div className="r-sticky__right">
              <button
                className="r-quick"
                onClick={() => {
                  const d = new Date();
                  const s = d.toISOString().split('T')[0];
                  setDateRange({ start: s, end: s });
                }}
              >
                اليوم
              </button>

              <button
                className="r-quick"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  const s = d.toISOString().split('T')[0];
                  setDateRange({ start: s, end: s });
                }}
              >
                أمس
              </button>

              <button
                className="r-quick"
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
                className="r-quick"
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
          </div>
        </div>

        {/* FILTERS PANEL */}
        {filtersOpen && (
          <div className="r-content">
            <div className="r-grid2">
              <div className="r-cardLite">
                <div className="r-cardLite__head">
                  <div>
                    <div className="r-cardLite__title">الفلاتر</div>
                    <div className="r-cardLite__hint">اختار الموظف والفترة، ثم ولّد التقرير</div>
                  </div>
                  <div className="r-cardLite__right">
                    <Button
                      onClick={generate}
                      disabled={generating || !dateRange.start || !dateRange.end || (tab === 'employee_activity' && !selectedEmployeeIdActivity)}
                    >
                      {generating ? 'جاري التوليد...' : '⚡ توليد'}
                    </Button>
                  </div>
                </div>

                <div className="r-formGrid">
                  {/* Employee */}
                  <div className="r-field">
                    <label className="r-label">{tab === 'employee_activity' ? 'الموظف (إلزامي)' : 'الموظف'}</label>
                    <select
                      className="r-select"
                      value={tab === 'employee_activity' ? selectedEmployeeIdActivity : selectedEmployeeIdClients}
                      onChange={(e) =>
                        tab === 'employee_activity'
                          ? setSelectedEmployeeIdActivity(e.target.value)
                          : setSelectedEmployeeIdClients(e.target.value)
                      }
                    >
                      {canChooseEmployeeModeAll && <option value="all">الكل</option>}
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}{' '}
                          {emp.role === 'sales_manager'
                            ? '(مشرف)'
                            : emp.role === 'sales'
                            ? '(مبيعات)'
                            : emp.role === 'admin'
                            ? '(Admin)'
                            : ''}
                        </option>
                      ))}
                    </select>
                    <div className="r-help">{employees.length} موظف</div>
                  </div>

                  {/* Project (clients only) */}
                  {canSeeProjects && (
                    <div className="r-field">
                      <label className="r-label">المشروع</label>
                      <select className="r-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                        <option value="all">الكل</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code ? `${p.name} (${p.code})` : p.name}
                          </option>
                        ))}
                      </select>
                      {currentEmployee?.role === 'sales_manager' ? (
                        <div className="r-help">
                          نطاقك: {myAllowedProjects.length ? `${myAllowedProjects.length} مشروع` : 'لا يوجد مشاريع مفعّلة لك'}
                        </div>
                      ) : (
                        <div className="r-help">فلترة اختيارية</div>
                      )}
                    </div>
                  )}

                  {/* Dates */}
                  <div className="r-field">
                    <label className="r-label">من تاريخ *</label>
                    <input
                      className="r-input"
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                    />
                  </div>

                  <div className="r-field">
                    <label className="r-label">إلى تاريخ *</label>
                    <input
                      className="r-input"
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                    />
                  </div>

                  {/* Sub filters */}
                  {tab === 'employee_activity' ? (
                    <>
                      <div className="r-field">
                        <label className="r-label">نوع النشاط</label>
                        <select className="r-select" value={activityTypeFilter} onChange={(e) => setActivityTypeFilter(e.target.value as any)}>
                          <option value="all">الكل</option>
                          <option value="client_followup">متابعات</option>
                          <option value="reservation">حجوزات</option>
                          <option value="reservation_followup">متابعات الحجوزات</option>
                          <option value="reservation_note">ملاحظات الحجوزات</option>
                          <option value="sale">مبيعات</option>
                          <option value="visit">زيارات</option>
                        </select>
                      </div>

                      <div className="r-field r-field--span2">
                        <label className="r-label">بحث</label>
                        <Input
                          placeholder="ابحث في النشاط/العميل/الوحدة/المشروع..."
                          value={activitySearch}
                          onChange={(e: any) => setActivitySearch(e.target.value)}
                        />
                      </div>

                      <div className="r-field r-field--span2 r-field--row">
                        <Button onClick={() => setShowDetails((p) => !p)} variant={showDetails ? 'primary' : 'secondary'} disabled={!detailedActivity}>
                          {showDetails ? 'إخفاء Raw' : 'عرض Raw'}
                        </Button>
                        <div className="r-help">تفاصيل خام للتدقيق عند الحاجة</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="r-field r-field--span2">
                        <label className="r-label">بحث في العملاء</label>
                        <Input placeholder="بحث بالاسم/الجوال/الحالة..." value={clientSearch} onChange={(e: any) => setClientSearch(e.target.value)} />
                      </div>

                      <div className="r-field r-field--span2 r-field--row">
                        <Button onClick={() => setShowClients((p) => !p)} variant={showClients ? 'secondary' : 'primary'} disabled={!clientMetrics}>
                          {showClients ? 'إخفاء القائمة' : 'عرض القائمة'}
                        </Button>
                        <div className="r-help">تقدر تخفي الجدول لو الداتا كبيرة</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="r-cardLite">
                <div className="r-cardLite__head">
                  <div>
                    <div className="r-cardLite__title">معلومات التشغيل</div>
                    <div className="r-cardLite__hint">يوضح آخر خطوة أثناء التحميل</div>
                  </div>
                </div>

                <div className="r-log">{debugInfo ? <pre className="r-debug">{debugInfo}</pre> : <div className="r-emptyTiny">لا يوجد سجل بعد.</div>}</div>
              </div>
            </div>
          </div>
        )}

        {/* RESULTS */}
        <div className="r-content">
          {tab === 'employee_activity' && activitySummary ? (
            <>
              <div className="r-kpis">
                <Kpi title="إجمالي الأنشطة" value={activitySummary.totalActivities} sub="Total events" tone="info" icon="📊" />
                <Kpi title="الكفاءة" value={`${activitySummary.efficiencyScore}%`} sub={`Peak: ${activitySummary.peakHour}`} tone={heroTone as any} icon="⚡" />
                <Kpi title="معدل التحويل" value={`${activitySummary.conversionRate}%`} sub="Sales / Followups" tone="success" icon="📈" />
                <Kpi
                  title="الوقت"
                  value={`${activitySummary.totalDuration} د`}
                  sub={`${Math.round(activitySummary.totalDuration / 60)} ساعة • متوسط ${activitySummary.avgActivityDuration} د`}
                  tone="neutral"
                  icon="⏱️"
                />
              </div>

              <div className="r-grid2">
                <Panel title="تفصيل الأنشطة" hint="أكثر الأنشطة تنفيذًا داخل الفترة" right={<Badge tone="neutral">Top mix</Badge>}>
                  <MiniBars items={activityBreakdown as any} />
                </Panel>

                <Panel title="Insights" hint="ملخص سريع للمخرجات" right={<Badge tone={heroTone as any}>{selectedEmpNameActivity}</Badge>}>
                  <div className="r-ins">
                    <div className="r-ins__item">
                      <div className="r-ins__k">🔥 الأكثر تنفيذًا</div>
                      <div className="r-ins__v">{activitySummary.busiestActivity}</div>
                    </div>
                    <div className="r-ins__item">
                      <div className="r-ins__k">👥 عملاء تم لمسهم</div>
                      <div className="r-ins__v">{activitySummary.uniqueClientsTouched}</div>
                    </div>
                    <div className="r-ins__item">
                      <div className="r-ins__k">⏱️ متوسط النشاط</div>
                      <div className="r-ins__v">{activitySummary.avgActivityDuration} د</div>
                    </div>
                    <div className="r-ins__item">
                      <div className="r-ins__k">💰 إجمالي قيمة مبيعات</div>
                      <div className="r-ins__v">
                        {formatMoneyEGP(activities.filter((x) => x.type === 'sale').reduce((s, x) => s + Number(x.amount || 0), 0))}
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>

              {/* Followup Status Distributions */}
              <div className="r-grid2">
                <Panel title="حالات المتابعة (العملاء)" hint="توزيع متابعات العملاء حسب الحالة داخل الفترة" right={<Badge tone="info">Followups</Badge>}>
                  {followupStatusBreakdown.length ? (
                    <MiniBars
                      items={followupStatusBreakdown.slice(0, 12).map((x, i) => ({
                        label: x.label,
                        value: x.value,
                        tone: x.label === 'غير محدد' ? ('neutral' as const) : i < 3 ? ('success' as const) : i < 7 ? ('info' as const) : ('neutral' as const),
                      }))}
                      maxLabel={220}
                    />
                  ) : (
                    <div className="r-emptyTiny">لا توجد متابعات عملاء داخل الفترة.</div>
                  )}
                </Panel>

                <Panel
                  title="حالات متابعات الحجوزات"
                  hint="توزيع متابعات الحجوزات حسب الحالة داخل الفترة"
                  right={<Badge tone="warning">Reservation Followups</Badge>}
                >
                  {reservationFollowupStatusBreakdown.length ? (
                    <MiniBars
                      items={reservationFollowupStatusBreakdown.slice(0, 12).map((x, i) => ({
                        label: x.label,
                        value: x.value,
                        tone: x.label === 'غير محدد' ? ('neutral' as const) : i < 3 ? ('success' as const) : i < 7 ? ('warning' as const) : ('neutral' as const),
                      }))}
                      maxLabel={220}
                    />
                  ) : (
                    <div className="r-emptyTiny">لا توجد متابعات حجوزات داخل الفترة.</div>
                  )}
                </Panel>
              </div>

              <Panel title="سجل الأنشطة" hint={`${filteredActivities.length} نشاط بعد الفلاتر • اضغط على أي صف لعرض التفاصيل`} right={<Badge tone="info">DataGrid</Badge>}>
                <div className="r-tableWrap">
                  <table className="r-table">
                    <thead>
                      <tr>
                        <th>النوع</th>
                        <th>النشاط</th>
                        <th>التفاصيل</th>
                        <th>العميل</th>
                        <th>الوحدة</th>
                        <th>الوقت</th>
                        <th>المدة</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActivities.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="r-tdEmpty">
                            لا توجد بيانات حسب الفلاتر الحالية
                          </td>
                        </tr>
                      ) : (
                        filteredActivities.map((a) => (
                          <tr
                            key={`${a.type}-${a.id}`}
                            className="r-tr"
                            onClick={() => {
                              setModalTitle(`${a.action} • ${a.client_name || ''}`);
                              setModalBody(
                                <div className="r-modalGrid">
                                  <div className="r-box">
                                    <div className="r-box__k">التفاصيل</div>
                                    <div className="r-box__v">{a.details}</div>
                                  </div>
                                  <div className="r-box">
                                    <div className="r-box__k">الملاحظات</div>
                                    <div className="r-box__v">{a.notes || 'لا توجد'}</div>
                                  </div>
                                  <div className="r-box">
                                    <div className="r-box__k">معلومات</div>
                                    <div className="r-box__v">
                                      <div>
                                        النوع: <b>{a.type}</b>
                                      </div>
                                      <div>
                                        الوقت: <b>{new Date(a.timestamp).toLocaleString('ar-SA')}</b>
                                      </div>
                                      <div>
                                        المدة: <b>{a.duration || 0} د</b>
                                      </div>
                                      {a.amount ? (
                                        <div>
                                          المبلغ: <b>{formatMoneyEGP(a.amount)}</b>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                              setModalOpen(true);
                            }}
                          >
                            <td>
                              <Badge tone="neutral">{a.type}</Badge>
                            </td>
                            <td className="r-strong">{a.action}</td>
                            <td className="r-wrap">{a.details}</td>
                            <td>{a.client_name || '-'}</td>
                            <td>{a.unit_code || '-'}</td>
                            <td>{new Date(a.timestamp).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td>{a.duration || 0} د</td>
                            <td>{a.status || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="تحليل زمني" hint="توزيع الأنشطة حسب الساعة (أعلى نشاط يظهر بطول أعلى)" right={<Badge tone="neutral">Timeline</Badge>}>
                {timeSlots.length ? (
                  <MiniBars
                    items={timeSlots
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 12)
                      .map((x, i) => ({
                        label: x.hour,
                        value: x.count,
                        tone: i < 3 ? ('success' as const) : i < 7 ? ('info' as const) : ('neutral' as const),
                      }))}
                    maxLabel={160}
                  />
                ) : (
                  <div className="r-emptyTiny">لا توجد بيانات كافية</div>
                )}
              </Panel>

              {showDetails && detailedActivity ? (
                <div style={{ marginTop: 14 }}>
                  <Card title="Raw Data (للتدقيق)">
                    <div style={{ padding: 14, display: 'grid', gap: 14 }}>
                      <details>
                        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>FollowUps ({detailedActivity.followUps.length})</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 12, borderRadius: 10, overflowX: 'auto' }}>
                          {JSON.stringify(detailedActivity.followUps, null, 2)}
                        </pre>
                      </details>

                      <details>
                        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Reservations ({detailedActivity.reservations.length})</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 12, borderRadius: 10, overflowX: 'auto' }}>
                          {JSON.stringify(detailedActivity.reservations, null, 2)}
                        </pre>
                      </details>

                      <details>
                        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Reservation Notes ({detailedActivity.reservationNotes.length})</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 12, borderRadius: 10, overflowX: 'auto' }}>
                          {JSON.stringify(detailedActivity.reservationNotes, null, 2)}
                        </pre>
                      </details>

                      <details>
                        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Sales ({detailedActivity.sales.length})</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 12, borderRadius: 10, overflowX: 'auto' }}>
                          {JSON.stringify(detailedActivity.sales, null, 2)}
                        </pre>
                      </details>

                      <details>
                        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Visits ({detailedActivity.visits.length})</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 12, borderRadius: 10, overflowX: 'auto' }}>
                          {JSON.stringify(detailedActivity.visits, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </Card>
                </div>
              ) : null}
            </>
          ) : null}

          {tab === 'clients' && clientMetrics ? (
            <>
              <div className="r-kpis">
                <Kpi title="إجمالي العملاء" value={clientMetrics.totalClients} sub="Clients created in range" tone="info" icon="👥" />
                <Kpi
                  title="نسبة التوزيع"
                  value={`${clientMetrics.distributionRate}%`}
                  sub={`${clientMetrics.assignedClients} موزعين • ${clientMetrics.unassignedClients} غير موزعين`}
                  tone={heroTone as any}
                  icon="🎯"
                />
                <Kpi title="تم العمل عليهم" value={clientMetrics.workedClients} sub="Any activity in range" tone="success" icon="🛠️" />
                <Kpi title="تم تعديلهم" value={clientMetrics.editedClients} sub="Updated within range" tone="warning" icon="✍️" />
              </div>

              <div className="r-grid2">
                <Panel title="تفصيل النشاط داخل الفترة" hint="Clients touched by activity type" right={<Badge tone="neutral">Worked Sets</Badge>}>
                  <MiniBars
                    items={[
                      { label: 'متابعات', value: clientMetrics.workedByFollowups, tone: 'info' as const },
                      { label: 'حجوزات', value: clientMetrics.workedByReservations, tone: 'success' as const },
                      { label: 'ملاحظات', value: clientMetrics.workedByReservationNotes, tone: 'neutral' as const },
                      { label: 'مبيعات', value: clientMetrics.workedBySales, tone: 'success' as const },
                      { label: 'زيارات', value: clientMetrics.workedByVisits, tone: 'info' as const },
                    ].filter((x) => x.value > 0)}
                  />
                </Panel>

                <Panel title="توزيع حالات العملاء" hint="Top statuses" right={<Badge tone="info">Top 8</Badge>}>
                  <MiniBars
                    items={clientsStatusTop.map((x, i) => ({
                      label: x.label,
                      value: x.value,
                      tone: i < 2 ? ('success' as const) : i < 5 ? ('info' as const) : ('neutral' as const),
                    }))}
                    maxLabel={160}
                  />
                </Panel>
              </div>

              <Panel
                title="قائمة العملاء"
                hint={`${filteredClients.length} عميل بعد البحث • ${showClients ? 'معروضة' : 'مخفية'} • يتم عرض أول 500 فقط`}
                right={
                  <div className="r-rowActions">
                    <Button onClick={() => setShowClients((p) => !p)} variant={showClients ? 'secondary' : 'primary'}>
                      {showClients ? 'إخفاء' : 'عرض'}
                    </Button>
                  </div>
                }
              >
                {!showClients ? (
                  <div className="r-emptyTiny">تم إخفاء القائمة.</div>
                ) : (
                  <div className="r-tableWrap">
                    <table className="r-table">
                      <thead>
                        <tr>
                          <th>العميل</th>
                          <th>الجوال</th>
                          <th>الحالة</th>
                          <th>مستحق</th>
                          <th>تاريخ الإضافة</th>
                          <th>تم العمل عليه؟</th>
                          <th>تم تعديله؟</th>
                          <th>فتح</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClients.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="r-tdEmpty">
                              لا توجد نتائج
                            </td>
                          </tr>
                        ) : (
                          filteredClients.slice(0, 500).map((c) => {
                            const worked = workedSets?.union.has(c.id);
                            const { startISO, endISOExclusive } = buildIsoRange(dateRange.start, dateRange.end);
                            const edited =
                              !!c.updated_at &&
                              new Date(c.updated_at).getTime() >= new Date(startISO).getTime() &&
                              new Date(c.updated_at).getTime() < new Date(endISOExclusive).getTime() &&
                              new Date(c.updated_at).getTime() > new Date(c.created_at).getTime();

                            return (
                              <tr key={c.id} className="r-tr">
                                <td className="r-strong">{c.name}</td>
                                <td>{c.mobile || '-'}</td>
                                <td>
                                  <Badge tone="neutral">{translateStatus(c.status)}</Badge>
                                </td>
                                <td>{c.eligible ? <Badge tone="success">مستحق</Badge> : <Badge tone="danger">غير مستحق</Badge>}</td>
                                <td>{new Date(c.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                <td>{worked ? <Badge tone="success">نعم</Badge> : <Badge tone="neutral">لا</Badge>}</td>
                                <td>{edited ? <Badge tone="warning">نعم</Badge> : <Badge tone="neutral">لا</Badge>}</td>
                                <td>
                                  <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>فتح</Button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>

                    {filteredClients.length > 500 ? <div className="r-footNote">تم عرض أول 500 عميل فقط لتقليل الضغط.</div> : null}
                  </div>
                )}
              </Panel>
            </>
          ) : null}

          {/* Empty states */}
          {!generating && tab === 'employee_activity' && !activitySummary ? (
            <div className="r-empty">
              <div className="r-empty__icon">📊</div>
              <div className="r-empty__title">جاهزين للتقرير</div>
              <div className="r-empty__sub">اختار الموظف والفترة ثم اضغط “توليد”</div>
            </div>
          ) : null}

          {!generating && tab === 'clients' && !clientMetrics ? (
            <div className="r-empty">
              <div className="r-empty__icon">👥</div>
              <div className="r-empty__title">جاهزين لتقرير العملاء</div>
              <div className="r-empty__sub">اختار الفترة والفلترة ثم اضغط “توليد”</div>
            </div>
          ) : null}
        </div>

        {/* Modal */}
        <Modal open={modalOpen} title={modalTitle} onClose={() => setModalOpen(false)}>
          {modalBody}
        </Modal>
      </div>
    </RequireAuth>
  );
}

/* =====================
   Global CSS (Premium)
===================== */

const globalCss = `
  :root{
    --bg: #0b1220;
    --card: rgba(255,255,255,0.92);
    --card2: rgba(255,255,255,0.86);
    --line: rgba(226,232,240,0.9);
    --text: #0f172a;
    --muted: #64748b;
    --muted2: #94a3b8;
    --shadow: 0 18px 60px rgba(2,6,23,.18);
    --shadow2: 0 8px 22px rgba(2,6,23,.10);
    --radius: 16px;
  }

  /* page */
  .r-page{
    background: #f6f7fb;
    min-height: 100vh;
  }

  .r-content{
    max-width: 1280px;
    margin: 0 auto;
    padding: 14px 14px 44px;
  }

  /* HERO */
  .r-hero{
    position: relative;
    overflow: hidden;
    padding: 18px 0 14px;
    background: radial-gradient(1200px 600px at 70% -10%, rgba(99,102,241,.18), transparent 60%),
                radial-gradient(900px 500px at 10% 0%, rgba(14,165,233,.14), transparent 60%),
                linear-gradient(180deg, #0b1220 0%, #0b1220 60%, rgba(246,247,251,0) 100%);
  }

  .r-hero__inner{
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 14px 8px;
    color: #fff;
  }

  .r-hero__glow{
    position:absolute;
    inset: -40% -20% auto -20%;
    height: 380px;
    filter: blur(28px);
    background: radial-gradient(closest-side, rgba(99,102,241,.35), rgba(14,165,233,.18), transparent 70%);
    pointer-events:none;
  }

  .r-crumbs{
    display:flex;
    align-items:center;
    gap:10px;
    color: rgba(226,232,240,.85);
    font-size: 12px;
    margin-bottom: 10px;
  }
  .r-crumb--active{ color: #fff; font-weight: 900; }
  .r-crumb-sep{ opacity: .7; }

  .r-hero__row{
    display:flex;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .r-hero__left{ min-width: 320px; }
  .r-hero__title{
    margin: 0;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: -0.3px;
  }
  .r-hero__sub{
    margin: 8px 0 0;
    color: rgba(226,232,240,.82);
    max-width: 720px;
    line-height: 1.6;
    font-size: 13px;
  }
  .r-hero__badges{
    margin-top: 12px;
    display:flex;
    gap:8px;
    flex-wrap: wrap;
  }

  .r-hero__right{
    display:flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-end;
    min-width: 320px;
  }
  .r-actions{
    display:flex;
    gap:10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .r-tabsWrap{ display:flex; justify-content: flex-end; width: 100%; }

  /* tabs */
  .r-tabs{
    display:inline-flex;
    gap:4px;
    padding: 4px;
    border-radius: 14px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(148,163,184,.25);
    backdrop-filter: blur(8px);
  }
  .r-tab{
    border: none;
    cursor: pointer;
    padding: 10px 12px;
    border-radius: 12px;
    background: transparent;
    color: rgba(226,232,240,.92);
    font-weight: 900;
    font-size: 13px;
    display:inline-flex;
    gap:8px;
    align-items:center;
    min-width: 170px;
    justify-content: center;
    transition: all .15s ease;
  }
  .r-tab:hover{ background: rgba(255,255,255,.08); }
  .r-tab.is-active{
    background: rgba(255,255,255,.92);
    color: #0b1220;
    box-shadow: 0 8px 22px rgba(2,6,23,.18);
  }
  .r-tab__icon{ filter: saturate(1.2); }

  /* sticky bar */
  .r-sticky{
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgba(246,247,251,0.86);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(226,232,240,.8);
  }
  .r-sticky__inner{
    max-width: 1280px;
    margin: 0 auto;
    padding: 10px 14px;
    display:flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .r-sticky__left{ display:flex; gap: 12px; align-items:center; flex-wrap: wrap; }
  .r-sticky__right{ display:flex; gap: 8px; flex-wrap: wrap; align-items:center; justify-content: flex-end; }

  .r-linkBtn{
    border:none;
    background: transparent;
    cursor:pointer;
    font-weight: 900;
    color: #0f172a;
    font-size: 13px;
  }
  .r-mini{
    font-size: 12px;
    color: #334155;
    display:flex;
    align-items:center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,.9);
    border: 1px solid rgba(226,232,240,.9);
  }
  .r-quick{
    border: 1px solid rgba(226,232,240,.9);
    background: rgba(255,255,255,.9);
    padding: 6px 10px;
    border-radius: 999px;
    cursor:pointer;
    font-weight: 900;
    font-size: 12px;
    color: #0f172a;
    transition: all .12s ease;
  }
  .r-quick:hover{
    transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(2,6,23,.08);
  }

  /* layout */
  .r-grid2{
    display:grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 12px;
  }
  @media (max-width: 980px){
    .r-grid2{ grid-template-columns: 1fr; }
    .r-hero__right{ align-items: flex-start; }
    .r-tabsWrap{ justify-content: flex-start; }
  }

  .r-cardLite{
    background: rgba(255,255,255,.94);
    border: 1px solid rgba(226,232,240,.95);
    border-radius: var(--radius);
    box-shadow: var(--shadow2);
    overflow: hidden;
  }
  .r-cardLite__head{
    padding: 14px;
    display:flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
    border-bottom: 1px solid rgba(226,232,240,.8);
    background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(255,255,255,.90));
  }
  .r-cardLite__title{
    font-weight: 900;
    color: #0f172a;
    font-size: 14px;
  }
  .r-cardLite__hint{
    margin-top: 4px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.5;
  }

  .r-formGrid{
    padding: 14px;
    display:grid;
    grid-template-columns: repeat(2, minmax(220px,1fr));
    gap: 12px;
  }
  @media (max-width: 860px){
    .r-formGrid{ grid-template-columns: 1fr; }
  }

  .r-field{ display:flex; flex-direction: column; gap: 6px; }
  .r-field--span2{ grid-column: span 2; }
  @media (max-width: 860px){ .r-field--span2{ grid-column: span 1; } }
  .r-field--row{ flex-direction: row; align-items: center; gap: 12px; }

  .r-label{ font-size: 12px; font-weight: 900; color: #334155; }
  .r-select, .r-input{
    width: 100%;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid rgba(226,232,240,.95);
    background: rgba(255,255,255,.95);
    font-weight: 800;
    color: #0f172a;
    outline: none;
  }
  .r-select:focus, .r-input:focus{
    border-color: rgba(99,102,241,.45);
    box-shadow: 0 0 0 4px rgba(99,102,241,.12);
  }
  .r-help{ font-size: 12px; color: #64748b; }

  .r-log{ padding: 14px; }
  .r-debug{
    margin: 0;
    padding: 12px;
    background: #0b1220;
    color: rgba(226,232,240,.95);
    border-radius: 14px;
    border: 1px solid rgba(148,163,184,.2);
    font-size: 12px;
    white-space: pre-line;
    max-height: 320px;
    overflow: auto;
  }
  .r-emptyTiny{ padding: 12px; color:#64748b; font-size: 12px; }

  /* KPIs */
  .r-kpis{
    display:grid;
    grid-template-columns: repeat(4, minmax(220px,1fr));
    gap: 12px;
    margin-top: 14px;
    margin-bottom: 12px;
  }
  @media (max-width: 1100px){ .r-kpis{ grid-template-columns: repeat(2, minmax(220px,1fr)); } }
  @media (max-width: 620px){ .r-kpis{ grid-template-columns: 1fr; } }

  .r-kpi{
    background: rgba(255,255,255,.95);
    border: 1px solid rgba(226,232,240,.95);
    border-radius: var(--radius);
    box-shadow: var(--shadow2);
    padding: 14px;
    display:flex;
    gap: 12px;
    align-items:flex-start;
    transition: transform .12s ease, box-shadow .12s ease;
  }
  .r-kpi:hover{
    transform: translateY(-2px);
    box-shadow: 0 18px 40px rgba(2,6,23,.10);
  }
  .r-kpi__icon{
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size: 18px;
    border: 1px solid rgba(226,232,240,.95);
    background: rgba(248,250,252,.9);
  }
  .r-kpi__icon--info{ background: rgba(14,165,233,.12); border-color: rgba(14,165,233,.25); }
  .r-kpi__icon--success{ background: rgba(34,197,94,.12); border-color: rgba(34,197,94,.25); }
  .r-kpi__icon--warning{ background: rgba(245,158,11,.12); border-color: rgba(245,158,11,.25); }
  .r-kpi__icon--danger{ background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.25); }
  .r-kpi__body{ flex: 1; }
  .r-kpi__title{ font-size: 12px; color: #64748b; font-weight: 900; }
  .r-kpi__value{ margin-top: 6px; font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -0.3px; }
  .r-kpi__sub{ margin-top: 6px; font-size: 12px; color: #64748b; line-height: 1.4; }

  /* Panel */
  .r-panel{
    background: rgba(255,255,255,.95);
    border: 1px solid rgba(226,232,240,.95);
    border-radius: var(--radius);
    box-shadow: var(--shadow2);
    overflow: hidden;
    margin-top: 12px;
  }
  .r-panel__head{
    padding: 14px;
    display:flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
    border-bottom: 1px solid rgba(226,232,240,.8);
    background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(255,255,255,.90));
  }
  .r-panel__title{ font-weight: 900; color: #0f172a; font-size: 14px; }
  .r-panel__hint{ margin-top: 4px; color: #64748b; font-size: 12px; line-height: 1.5; }
  .r-panel__body{ padding: 14px; }
  .r-rowActions{ display:flex; gap: 8px; align-items:center; }

  /* Bars */
  .r-bars{ display:flex; flex-direction: column; gap: 10px; }
  .r-bars__row{ display:flex; gap: 10px; align-items: center; }
  .r-bars__label{
    width: 190px;
    font-size: 12px;
    font-weight: 900;
    color: #334155;
    display:flex;
    align-items:center;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .r-bars__track{
    flex: 1;
    height: 12px;
    border-radius: 999px;
    background: #eef2f7;
    overflow:hidden;
    border: 1px solid rgba(226,232,240,.9);
  }
  .r-bars__fill{ height: 100%; border-radius: 999px; }
  .r-bars__fill--neutral{ background: #111827; }
  .r-bars__fill--info{ background: linear-gradient(90deg, #0ea5e9, #6366f1); }
  .r-bars__fill--success{ background: linear-gradient(90deg, #22c55e, #16a34a); }
  .r-bars__fill--warning{ background: linear-gradient(90deg, #f59e0b, #f97316); }
  .r-bars__fill--danger{ background: linear-gradient(90deg, #ef4444, #f43f5e); }
  .r-bars__val{ width: 44px; text-align: left; font-weight: 900; color: #0f172a; font-size: 12px; }

  /* table */
  .r-tableWrap{
    border: 1px solid rgba(226,232,240,.95);
    border-radius: var(--radius);
    overflow: auto;
  }
  .r-table{
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    min-width: 980px;
    background: #fff;
  }
  .r-table thead th{
    position: sticky;
    top: 0;
    z-index: 1;
    background: #f8fafc;
    border-bottom: 1px solid rgba(226,232,240,.95);
    font-size: 12px;
    font-weight: 900;
    color: #334155;
    text-align: right;
    padding: 12px;
  }
  .r-table tbody td{
    border-bottom: 1px solid rgba(241,245,249,.95);
    font-size: 13px;
    color: #0f172a;
    padding: 12px;
    vertical-align: top;
  }
  .r-tr{
    cursor: pointer;
    transition: background .12s ease;
  }
  .r-tr:hover{
    background: #f8fafc;
  }
  .r-strong{ font-weight: 900; }
  .r-wrap{ max-width: 460px; word-break: break-word; }
  .r-tdEmpty{
    padding: 24px !important;
    text-align: center;
    color: #64748b !important;
    font-weight: 800;
  }
  .r-footNote{
    padding: 12px;
    font-size: 12px;
    color: #64748b;
    background: #f8fafc;
    border-top: 1px solid rgba(226,232,240,.85);
  }

  /* badges & dots */
  .r-badge{
    display:inline-flex;
    align-items:center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 900;
    border: 1px solid rgba(226,232,240,.85);
    background: rgba(255,255,255,.9);
    color: #0f172a;
    white-space: nowrap;
  }
  .r-badge--neutral{ background: rgba(255,255,255,.92); }
  .r-badge--info{ background: rgba(14,165,233,.12); border-color: rgba(14,165,233,.25); color: #075985; }
  .r-badge--success{ background: rgba(34,197,94,.12); border-color: rgba(34,197,94,.25); color: #14532d; }
  .r-badge--warning{ background: rgba(245,158,11,.14); border-color: rgba(245,158,11,.28); color: #7c2d12; }
  .r-badge--danger{ background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.25); color: #7f1d1d; }

  .r-dot{
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #111827;
    display:inline-block;
    box-shadow: 0 0 0 3px rgba(17,24,39,.10);
  }
  .r-dot--info{ background:#0ea5e9; box-shadow: 0 0 0 3px rgba(14,165,233,.12); }
  .r-dot--success{ background:#22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.12); }
  .r-dot--warning{ background:#f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,.12); }
  .r-dot--danger{ background:#ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,.12); }

  /* insights */
  .r-ins{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 820px){
    .r-ins{ grid-template-columns: 1fr; }
  }
  .r-ins__item{
    border: 1px solid rgba(226,232,240,.95);
    border-radius: 14px;
    padding: 12px;
    background: rgba(248,250,252,.75);
  }
  .r-ins__k{ font-size: 12px; color: #64748b; font-weight: 900; }
  .r-ins__v{ margin-top: 6px; font-weight: 900; color: #0f172a; }

  /* modal */
  .r-modal__backdrop{
    position: fixed;
    inset: 0;
    background: rgba(2,6,23,.55);
    display:flex;
    justify-content:center;
    align-items:center;
    padding: 14px;
    z-index: 9999;
  }
  .r-modal{
    width: min(880px, 100%);
    background: rgba(255,255,255,.98);
    border-radius: 18px;
    border: 1px solid rgba(226,232,240,.95);
    box-shadow: 0 30px 90px rgba(2,6,23,.35);
    overflow:hidden;
  }
  .r-modal__head{
    padding: 14px;
    border-bottom: 1px solid rgba(226,232,240,.85);
    display:flex;
    justify-content: space-between;
    gap: 10px;
    align-items:center;
    background: #fff;
  }
  .r-modal__title{ font-weight: 900; color: #0f172a; }
  .r-modal__close{
    border: none;
    background: #f1f5f9;
    border-radius: 12px;
    padding: 10px 12px;
    cursor:pointer;
    font-weight: 900;
    color: #0f172a;
  }
  .r-modal__body{ padding: 14px; }
  .r-modalGrid{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 860px){ .r-modalGrid{ grid-template-columns: 1fr; } }
  .r-box{
    border: 1px solid rgba(226,232,240,.95);
    border-radius: 14px;
    padding: 12px;
    background: rgba(248,250,252,.7);
  }
  .r-box__k{ font-size: 12px; color: #64748b; font-weight: 900; }
  .r-box__v{ margin-top: 6px; color: #0f172a; font-weight: 800; line-height: 1.6; }

  /* empty */
  .r-empty{
    margin-top: 14px;
    background: rgba(255,255,255,.95);
    border: 1px dashed rgba(148,163,184,.6);
    border-radius: var(--radius);
    padding: 28px;
    text-align:center;
    box-shadow: var(--shadow2);
  }
  .r-empty__icon{ font-size: 30px; margin-bottom: 10px; }
  .r-empty__title{ font-weight: 900; color: #0f172a; font-size: 16px; }
  .r-empty__sub{ margin-top: 6px; color: #64748b; font-size: 12px; }

  /* loading center */
  .r-center{
    display:flex;
    justify-content:center;
    align-items:center;
    min-height: 80vh;
    background: #f6f7fb;
    padding: 14px;
  }
  .r-skeleton{
    width: min(980px, 100%);
    background: rgba(255,255,255,.95);
    border: 1px solid rgba(226,232,240,.95);
    border-radius: var(--radius);
    padding: 16px;
    box-shadow: var(--shadow2);
  }
  .r-skeleton__title{ height: 22px; width: 320px; border-radius: 10px; background: linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9); animation: sk 1.2s infinite linear; }
  .r-skeleton__line{ height: 12px; width: 520px; border-radius: 10px; margin-top: 10px; background: linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9); animation: sk 1.2s infinite linear; }
  .r-skeleton__grid{ display:grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-top: 14px; }
  @media (max-width: 860px){ .r-skeleton__grid{ grid-template-columns: 1fr; } }
  .r-skeleton__card{ height: 88px; border-radius: 14px; background: linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9); animation: sk 1.2s infinite linear; }
  @keyframes sk{
    0%{ background-position: 0% 0; }
    100%{ background-position: 200% 0; }
  }
` as const;