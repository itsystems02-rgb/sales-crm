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
  conversionRate: number;
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
  distributionRate: number;

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
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISOExclusive: end.toISOString() };
}

function safeText(v: any) {
  return (v ?? '').toString();
}

// بعض علاقات supabase بتطلع Array بدل Object
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
      break;
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

function badgeStyle(kind: 'neutral' | 'success' | 'warning' | 'danger' | 'info') {
  const m: Record<string, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: '#f5f5f5', fg: '#444', bd: '#e5e5e5' },
    success: { bg: '#e6f4ea', fg: '#0d8a3e', bd: '#cdebd8' },
    warning: { bg: '#fff8e1', fg: '#b7791f', bd: '#f7e3a1' },
    danger: { bg: '#ffebee', fg: '#c62828', bd: '#ffcdd2' },
    info: { bg: '#e8f0fe', fg: '#1a73e8', bd: '#c7dbff' },
  };
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700 as const,
    backgroundColor: m[kind].bg,
    color: m[kind].fg,
    border: `1px solid ${m[kind].bd}`,
    whiteSpace: 'nowrap' as const,
  };
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

  // filters (merged)
  const [selectedEmployeeIdActivity, setSelectedEmployeeIdActivity] = useState<string>(''); // activity needs single employee
  const [selectedEmployeeIdClients, setSelectedEmployeeIdClients] = useState<string>('all'); // clients can be all/employee
  const [projectId, setProjectId] = useState<string>('all');

  // UI states
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  // activity report state
  const [activities, setActivities] = useState<EmployeeActivity[]>([]);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [detailedActivity, setDetailedActivity] = useState<DetailedActivity | null>(null);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityTypeFilter, setActivityTypeFilter] = useState<EmployeeActivityType | 'all'>('all');
  const [showDetails, setShowDetails] = useState(false);

  // clients report state
  const [clientMetrics, setClientMetrics] = useState<ClientMetrics | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [workedSets, setWorkedSets] = useState<WorkedSets | null>(null);
  const [showClients, setShowClients] = useState(true);
  const [clientSearch, setClientSearch] = useState('');

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

      // allowed: admin + sales_manager
      if (emp.role !== 'admin' && emp.role !== 'sales_manager') {
        alert('غير مصرح لك بالوصول إلى صفحة التقارير');
        router.push('/dashboard');
        return;
      }

      setCurrentEmployee(emp);
      setDebugInfo((p) => p + `\n✅ المستخدم: ${emp.name} (${emp.role})`);

      // load allowed projects for sales_manager
      const allowed = await loadMyAllowedProjects(emp);
      // load employees list scope
      await loadEmployees(emp, allowed.map((x) => x.id));
      // load projects dropdown scope
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

      // default for activity employee selector
      if (emps.length > 0) setSelectedEmployeeIdActivity((prev) => prev || emps[0].id);
      return;
    }

    // sales_manager: employees within allowed projects
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
     Generate (Router)
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

    setGenerating(true);
    try {
      if (tab === 'employee_activity') {
        await generateEmployeeActivityReport();
      } else {
        await generateClientsReport();
      }
    } finally {
      setGenerating(false);
    }
  }

  /* =====================
     Employee Activity Report
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

    const merged = Array.from(map.values());

    return merged.map((r: any) => {
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
      const score = sales * 40 + reservations * 20 + reservationNotes * 8 + reservationFollowUps * 10 + followUps * 10 + visits * 12;
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
    if (!selectedEmployeeIdActivity) {
      alert('اختر الموظف (تقرير الأنشطة)');
      return;
    }

    // reset
    setActivities([]);
    setActivitySummary(null);
    setTimeSlots([]);
    setDetailedActivity(null);

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

    const all: EmployeeActivity[] = [];

    // Followups
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

    // Reservations + reservation followup
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
          notes: r.follow_up_details || '',
        });
      }
    }

    // Sales
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

    // Visits
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

    // Notes
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
     Clients Report
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

      // sales_manager scope
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

  async function fetchAssignmentsForClients(clientIds: string[]) {
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

  async function distinctClientIdsFromTableInRange(table: string, clientIds: string[], startISO: string, endISOExclusive: string, clientCol = 'client_id') {
    const out = new Set<string>();
    const chunks = chunkArray(clientIds, 500);

    for (const ch of chunks) {
      const { data, error } = await supabase.from(table).select(`${clientCol},created_at`).in(clientCol, ch).gte('created_at', startISO).lt('created_at', endISOExclusive);
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
      let q = supabase.from('reservation_notes').select('reservation_id, created_at').in('reservation_id', rch).gte('created_at', startISO).lt('created_at', endISOExclusive);

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
        selectedEmployeeIdClients === 'all' ? 'الكل' : employees.find((e) => e.id === selectedEmployeeIdClients)?.name || selectedEmployeeIdClients
      }\n🏗️ المشروع: ${projectId === 'all' ? 'الكل' : projectId}`
    );

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
    const assignmentMap = await fetchAssignmentsForClients(allClientIds);

    let filteredClients = allClients;
    if (selectedEmployeeIdClients !== 'all') {
      filteredClients = allClients.filter((c) => assignmentMap.get(c.id)?.has(selectedEmployeeIdClients));
    }

    const clientIds = filteredClients.map((c) => c.id);

    const assignedClients = filteredClients.filter((c) => (assignmentMap.get(c.id)?.size || 0) > 0).length;
    const unassignedClients = filteredClients.length - assignedClients;
    const distributionRate = filteredClients.length ? Math.round((assignedClients / filteredClients.length) * 1000) / 10 : 0;

    const worked = await fetchWorkedSets(clientIds, startISO, endISOExclusive);
    setWorkedSets(worked);

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
     Export (Tab-based)
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
      a.download = tab === 'employee_activity' ? `تقرير_الانشطة_${dateRange.start}_الى_${dateRange.end}.json` : `تقرير_العملاء_${dateRange.start}_الى_${dateRange.end}.json`;
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

    // clients csv
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
     Filtering UI helpers
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
      list = list.filter((c) => (c.name || '').toLowerCase().includes(t) || (c.mobile || '').toLowerCase().includes(t) || (c.status || '').toLowerCase().includes(t));
    }
    return list;
  }, [clients, clientSearch]);

  /* =====================
     Render
  ===================== */

  if (loading) {
    return (
      <RequireAuth>
        <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 760 }}>
            <div style={{ fontSize: 18, marginBottom: 10 }}>جاري تحميل صفحة التقارير...</div>
            {debugInfo && (
              <div style={{ fontSize: 12, color: '#666', backgroundColor: '#f8f9fa', padding: 12, borderRadius: 10, textAlign: 'left', whiteSpace: 'pre-line', border: '1px solid #eee' }}>
                {debugInfo}
              </div>
            )}
          </div>
        </div>
      </RequireAuth>
    );
  }

  const selectedActivityEmp = employees.find((e) => e.id === selectedEmployeeIdActivity);

  const headerTitle = tab === 'employee_activity' ? 'تقرير أنشطة الموظف' : 'تقرير العملاء';
  const headerSubtitle =
    tab === 'employee_activity'
      ? 'تجميع الأنشطة خلال فترة محددة + ملخص + تحليل زمني + تصدير'
      : 'إحصائيات العملاء خلال فترة إنشاء + توزيع + نشاط + تعديل بيانات + تصدير';

  const canSeeProjects = tab === 'clients'; // only clients tab uses project filter
  const canChooseEmployeeModeAll = tab === 'clients'; // clients can be all

  const canGenerate =
    !!dateRange.start && !!dateRange.end && (tab === 'clients' ? true : !!selectedEmployeeIdActivity);

  return (
    <RequireAuth>
      <div className="page">
        {/* Top Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 14,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0 }}>{headerTitle}</h1>
              <span style={badgeStyle(currentEmployee?.role === 'admin' ? 'success' : 'info')}>{currentEmployee?.role}</span>
              <span style={badgeStyle('neutral')}>
                {dateRange.start} → {dateRange.end}
              </span>
            </div>
            <p style={{ color: '#666', marginTop: 6 }}>{headerSubtitle}</p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button onClick={exportJSON} disabled={exporting || (tab === 'employee_activity' ? !activitySummary : !clientMetrics)} variant="secondary">
              {exporting ? 'جاري التصدير...' : 'تصدير JSON'}
            </Button>
            <Button onClick={exportCSV} disabled={tab === 'employee_activity' ? !activities.length : !clientMetrics} variant="secondary">
              تصدير CSV
            </Button>
            <Button onClick={printReport} disabled={tab === 'employee_activity' ? !activities.length : !clientMetrics}>
              طباعة
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            onClick={() => setTab('employee_activity')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: tab === 'employee_activity' ? '1px solid #1a73e8' : '1px solid #e5e5e5',
              background: tab === 'employee_activity' ? '#e8f0fe' : '#fff',
              color: '#222',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            تقرير الأنشطة
          </button>

          <button
            onClick={() => setTab('clients')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: tab === 'clients' ? '1px solid #1a73e8' : '1px solid #e5e5e5',
              background: tab === 'clients' ? '#e8f0fe' : '#fff',
              color: '#222',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            تقرير العملاء
          </button>
        </div>

        {/* Debug */}
        {debugInfo && (
          <div style={{ marginBottom: 14, padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12, border: '1px solid #e9ecef', fontSize: 12, color: '#666', whiteSpace: 'pre-line', maxHeight: 220, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 'bold' }}>سجل النظام</div>
              <button
                onClick={() => setDebugInfo('')}
                style={{ fontSize: 11, padding: '2px 8px', backgroundColor: '#e9ecef', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                مسح
              </button>
            </div>
            {debugInfo}
          </div>
        )}

        {/* Filters */}
        <Card title="فلترة التقرير">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, padding: 14 }}>
            {/* Employee */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 700 }}>
                {tab === 'employee_activity' ? 'اختر الموظف (إلزامي)' : 'الموظف'}
              </label>

              <select
                value={tab === 'employee_activity' ? selectedEmployeeIdActivity : selectedEmployeeIdClients}
                onChange={(e) => (tab === 'employee_activity' ? setSelectedEmployeeIdActivity(e.target.value) : setSelectedEmployeeIdClients(e.target.value))}
                style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}
              >
                {canChooseEmployeeModeAll && <option value="all">الكل</option>}
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.role === 'sales_manager' ? '(مشرف)' : emp.role === 'sales' ? '(مبيعات)' : emp.role === 'admin' ? '(Admin)' : ''}
                  </option>
                ))}
              </select>

              <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>{employees.length} موظف</div>
            </div>

            {/* Project (clients only) */}
            {canSeeProjects && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 700 }}>المشروع</label>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}>
                  <option value="all">الكل</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.name} (${p.code})` : p.name}
                    </option>
                  ))}
                </select>
                {currentEmployee?.role === 'sales_manager' && (
                  <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                    نطاقك: {myAllowedProjects.length ? `${myAllowedProjects.length} مشروع` : 'لا يوجد مشاريع مفعّلة لك'}
                  </div>
                )}
              </div>
            )}

            {/* Date start */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 700 }}>من تاريخ *</label>
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }} />
            </div>

            {/* Date end */}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#333', fontWeight: 700 }}>إلى تاريخ *</label>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd' }} />
            </div>

            {/* Generate */}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%' }}>
                <Button onClick={generate} disabled={generating || !canGenerate}>
                  {generating ? 'جاري التوليد...' : 'توليد التقرير'}
                </Button>
              </div>
            </div>
          </div>

          {/* Sub-filters per tab */}
          {tab === 'employee_activity' && (
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderTop: '1px solid #eee', flexWrap: 'wrap', alignItems: 'center', background: '#fafafa' }}>
              <div style={{ minWidth: 220 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#666', fontWeight: 700 }}>نوع النشاط</label>
                <select value={activityTypeFilter} onChange={(e) => setActivityTypeFilter(e.target.value as any)} style={{ width: '100%', padding: 9, borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}>
                  <option value="all">الكل</option>
                  <option value="client_followup">متابعات</option>
                  <option value="reservation">حجوزات</option>
                  <option value="reservation_followup">متابعات الحجوزات</option>
                  <option value="reservation_note">ملاحظات الحجوزات</option>
                  <option value="sale">مبيعات</option>
                  <option value="visit">زيارات</option>
                </select>
              </div>

              <div style={{ flex: 1, minWidth: 260 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#666', fontWeight: 700 }}>بحث</label>
                <Input placeholder="ابحث في النشاط/العميل/الوحدة/المشروع..." value={activitySearch} onChange={(e) => setActivitySearch((e.target as any).value)} />
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <Button onClick={() => setShowDetails((p) => !p)} variant={showDetails ? 'primary' : 'secondary'} disabled={!detailedActivity}>
                  {showDetails ? 'إخفاء Raw' : 'عرض Raw'}
                </Button>
              </div>
            </div>
          )}

          {tab === 'clients' && (
            <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderTop: '1px solid #eee', flexWrap: 'wrap', alignItems: 'center', background: '#fafafa' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#666', fontWeight: 700 }}>بحث في العملاء</label>
                <Input placeholder="بحث بالاسم/الجوال/الحالة..." value={clientSearch} onChange={(e) => setClientSearch((e.target as any).value)} />
              </div>

              <Button onClick={() => setShowClients((p) => !p)} variant={showClients ? 'secondary' : 'primary'} disabled={!clientMetrics}>
                {showClients ? 'إخفاء القائمة' : 'عرض القائمة'}
              </Button>
            </div>
          )}
        </Card>

        {/* Generating */}
        {generating && (
          <div style={{ textAlign: 'center', padding: 40, backgroundColor: 'white', borderRadius: 12, marginBottom: 16, border: '1px solid #e9ecef', marginTop: 14 }}>
            <div style={{ fontSize: 18, marginBottom: 10 }}>جاري توليد التقرير...</div>
            <div style={{ color: '#666' }}>قد تستغرق العملية بضع لحظات</div>
          </div>
        )}

        {/* =====================
            TAB: Employee Activity
        ====================== */}
        {!generating && tab === 'employee_activity' && activitySummary && (
          <>
            {/* Summary strip */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                backgroundColor: 'white',
                borderRadius: 12,
                marginTop: 14,
                marginBottom: 14,
                boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                flexWrap: 'wrap',
                gap: 10,
                border: '1px solid #e9ecef',
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{selectedActivityEmp?.name || '—'}</div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  الفترة: {dateRange.start} → {dateRange.end} • إجمالي: {activitySummary.totalActivities}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={badgeStyle(activitySummary.efficiencyScore >= 80 ? 'success' : activitySummary.efficiencyScore >= 60 ? 'warning' : 'danger')}>
                  الكفاءة: {activitySummary.efficiencyScore}%
                </span>
                <span style={badgeStyle('info')}>التحويل: {activitySummary.conversionRate}%</span>
                <span style={badgeStyle('neutral')}>Peak: {activitySummary.peakHour}</span>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
              <Stat title="إجمالي الأنشطة" value={activitySummary.totalActivities} />
              <Stat title="متابعات" value={activitySummary.followUps} />
              <Stat title="حجوزات" value={activitySummary.reservations} />
              <Stat title="متابعات حجوزات" value={activitySummary.reservationFollowUps} />
              <Stat title="ملاحظات حجوزات" value={activitySummary.reservationNotes} />
              <Stat title="مبيعات" value={activitySummary.sales} />
              <Stat title="زيارات" value={activitySummary.visits} />
              <Stat title="عملاء تم التعامل معهم" value={activitySummary.uniqueClientsTouched} />
              <Stat title="إجمالي الوقت" value={`${activitySummary.totalDuration} د`} />
              <Stat title="متوسط النشاط" value={`${activitySummary.avgActivityDuration} د`} />
            </div>

            {/* Activities table */}
            <Card title="تفاصيل الأنشطة">
              {filteredActivities.length ? (
                <div style={{ overflowX: 'auto', padding: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                        <th style={{ padding: 12, textAlign: 'right' }}>النوع</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>النشاط</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>التفاصيل</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>العميل</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>الوحدة</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>الوقت</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>المدة</th>
                        <th style={{ padding: 12, textAlign: 'right' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActivities.map((a, idx) => (
                        <tr
                          key={`${a.type}-${a.id}`}
                          onClick={() => alert(`التفاصيل:\n${a.details}\n\nملاحظات:\n${a.notes || 'لا توجد'}`)}
                          style={{
                            borderBottom: '1px solid #e9ecef',
                            cursor: 'pointer',
                            backgroundColor: idx % 2 === 0 ? '#fff' : '#fbfbfb',
                          }}
                        >
                          <td style={{ padding: 12 }}>{a.type}</td>
                          <td style={{ padding: 12, fontWeight: 800 }}>{a.action}</td>
                          <td style={{ padding: 12, maxWidth: 420, wordWrap: 'break-word' }}>{a.details}</td>
                          <td style={{ padding: 12 }}>{a.client_name || '-'}</td>
                          <td style={{ padding: 12 }}>{a.unit_code || '-'}</td>
                          <td style={{ padding: 12 }}>
                            {new Date(a.timestamp).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: 12 }}>{a.duration || 0} د</td>
                          <td style={{ padding: 12 }}>{a.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 26, color: '#666' }}>لا توجد بيانات حسب الفلاتر الحالية</div>
              )}
            </Card>

            {/* Raw details */}
            {showDetails && detailedActivity && (
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
            )}

            {/* Time slots */}
            <div style={{ marginTop: 14 }}>
              <Card title="التحليل الزمني (حسب الساعة)">
                <div style={{ padding: 14 }}>
                  {timeSlots.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {timeSlots.map((slot) => (
                        <div key={slot.hour} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 150, fontSize: 13, color: '#444' }}>{slot.hour}</div>
                          <div style={{ flex: 1, height: 18, backgroundColor: '#e9ecef', borderRadius: 999, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                backgroundColor: '#1a73e8',
                                width: `${Math.min((slot.count / Math.max(...timeSlots.map((s) => s.count))) * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <div style={{ width: 40, textAlign: 'right', fontWeight: 900 }}>{slot.count}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>لا توجد بيانات كافية</div>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}

        {/* =====================
            TAB: Clients
        ====================== */}
        {!generating && tab === 'clients' && clientMetrics && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 14, marginBottom: 14 }}>
              <Stat title="إجمالي العملاء" value={clientMetrics.totalClients} />
              <Stat title="موزعين" value={clientMetrics.assignedClients} />
              <Stat title="غير موزعين" value={clientMetrics.unassignedClients} />
              <Stat title="نسبة التوزيع" value={`${clientMetrics.distributionRate}%`} />
              <Stat title="عملاء تم العمل عليهم" value={clientMetrics.workedClients} />
              <Stat title="عملاء تم تعديل بياناتهم" value={clientMetrics.editedClients} />
            </div>

            <Card title="تفصيل (تم العمل عليهم داخل الفترة)">
              <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <Stat title="متابعات" value={clientMetrics.workedByFollowups} />
                <Stat title="حجوزات" value={clientMetrics.workedByReservations} />
                <Stat title="ملاحظات حجوزات" value={clientMetrics.workedByReservationNotes} />
                <Stat title="مبيعات" value={clientMetrics.workedBySales} />
                <Stat title="زيارات" value={clientMetrics.workedByVisits} />
              </div>
              <p style={{ padding: '0 14px 14px', color: '#666', fontSize: 13 }}>
                “تم العمل عليهم” = عميل ظهر له أي نشاط من (متابعة/حجز/ملاحظة/بيع/زيارة) داخل نفس الفترة.
              </p>
            </Card>

            <Card title="توزيع حالات العملاء">
              <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {Object.entries(clientMetrics.statusCounts).length === 0 ? (
                  <div style={{ color: '#666' }}>لا توجد بيانات</div>
                ) : (
                  Object.entries(clientMetrics.statusCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <div key={k} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
                        <div style={{ color: '#666', fontSize: 12, fontWeight: 800 }}>{translateStatus(k)}</div>
                        <div style={{ fontSize: 20, fontWeight: 900 }}>{v}</div>
                      </div>
                    ))
                )}
              </div>
            </Card>

            <Card title="قائمة العملاء">
              {!showClients ? (
                <div style={{ padding: 18, color: '#666' }}>تم إخفاء القائمة.</div>
              ) : (
                <div style={{ overflowX: 'auto', padding: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
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
                            <tr key={c.id} style={{ borderBottom: '1px solid #e9ecef', backgroundColor: idx % 2 === 0 ? '#fff' : '#fbfbfb' }}>
                              <td style={{ padding: 12, fontWeight: 900 }}>{c.name}</td>
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

                  {filteredClients.length > 500 && <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>تم عرض أول 500 عميل فقط لتقليل الضغط.</div>}
                </div>
              )}
            </Card>
          </>
        )}

        {/* Empty states */}
        {!generating && tab === 'employee_activity' && !activitySummary && (
          <div style={{ textAlign: 'center', padding: 40, backgroundColor: 'white', borderRadius: 12, border: '1px solid #e9ecef', marginTop: 14 }}>
            <div style={{ fontSize: 26, color: '#999', marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, marginBottom: 8, fontWeight: 900 }}>اختر الموظف والفترة ثم اضغط “توليد التقرير”</div>
            <div style={{ color: '#666' }}>سيتم عرض ملخص + تفاصيل الأنشطة + تحليل زمني</div>
          </div>
        )}

        {!generating && tab === 'clients' && !clientMetrics && (
          <div style={{ textAlign: 'center', padding: 40, backgroundColor: 'white', borderRadius: 12, border: '1px solid #e9ecef', marginTop: 14 }}>
            <div style={{ fontSize: 26, color: '#999', marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, marginBottom: 8, fontWeight: 900 }}>اختر الفلاتر ثم اضغط “توليد التقرير”</div>
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
    <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #eee' }}>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 6, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}
