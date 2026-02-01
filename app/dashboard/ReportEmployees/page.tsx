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

type Employee = {
  id: string;
  name: string;
  email?: string;
  role: 'admin' | 'sales' | 'sales_manager' | 'manager' | string;
  mobile?: string;
  job_title?: string;
  status?: string;
};

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

  duration?: number; // minutes (estimation)
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
  last_follow_up_at?: string | null; // date
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

function safeText(v: any) {
  return (v ?? '').toString();
}

// بعض علاقات supabase بتطلع Array بدل Object
function relOne<T>(rel: any): T | undefined {
  if (!rel) return undefined;
  return Array.isArray(rel) ? rel[0] : rel;
}

/**
 * ✅ Pagination helper
 * مهم: queryFactory ممكن يرجع PostgrestFilterBuilder (thenable) أو Promise
 * عشان كده بنستقبل any ونعمل await جواه
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
    await new Promise((r) => setTimeout(r, 80));
  }

  return all;
}

/* =====================
   Page
===================== */

export default function EmployeeActivityReportPage() {
  const router = useRouter();

  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);

  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  const todayStr = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: todayStr,
    end: todayStr,
  });

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [activities, setActivities] = useState<EmployeeActivity[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [detailedData, setDetailedData] = useState<DetailedActivity | null>(null);

  const [showDetails, setShowDetails] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<EmployeeActivityType | 'all'>('all');

  const [debugInfo, setDebugInfo] = useState<string>('');

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      setDebugInfo('🔄 جاري تهيئة الصفحة...');

      const emp = await getCurrentEmployee();
      if (!emp) {
        router.push('/login');
        return;
      }

      // ✅ Admin only
      if (emp.role !== 'admin') {
        alert('غير مصرح لك بالوصول إلى تقارير الموظفين');
        router.push('/dashboard');
        return;
      }

      setCurrentEmployee(emp);
      setDebugInfo((p) => p + `\n✅ Admin: ${emp.name}`);

      await fetchAllEmployees();

      setLoading(false);
      setDebugInfo((p) => p + '\n✅ تم تهيئة الصفحة بنجاح');
    } catch (err: any) {
      console.error('Error in init():', err);
      setDebugInfo(`❌ خطأ غير متوقع: ${err?.message || err}`);
      setLoading(false);
    }
  }

  /* =====================
     Fetch all employees
  ===================== */
  async function fetchAllEmployees() {
    try {
      setDebugInfo((p) => p + '\n🔄 جلب قائمة الموظفين...');

      const { data, error } = await supabase
        .from('employees')
        .select('id, name, email, role, mobile, job_title, status')
        .order('name', { ascending: true });

      if (error) {
        console.error('Employees fetch error:', error);
        setAllEmployees([]);
        return;
      }

      const employees: Employee[] =
        (data || []).map((e: any) => ({
          id: e.id,
          name: e.name || 'غير معروف',
          email: e.email || '',
          role: e.role || 'sales',
          mobile: e.mobile || '',
          job_title: e.job_title || '',
          status: e.status || '',
        })) || [];

      setAllEmployees(employees);
      setDebugInfo((p) => p + `\n✅ تم جلب ${employees.length} موظف`);

      if (employees.length > 0) {
        setSelectedEmployeeId((prev) => prev || employees[0].id);
      }
    } catch (err: any) {
      console.error('fetchAllEmployees error:', err);
      setAllEmployees([]);
    }
  }

  /* =====================
     Generate Report
  ===================== */
  async function generateReport() {
    if (!selectedEmployeeId) {
      alert('الرجاء اختيار الموظف');
      return;
    }
    if (!dateRange.start || !dateRange.end) {
      alert('الرجاء اختيار الفترة (من / إلى)');
      return;
    }
    if (dateRange.start > dateRange.end) {
      alert('تأكد أن تاريخ "من" أقل أو يساوي تاريخ "إلى"');
      return;
    }

    setGenerating(true);
    setActivities([]);
    setSummary(null);
    setTimeSlots([]);
    setDetailedData(null);

    const { startISO, endISOExclusive } = buildIsoRange(dateRange.start, dateRange.end);

    const emp = allEmployees.find((e) => e.id === selectedEmployeeId);
    setDebugInfo(
      `🔄 توليد التقرير...\n👤 الموظف: ${emp?.name || selectedEmployeeId}\n🗓️ الفترة: ${dateRange.start} → ${dateRange.end}\n⏱️ حدود الاستعلام:\n- gte: ${startISO}\n- lt: ${endISOExclusive}`
    );

    try {
      const [followUps, reservations, sales, visits, reservationNotes] = await Promise.all([
        fetchFollowUps(selectedEmployeeId, startISO, endISOExclusive),
        fetchReservations(selectedEmployeeId, startISO, endISOExclusive, dateRange.start, dateRange.end),
        fetchSales(selectedEmployeeId, startISO, endISOExclusive),
        fetchVisits(selectedEmployeeId, startISO, endISOExclusive),
        fetchReservationNotes(selectedEmployeeId, startISO, endISOExclusive),
      ]);

      setDebugInfo((p) => {
        return (
          p +
          `\n\n📦 نتائج الجلب:` +
          `\n- FollowUps: ${followUps.length}` +
          `\n- Reservations: ${reservations.length}` +
          `\n- Sales: ${sales.length}` +
          `\n- Visits: ${visits.length}` +
          `\n- Reservation Notes: ${reservationNotes.length}`
        );
      });

      const allActivities: EmployeeActivity[] = [];

      // FollowUps
      for (const f of followUps) {
        allActivities.push({
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

      // Reservations + Reservation FollowUps
      for (const r of reservations) {
        allActivities.push({
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

        // ✅ متابعة الحجز (لو الموظف متابع الحجز وفيه last_follow_up_at)
        if (r.follow_employee_id === selectedEmployeeId && r.last_follow_up_at) {
          const followupTs = new Date(`${r.last_follow_up_at}T12:00:00.000`).toISOString();
          allActivities.push({
            id: `${r.id}-followup-${r.last_follow_up_at}`,
            type: 'reservation_followup',
            action: 'متابعة حجز',
            details: r.follow_up_details
              ? `متابعة على الحجز (${r.unit_code}) - ${r.follow_up_details}`
              : `متابعة على الحجز (${r.unit_code})`,
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
        allActivities.push({
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

        allActivities.push({
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

      // Reservation Notes
      for (const n of reservationNotes) {
        allActivities.push({
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

      // Sort desc
      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setActivities(allActivities);
      setDetailedData({ followUps, reservations, sales, visits, reservationNotes });

      generateSummary(allActivities);
      generateTimeSlots(allActivities);

      setDebugInfo((p) => p + `\n\n✅ تم توليد ${allActivities.length} نشاط`);
    } catch (err: any) {
      console.error('generateReport error:', err);
      alert(`حدث خطأ أثناء توليد التقرير: ${err?.message || err}`);
      setDebugInfo((p) => p + `\n❌ خطأ: ${err?.message || err}`);
    } finally {
      setGenerating(false);
    }
  }

  /* =====================
     Fetchers
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

    return rows.map((f) => {
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

    return merged.map((r) => {
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

    return rows.map((s) => {
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

    return rows.map((v) => {
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

    return rows.map((n) => {
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

  /* =====================
     Summary helpers
  ===================== */

  function generateSummary(list: EmployeeActivity[]) {
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

    // Efficiency score (موزون حسب CRM عندك)
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

    setSummary({
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
      if (slotActivities.length > 0) {
        slots.push({ hour: hourStr, activities: slotActivities, count: slotActivities.length });
      }
    }
    setTimeSlots(slots);
  }

  /* =====================
     Export
  ===================== */

  async function exportToJSON() {
    setExporting(true);
    try {
      if (!activities.length || !summary) {
        alert('لا توجد بيانات للتصدير');
        return;
      }

      const reportData = {
        meta: {
          employee: allEmployees.find((e) => e.id === selectedEmployeeId)?.name,
          dateRange,
          generatedAt: new Date().toISOString(),
          generatedBy: currentEmployee?.name,
        },
        summary,
        activities,
        timeSlots,
      };

      const dataStr = JSON.stringify(reportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;

      const employeeName =
        allEmployees.find((e) => e.id === selectedEmployeeId)?.name?.replace(/\s+/g, '_') || 'employee';
      a.download = `تقرير_انشطة_${employeeName}_${dateRange.start}_الى_${dateRange.end}.json`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('تم تصدير التقرير بنجاح');
    } catch (err: any) {
      console.error('exportToJSON error:', err);
      alert('حدث خطأ أثناء التصدير');
    } finally {
      setExporting(false);
    }
  }

  function exportToCSV() {
    if (!activities.length) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    const headers = [
      'النوع',
      'النشاط',
      'التفاصيل',
      'العميل',
      'كود الوحدة',
      'المشروع',
      'المبلغ',
      'التاريخ',
      'المدة (دقيقة)',
      'الحالة',
      'ملاحظات',
    ];

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

    const employeeName =
      allEmployees.find((e) => e.id === selectedEmployeeId)?.name?.replace(/\s+/g, '_') || 'employee';
    a.download = `تقرير_انشطة_${employeeName}_${dateRange.start}_الى_${dateRange.end}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function printReport() {
    window.print();
  }

  /* =====================
     Filtering
  ===================== */

  const filteredActivities = useMemo(() => {
    let list = activities;

    if (typeFilter !== 'all') {
      list = list.filter((a) => a.type === typeFilter);
    }

    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
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
  }, [activities, searchTerm, typeFilter]);

  /* =====================
     UI components
  ===================== */

  function StatCard({
    title,
    value,
    icon,
    color,
    subtitle,
  }: {
    title: string;
    value: string | number;
    icon: string;
    color: string;
    subtitle?: string;
  }) {
    return (
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '15px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          border: `1px solid ${color}20`,
          borderLeft: `4px solid ${color}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#666', fontSize: '12px', marginBottom: '4px' }}>{title}</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color }}>{value}</div>
            {subtitle && <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{subtitle}</div>}
          </div>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: `${color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '20px' }}>{icon}</span>
          </div>
        </div>
      </div>
    );
  }

  /* =====================
     Loading
  ===================== */

  if (loading) {
    return (
      <RequireAuth>
        <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <div style={{ textAlign: 'center', maxWidth: 700 }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري تحميل تقرير أنشطة الموظفين...</div>
            <div style={{ color: '#666', marginBottom: '20px' }}>يرجى الانتظار</div>

            {debugInfo && (
              <div
                style={{
                  fontSize: '12px',
                  color: '#666',
                  backgroundColor: '#f8f9fa',
                  padding: '10px',
                  borderRadius: '6px',
                  textAlign: 'left',
                  whiteSpace: 'pre-line',
                  border: '1px solid #eee',
                }}
              >
                {debugInfo}
              </div>
            )}
          </div>
        </div>
      </RequireAuth>
    );
  }

  const selectedEmp = allEmployees.find((e) => e.id === selectedEmployeeId);

  return (
    <RequireAuth>
      <div className="page">
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '15px',
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>تقرير أنشطة الموظف</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>Admin فقط — أنشطة الموظف خلال فترة محددة</p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button onClick={exportToJSON} disabled={exporting || !activities.length} variant="secondary">
              {exporting ? 'جاري التصدير...' : 'تصدير JSON'}
            </Button>
            <Button onClick={exportToCSV} disabled={!activities.length} variant="secondary">
              تصدير CSV
            </Button>
            <Button onClick={printReport} disabled={!activities.length}>
              طباعة
            </Button>
          </div>
        </div>

        {/* Debug */}
        {debugInfo && (
          <div
            style={{
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e9ecef',
              fontSize: '12px',
              color: '#666',
              whiteSpace: 'pre-line',
              maxHeight: '220px',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 'bold' }}>سجل النظام</div>
              <button
                onClick={() => setDebugInfo('')}
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  backgroundColor: '#e9ecef',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                مسح
              </button>
            </div>
            {debugInfo}
          </div>
        )}

        {/* Filters */}
        <Card title="فلترة التقرير">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '15px',
              padding: '15px',
            }}
          >
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>اختر الموظف *</label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                {allEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.role === 'admin' ? '(مدير)' : emp.role === 'sales' ? '(مبيعات)' : ''}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>{allEmployees.length} موظف</div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>من تاريخ *</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>إلى تاريخ *</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>نوع النشاط</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="all">الكل</option>
                <option value="client_followup">متابعات</option>
                <option value="reservation">حجوزات</option>
                <option value="reservation_followup">متابعات الحجوزات</option>
                <option value="reservation_note">ملاحظات الحجوزات</option>
                <option value="sale">مبيعات</option>
                <option value="visit">زيارات</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>بحث</label>
              <input
                type="text"
                placeholder="ابحث في النشاط، العميل، الوحدة..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%' }}>
                <Button onClick={generateReport} disabled={generating || !selectedEmployeeId || !dateRange.start || !dateRange.end}>
                  {generating ? 'جاري التوليد...' : 'توليد التقرير'}
                </Button>
              </div>
            </div>
          </div>

          {/* Quick ranges */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              padding: '10px 15px',
              backgroundColor: '#f8f9fa',
              borderTop: '1px solid #eee',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '13px', color: '#666' }}>فترات سريعة:</span>

            {[
              { label: 'اليوم', days: 0 },
              { label: 'أمس', days: 1 },
              { label: 'آخر 7 أيام', days: 7 },
              { label: 'آخر 30 يوم', days: 30 },
            ].map((x) => {
              const now = new Date();
              const end = new Date(now);
              const start = new Date(now);

              if (x.label === 'أمس') {
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
              } else if (x.label.startsWith('آخر')) {
                start.setDate(start.getDate() - (x.days - 1));
              }

              const startStr = start.toISOString().split('T')[0];
              const endStr = end.toISOString().split('T')[0];

              return (
                <button
                  key={x.label}
                  onClick={() => setDateRange({ start: startStr, end: endStr })}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: 'white',
                    color: '#666',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {x.label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Generating */}
        {generating && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              backgroundColor: 'white',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid #e9ecef',
              marginTop: 20,
            }}
          >
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري توليد التقرير...</div>
            <div style={{ color: '#666' }}>قد تستغرق العملية بضع لحظات</div>
          </div>
        )}

        {/* Content */}
        {!generating && activities.length > 0 && summary && (
          <>
            {/* Selected info */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '15px 20px',
                backgroundColor: 'white',
                borderRadius: '8px',
                marginBottom: '20px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                flexWrap: 'wrap',
                gap: '15px',
                border: '1px solid #e9ecef',
                marginTop: 20,
              }}
            >
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{selectedEmp?.name}</div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  الفترة: {dateRange.start} → {dateRange.end}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div
                  style={{
                    padding: '5px 15px',
                    backgroundColor:
                      summary.efficiencyScore >= 80 ? '#e6f4ea' : summary.efficiencyScore >= 60 ? '#fff8e1' : '#ffebee',
                    color: summary.efficiencyScore >= 80 ? '#0d8a3e' : summary.efficiencyScore >= 60 ? '#fbbc04' : '#ea4335',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                  }}
                >
                  درجة الكفاءة: {summary.efficiencyScore}%
                </div>

                <Button onClick={() => setShowDetails(!showDetails)} variant={showDetails ? 'primary' : 'secondary'}>
                  {showDetails ? 'إخفاء التفاصيل' : 'عرض التفاصيل الكاملة'}
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <StatCard title="إجمالي الأنشطة" value={summary.totalActivities} icon="📊" color="#1a73e8" />
              <StatCard title="متابعات" value={summary.followUps} icon="📞" color="#fbbc04" />
              <StatCard title="حجوزات" value={summary.reservations} icon="📅" color="#34a853" />
              <StatCard title="متابعات حجوزات" value={summary.reservationFollowUps} icon="🔁" color="#6c5ce7" />
              <StatCard title="ملاحظات حجوزات" value={summary.reservationNotes} icon="📝" color="#00b894" />
              <StatCard title="مبيعات" value={summary.sales} icon="💰" color="#0d8a3e" />
              <StatCard title="زيارات" value={summary.visits} icon="🚗" color="#16a085" />
              <StatCard title="معدل التحويل" value={`${summary.conversionRate}%`} icon="📈" color="#8e44ad" />
              <StatCard title="عملاء تم التعامل معهم" value={summary.uniqueClientsTouched} icon="👥" color="#e17055" subtitle="Distinct clients" />
              <StatCard title="إجمالي الوقت" value={`${summary.totalDuration} دقيقة`} icon="⏱️" color="#2d3436" subtitle={`${Math.round(summary.totalDuration / 60)} ساعة`} />
              <StatCard title="متوسط النشاط" value={`${summary.avgActivityDuration} دقيقة`} icon="⚡" color="#d63031" />
            </div>

            {/* Table */}
            <Card title="تفاصيل الأنشطة">
              {filteredActivities.length > 0 ? (
                <div className="table-container" style={{ overflowX: 'auto', padding: 15 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #e9ecef' }}>
                        <th style={{ padding: '12px', textAlign: 'right' }}>النوع</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>النشاط</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>التفاصيل</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>العميل</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>الوحدة</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>الوقت</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>المدة</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>الحالة</th>
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
                            backgroundColor: idx % 2 === 0 ? '#fff' : '#f8f9fa',
                          }}
                        >
                          <td style={{ padding: '12px', textAlign: 'right' }}>{a.type}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{a.action}</td>
                          <td style={{ padding: '12px', textAlign: 'right', maxWidth: 380, wordWrap: 'break-word' }}>{a.details}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{a.client_name || '-'}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{a.unit_code || '-'}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {new Date(a.timestamp).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{a.duration || 0} د</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>{a.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>لا توجد بيانات حسب الفلاتر الحالية</div>
              )}
            </Card>

            {/* Details */}
            {showDetails && detailedData && (
              <div style={{ marginTop: 20 }}>
                <Card title="التفاصيل الكاملة (Raw Data)">
                  <div style={{ padding: 15, display: 'grid', gap: 16 }}>
                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>FollowUps ({detailedData.followUps.length})</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
                        {JSON.stringify(detailedData.followUps, null, 2)}
                      </pre>
                    </details>

                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Reservations ({detailedData.reservations.length})</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
                        {JSON.stringify(detailedData.reservations, null, 2)}
                      </pre>
                    </details>

                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Reservation Notes ({detailedData.reservationNotes.length})</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
                        {JSON.stringify(detailedData.reservationNotes, null, 2)}
                      </pre>
                    </details>

                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Sales ({detailedData.sales.length})</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
                        {JSON.stringify(detailedData.sales, null, 2)}
                      </pre>
                    </details>

                    <details>
                      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Visits ({detailedData.visits.length})</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', background: '#f8f9fa', padding: 10, borderRadius: 6, overflowX: 'auto' }}>
                        {JSON.stringify(detailedData.visits, null, 2)}
                      </pre>
                    </details>
                  </div>
                </Card>
              </div>
            )}

            {/* Time slots */}
            <div style={{ marginTop: 20 }}>
              <Card title="التحليل الزمني (حسب الساعة)">
                <div style={{ padding: 15 }}>
                  {timeSlots.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {timeSlots.map((slot) => (
                        <div key={slot.hour} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 140, fontSize: 13 }}>{slot.hour}</div>
                          <div style={{ flex: 1, height: 18, backgroundColor: '#e9ecef', borderRadius: 4, overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                backgroundColor: '#1a73e8',
                                width: `${Math.min((slot.count / Math.max(...timeSlots.map((s) => s.count))) * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <div style={{ width: 40, textAlign: 'right', fontWeight: 'bold' }}>{slot.count}</div>
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

        {/* Empty */}
        {!generating && activities.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              border: '1px solid #e9ecef',
              marginTop: 20,
            }}
          >
            <div style={{ fontSize: '24px', color: '#999', marginBottom: '20px' }}>📊</div>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>لا توجد أنشطة في الفترة المحددة</div>
            <div style={{ color: '#666', marginBottom: '20px' }}>
              الموظف: <b>{selectedEmp?.name}</b> — الفترة: <b>{dateRange.start}</b> إلى <b>{dateRange.end}</b>
            </div>
            <Button onClick={generateReport}>توليد التقرير</Button>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
