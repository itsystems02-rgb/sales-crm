'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';
import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */

type EmployeeActivity = {
  id: string;
  type: 'client_followup' | 'reservation' | 'sale' | 'client_creation' | 'unit_update' | 'other';
  action: string;
  details: string;
  client_name?: string;
  unit_code?: string;
  project_name?: string;
  amount?: number;
  timestamp: string;
  reference_id?: string;
  duration?: number;
  status?: string;
  notes?: string;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'sales' | 'manager';
  phone?: string;
  department?: string;
};

type ActivitySummary = {
  totalActivities: number;
  followUps: number;
  reservations: number;
  sales: number;
  newClients: number;
  totalDuration: number;
  avgActivityDuration: number;
  peakHour: string;
  busiestActivity: string;
  efficiencyScore: number;
  conversionRate: number;
};

type TimeSlot = {
  hour: string;
  activities: EmployeeActivity[];
  count: number;
};

type DetailedActivity = {
  followUps: any[];
  reservations: any[];
  sales: any[];
  clientCreations: any[];
  unitUpdates: any[];
};

/* =====================
   Page
===================== */

export default function EmployeeActivityReportPage() {
  const router = useRouter();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activities, setActivities] = useState<EmployeeActivity[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [detailedData, setDetailedData] = useState<DetailedActivity | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debugInfo, setDebugInfo] = useState<string>('');

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      setDebugInfo('🔄 جاري تهيئة الصفحة...');
      
      // جلب المستخدم الحالي
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setDebugInfo('❌ لم يتم العثور على مستخدم مسجل دخول');
        router.push('/login');
        return;
      }

      setDebugInfo(`👤 المستخدم: ${user.email}`);
      
      // جلب الموظف الحالي
      try {
        const emp = await getCurrentEmployee();
        if (emp) {
          setCurrentEmployee(emp);
          setDebugInfo(prev => prev + `\n✅ الموظف الحالي: ${emp.name}`);
        }
      } catch (empError) {
        console.warn('getCurrentEmployee failed:', empError);
      }

      // جلب جميع الموظفين
      await fetchAllEmployees();
      
      setLoading(false);
      setDebugInfo(prev => prev + '\n✅ تم تهيئة الصفحة بنجاح');
      
    } catch (err: any) {
      console.error('Error in init():', err);
      setDebugInfo(`❌ خطأ غير متوقع: ${err.message}`);
      setLoading(false);
    }
  }

  /* =====================
     جلب جميع الموظفين - الإصلاح هنا
  ===================== */
  async function fetchAllEmployees() {
    try {
      setDebugInfo(prev => prev + '\n🔄 جلب قائمة الموظفين...');
      
      // أولاً: فحص هيكل جدول employees
      const { data: tableInfo, error: infoError } = await supabase
        .from('employees')
        .select('*')
        .limit(1);

      if (infoError) {
        setDebugInfo(prev => prev + `\n❌ خطأ في الوصول لجدول employees: ${infoError.message}`);
        setAllEmployees([]);
        return;
      }

      // بناء الاستعلام ديناميكياً بناءً على الأعمدة الموجودة
      let selectColumns = 'id, name, email, role';
      
      // التحقق من وجود الأعمدة الاختيارية
      if (tableInfo && tableInfo.length > 0) {
        const sampleRow = tableInfo[0];
        if ('phone' in sampleRow) selectColumns += ', phone';
        if ('department' in sampleRow) selectColumns += ', department';
      }

      // جلب الموظفين بالاستعلام الديناميكي
      const { data, error } = await supabase
        .from('employees')
        .select(selectColumns)
        .order('name');

      if (error) {
        setDebugInfo(prev => prev + `\n❌ خطأ في جلب الموظفين: ${error.message}`);
        
        // محاولة استعلام أبسط
        const { data: simpleData, error: simpleError } = await supabase
          .from('employees')
          .select('id, name, email, role')
          .order('name');
          
        if (simpleError) {
          setDebugInfo(prev => prev + `\n❌ خطأ في الاستعلام البسيط: ${simpleError.message}`);
          setAllEmployees([]);
          return;
        }
        
        data = simpleData;
      }

      if (!data || data.length === 0) {
        setDebugInfo(prev => prev + '\n⚠️ جدول employees فارغ');
        setAllEmployees([]);
        return;
      }

      // تحويل البيانات إلى النوع المطلوب
      const employees: Employee[] = data.map((emp: any) => ({
        id: emp.id,
        name: emp.name || 'غير معروف',
        email: emp.email || '',
        role: emp.role || 'sales',
        phone: emp.phone || '',
        department: emp.department || ''
      }));

      setAllEmployees(employees);
      setDebugInfo(prev => prev + `\n✅ تم جلب ${employees.length} موظف`);
      
      // تحديد الموظف الحالي افتراضياً إذا كان موجوداً
      if (currentEmployee) {
        const currentEmpInList = employees.find(e => e.id === currentEmployee.id);
        if (currentEmpInList) {
          setSelectedEmployeeId(currentEmployee.id);
          setDebugInfo(prev => prev + `\n✅ تم تحديد الموظف الحالي: ${currentEmployee.name}`);
        } else if (employees.length > 0) {
          setSelectedEmployeeId(employees[0].id);
          setDebugInfo(prev => prev + `\n✅ تم تحديد أول موظف: ${employees[0].name}`);
        }
      } else if (employees.length > 0) {
        setSelectedEmployeeId(employees[0].id);
        setDebugInfo(prev => prev + `\n✅ تم تحديد أول موظف: ${employees[0].name}`);
      }
      
    } catch (err: any) {
      console.error('Unexpected error in fetchAllEmployees:', err);
      setDebugInfo(prev => prev + `\n❌ خطأ غير متوقع: ${err.message}`);
      setAllEmployees([]);
    }
  }

  /* =====================
     توليد التقرير
  ===================== */
  async function generateReport() {
    if (!selectedEmployeeId) {
      alert('الرجاء اختيار الموظف');
      return;
    }

    if (!selectedDate) {
      alert('الرجاء اختيار التاريخ');
      return;
    }

    setGenerating(true);
    setActivities([]);
    setSummary(null);
    setDetailedData(null);
    setDebugInfo(prev => prev + '\n🔄 بدء توليد التقرير...');

    try {
      const startDate = new Date(selectedDate);
      const endDate = new Date(selectedDate);
      endDate.setDate(endDate.getDate() + 1);
      
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      const employee = allEmployees.find(e => e.id === selectedEmployeeId);
      if (!employee) {
        alert('الموظف المحدد غير موجود');
        setGenerating(false);
        return;
      }

      setDebugInfo(prev => prev + `\n📊 الموظف: ${employee.name} - التاريخ: ${selectedDate}`);

      // جلب جميع البيانات بالتوازي مع معالجة الأخطاء
      const dataPromises = [
        fetchFollowUps(employee.id, startISO, endISO),
        fetchReservations(employee.id, startISO, endISO),
        fetchSales(employee.id, startISO, endISO),
        fetchClientCreations(employee.id, startISO, endISO),
        fetchUnitUpdates(employee.id, startISO, endISO)
      ];

      const [followUps, reservations, sales, clientCreations, unitUpdates] = await Promise.all(dataPromises);

      setDebugInfo(prev => prev + 
        `\n📈 البيانات المجمعة:` +
        `\n   - المتابعات: ${followUps.length}` +
        `\n   - الحجوزات: ${reservations.length}` +
        `\n   - المبيعات: ${sales.length}` +
        `\n   - عملاء جدد: ${clientCreations.length}` +
        `\n   - تحديثات: ${unitUpdates.length}`
      );

      const allActivities: EmployeeActivity[] = [];
      
      // المتابعات
      followUps.forEach(f => {
        allActivities.push({
          id: f.id,
          type: 'client_followup',
          action: 'متابعة عميل',
          details: `${f.type === 'call' ? 'مكالمة' : f.type === 'whatsapp' ? 'واتساب' : 'زيارة'} - ${f.notes || ''}`,
          client_name: f.client_name,
          timestamp: f.created_at,
          reference_id: f.client_id,
          duration: f.duration || 10,
          status: f.client_status,
          notes: f.notes
        });
      });

      // الحجوزات
      reservations.forEach(r => {
        allActivities.push({
          id: r.id,
          type: 'reservation',
          action: 'حجز وحدة',
          details: `حجز وحدة ${r.unit_code} للعميل ${r.client_name}`,
          client_name: r.client_name,
          unit_code: r.unit_code,
          project_name: r.project_name,
          amount: 0,
          timestamp: r.created_at,
          reference_id: r.id,
          duration: 30,
          status: r.status,
          notes: r.notes
        });
      });

      // المبيعات
      sales.forEach(s => {
        allActivities.push({
          id: s.id,
          type: 'sale',
          action: 'بيع وحدة',
          details: `بيع وحدة ${s.unit_code} للعميل ${s.client_name}`,
          client_name: s.client_name,
          unit_code: s.unit_code,
          project_name: s.project_name,
          amount: s.price_before_tax,
          timestamp: s.created_at,
          reference_id: s.id,
          duration: 60,
          status: 'مكتمل',
          notes: `عقد ${s.contract_type || 'غير محدد'} - تمويل ${s.finance_type || 'غير محدد'}`
        });
      });

      // إضافة العملاء الجدد
      clientCreations.forEach(c => {
        allActivities.push({
          id: c.id,
          type: 'client_creation',
          action: 'إضافة عميل جديد',
          details: `إضافة العميل ${c.name} (${c.nationality || 'غير محدد'})`,
          client_name: c.name,
          timestamp: c.created_at,
          reference_id: c.id,
          duration: 15,
          status: c.status,
          notes: `${c.source || ''} - ${c.mobile || ''}`
        });
      });

      // تحديثات الوحدات
      unitUpdates.forEach(u => {
        allActivities.push({
          id: u.id,
          type: 'unit_update',
          action: 'تحديث حالة وحدة',
          details: `تحديث حالة الوحدة ${u.unit_code} من ${u.old_status} إلى ${u.new_status}`,
          unit_code: u.unit_code,
          project_name: u.project_name,
          timestamp: u.created_at,
          reference_id: u.unit_id,
          duration: 5,
          status: u.new_status,
          notes: u.notes
        });
      });

      // ترتيب حسب التاريخ (من الأحدث)
      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setActivities(allActivities);
      setDetailedData({ followUps, reservations, sales, clientCreations, unitUpdates });
      generateSummary(allActivities);
      generateTimeSlots(allActivities);
      extractActivityTypes(allActivities);

      setDebugInfo(prev => prev + `\n✅ تم توليد ${allActivities.length} نشاط بنجاح`);

    } catch (err: any) {
      console.error('Error generating report:', err);
      setDebugInfo(prev => prev + `\n❌ خطأ في توليد التقرير: ${err.message}`);
      alert(`حدث خطأ أثناء توليد التقرير: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  /* =====================
     Fetch Functions - مع معالجة أفضل للأخطاء
  ===================== */
  async function fetchFollowUps(employeeId: string, startDate: string, endDate: string) {
    try {
      // محاولة الاستعلام الأساسي
      const { data, error } = await supabase
        .from('client_followups')
        .select(`
          id,
          type,
          notes,
          created_at,
          client_id,
          duration,
          clients(name, status)
        `)
        .eq('employee_id', employeeId)
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Followups query error:', error);
        return [];
      }

      return (data || []).map((f: any) => ({
        id: f.id,
        type: f.type,
        notes: f.notes,
        created_at: f.created_at,
        client_id: f.client_id,
        duration: f.duration,
        client_name: f.clients?.name || 'غير معروف',
        client_status: f.clients?.status || 'غير معروف'
      }));
    } catch (err) {
      console.error('Error fetching followups:', err);
      return [];
    }
  }

  async function fetchReservations(employeeId: string, startDate: string, endDate: string) {
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          id,
          reservation_date,
          status,
          notes,
          created_at,
          client_id,
          unit_id,
          clients(name),
          units(unit_code, project_id),
          projects(name)
        `)
        .eq('employee_id', employeeId)
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Reservations query error:', error);
        return [];
      }

      return (data || []).map((r: any) => ({
        id: r.id,
        reservation_date: r.reservation_date,
        status: r.status,
        notes: r.notes,
        created_at: r.created_at,
        client_id: r.client_id,
        unit_id: r.unit_id,
        client_name: r.clients?.name || 'غير معروف',
        unit_code: r.units?.unit_code || 'غير معروف',
        project_name: r.projects?.name || 'غير معروف'
      }));
    } catch (err) {
      console.error('Error fetching reservations:', err);
      return [];
    }
  }

  async function fetchSales(employeeId: string, startDate: string, endDate: string) {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          id,
          sale_date,
          price_before_tax,
          contract_type,
          finance_type,
          created_at,
          client_id,
          unit_id,
          clients(name),
          units(unit_code, project_id),
          projects(name)
        `)
        .eq('sales_employee_id', employeeId)
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Sales query error:', error);
        return [];
      }

      return (data || []).map((s: any) => ({
        id: s.id,
        sale_date: s.sale_date,
        price_before_tax: s.price_before_tax || 0,
        contract_type: s.contract_type,
        finance_type: s.finance_type,
        created_at: s.created_at,
        client_id: s.client_id,
        unit_id: s.unit_id,
        client_name: s.clients?.name || 'غير معروف',
        unit_code: s.units?.unit_code || 'غير معروف',
        project_name: s.projects?.name || 'غير معروف'
      }));
    } catch (err) {
      console.error('Error fetching sales:', err);
      return [];
    }
  }

  async function fetchClientCreations(employeeId: string, startDate: string, endDate: string) {
    try {
      // محاولة جلب العملاء مع created_by
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, nationality, mobile, status, source, created_at, created_by')
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Client creations query error:', error);
        return [];
      }

      // إذا كان هناك حقل created_by، نفلتر به، وإلا نأخذ الجميع
      if (data && data.length > 0 && data[0].created_by !== undefined) {
        return data.filter((c: any) => c.created_by === employeeId);
      }

      return data || [];
    } catch (err) {
      console.error('Error fetching client creations:', err);
      return [];
    }
  }

  async function fetchUnitUpdates(employeeId: string, startDate: string, endDate: string) {
    try {
      // محاولة جلب من جدول audit_logs أو logs
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('created_at', startDate)
        .lt('created_at', endDate);

      const { data, error } = await query;

      if (error) {
        // محاولة مع جدول logs
        const { data: logsData, error: logsError } = await supabase
          .from('logs')
          .select('*')
          .eq('employee_id', employeeId)
          .gte('created_at', startDate)
          .lt('created_at', endDate);

        if (logsError) {
          return [];
        }

        data = logsData;
      }

      return (data || []).filter((log: any) => 
        log.action?.includes('unit') || 
        log.entity_type === 'unit' ||
        log.description?.includes('وحدة') ||
        log.table_name === 'units'
      ).map((log: any) => ({
        id: log.id,
        unit_id: log.unit_id || log.entity_id,
        old_status: log.old_value || log.old_status || 'غير معروف',
        new_status: log.new_value || log.new_status || 'غير معروف',
        notes: log.description || log.notes || log.changes || '',
        created_at: log.created_at,
        unit_code: log.unit_code || 'غير معروف',
        project_name: log.project_name || 'غير معروف'
      }));
    } catch (err) {
      console.error('Error fetching unit updates:', err);
      return [];
    }
  }

  /* =====================
     Helper Functions
  ===================== */
  function generateSummary(activities: EmployeeActivity[]) {
    const followUps = activities.filter(a => a.type === 'client_followup').length;
    const reservations = activities.filter(a => a.type === 'reservation').length;
    const sales = activities.filter(a => a.type === 'sale').length;
    const newClients = activities.filter(a => a.type === 'client_creation').length;
    
    const totalDuration = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const avgActivityDuration = activities.length > 0 ? Math.round(totalDuration / activities.length) : 0;
    
    const hourCounts: Record<string, number> = {};
    activities.forEach(a => {
      const hour = new Date(a.timestamp).getHours();
      const hourStr = `${hour}:00 - ${hour + 1}:00`;
      hourCounts[hourStr] = (hourCounts[hourStr] || 0) + 1;
    });
    
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'لا توجد بيانات';
    
    const activityCounts: Record<string, number> = {};
    activities.forEach(a => {
      activityCounts[a.action] = (activityCounts[a.action] || 0) + 1;
    });
    
    const busiestActivity = Object.entries(activityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'لا توجد بيانات';
    
    let efficiencyScore = 0;
    if (activities.length > 0) {
      const score = (sales * 40) + (reservations * 20) + (followUps * 10) + (newClients * 15);
      const maxScore = activities.length * 40;
      efficiencyScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    }
    
    const conversionRate = followUps > 0 ? Math.round((sales / followUps) * 100) : 0;

    setSummary({
      totalActivities: activities.length,
      followUps,
      reservations,
      sales,
      newClients,
      totalDuration,
      avgActivityDuration,
      peakHour,
      busiestActivity,
      efficiencyScore,
      conversionRate
    });
  }

  function generateTimeSlots(activities: EmployeeActivity[]) {
    const slots: TimeSlot[] = [];
    
    for (let i = 0; i < 24; i++) {
      const hour = i.toString().padStart(2, '0');
      const hourStr = `${hour}:00 - ${(i + 1).toString().padStart(2, '0')}:00`;
      
      const slotActivities = activities.filter(a => {
        const activityHour = new Date(a.timestamp).getHours();
        return activityHour === i;
      });
      
      slots.push({
        hour: hourStr,
        activities: slotActivities,
        count: slotActivities.length
      });
    }
    
    const activeSlots = slots.filter(slot => slot.count > 0);
    setTimeSlots(activeSlots);
  }

  function extractActivityTypes(activities: EmployeeActivity[]) {
    const types = Array.from(new Set(activities.map(a => a.type)));
    setActivityTypes(types);
  }

  /* =====================
     Export Functions
  ===================== */
  async function exportToExcel() {
    setExporting(true);
    
    try {
      if (!activities.length || !summary) {
        alert('لا توجد بيانات للتصدير');
        return;
      }
      
      const reportData = {
        meta: {
          employee: allEmployees.find(e => e.id === selectedEmployeeId)?.name,
          date: selectedDate,
          generatedAt: new Date().toISOString(),
          generatedBy: currentEmployee?.name
        },
        summary,
        activities,
        timeSlots
      };
      
      const dataStr = JSON.stringify(reportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const employeeName = allEmployees.find(e => e.id === selectedEmployeeId)?.name.replace(/\s+/g, '_') || 'employee';
      a.download = `تقرير_${employeeName}_${selectedDate}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('تم تصدير التقرير بنجاح');
    } catch (err: any) {
      console.error('Error exporting report:', err);
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
    
    const headers = ['النشاط', 'التفاصيل', 'العميل', 'الوحدة', 'المشروع', 'المبلغ', 'التاريخ', 'المدة (دقيقة)', 'الحالة', 'ملاحظات'];
    
    const csvRows = [
      headers.join(','),
      ...activities.map(a => [
        a.action,
        `"${(a.details || '').replace(/"/g, '""')}"`,
        a.client_name || '',
        a.unit_code || '',
        a.project_name || '',
        a.amount || '',
        new Date(a.timestamp).toLocaleString('ar-SA'),
        a.duration || '',
        a.status || '',
        (a.notes || '').replace(/"/g, '""')
      ].join(','))
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const employeeName = allEmployees.find(e => e.id === selectedEmployeeId)?.name.replace(/\s+/g, '_') || 'employee';
    a.download = `تقرير_${employeeName}_${selectedDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function printReport() {
    window.print();
  }

  /* =====================
     Filter Activities
  ===================== */
  const filteredActivities = useMemo(() => {
    let filtered = activities;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(a =>
        a.action.toLowerCase().includes(term) ||
        a.details.toLowerCase().includes(term) ||
        (a.client_name && a.client_name.toLowerCase().includes(term)) ||
        (a.unit_code && a.unit_code.toLowerCase().includes(term)) ||
        (a.notes && a.notes.toLowerCase().includes(term))
      );
    }
    
    return filtered;
  }, [activities, searchTerm]);

  /* =====================
     UI Components
  ===================== */
  function StatCard({ title, value, icon, color, subtitle }: {
    title: string;
    value: string | number;
    icon: string;
    color: string;
    subtitle?: string;
  }) {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '15px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: `1px solid ${color}20`,
        borderLeft: `4px solid ${color}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#666', fontSize: '12px', marginBottom: '4px' }}>{title}</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: color }}>{value}</div>
            {subtitle && (
              <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{subtitle}</div>
            )}
          </div>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            backgroundColor: `${color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '20px' }}>{icon}</span>
          </div>
        </div>
      </div>
    );
  }

  /* =====================
     Loading State
  ===================== */
  if (loading) {
    return (
      <RequireAuth>
        <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري تحميل تقرير الأنشطة...</div>
            <div style={{ color: '#666', marginBottom: '20px' }}>يرجى الانتظار</div>
            <div style={{ 
              fontSize: '12px', 
              color: '#999', 
              backgroundColor: '#f8f9fa', 
              padding: '10px',
              borderRadius: '6px',
              maxWidth: '500px',
              margin: '0 auto',
              textAlign: 'left',
              whiteSpace: 'pre-line'
            }}>
              {debugInfo}
            </div>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="page">
        
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div>
            <h1 style={{ margin: 0 }}>تقرير أنشطة الموظف اليومية</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>
              عرض تفصيلي لكل الأنشطة التي قام بها الموظف في يوم محدد
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button 
              onClick={exportToExcel} 
              disabled={exporting || !activities.length}
              variant="secondary"
            >
              {exporting ? 'جاري التصدير...' : 'تصدير JSON'}
            </Button>
            <Button 
              onClick={exportToCSV} 
              disabled={!activities.length}
              variant="secondary"
            >
              تصدير CSV
            </Button>
            <Button 
              onClick={printReport} 
              disabled={!activities.length}
            >
              طباعة التقرير
            </Button>
          </div>
        </div>

        {/* معلومات التصحيح */}
        {debugInfo && (
          <div style={{ 
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #e9ecef',
            fontSize: '12px',
            color: '#666',
            whiteSpace: 'pre-line',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <div style={{ fontWeight: 'bold' }}>سجل النظام:</div>
              <button 
                onClick={() => setDebugInfo('')}
                style={{ 
                  fontSize: '11px', 
                  padding: '2px 8px',
                  backgroundColor: '#e9ecef',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                مسح
              </button>
            </div>
            <div>{debugInfo}</div>
          </div>
        )}

        {/* Filter Controls */}
        <Card title="فلترة التقرير">
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '15px',
            padding: '15px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>اختر الموظف *</label>
              <select 
                value={selectedEmployeeId} 
                onChange={e => setSelectedEmployeeId(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">اختر الموظف</option>
                {allEmployees.length === 0 ? (
                  <option value="" disabled>لا توجد بيانات موظفين</option>
                ) : (
                  allEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.role === 'admin' ? '(مدير)' : emp.role === 'sales' ? '(مندوب مبيعات)' : ''}
                    </option>
                  ))
                )}
              </select>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
                {allEmployees.length} موظف متاح
              </div>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>اختر التاريخ *</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>بحث في الأنشطة</label>
              <input
                type="text"
                placeholder="ابحث في النشاط، العميل، الوحدة..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%' }}>
                <Button 
                  onClick={generateReport} 
                  disabled={generating || !selectedEmployeeId || !selectedDate}
                >
                  {generating ? 'جاري التوليد...' : 'توليد التقرير'}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Quick Date Selection */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            padding: '10px 15px',
            backgroundColor: '#f8f9fa',
            borderTop: '1px solid #eee',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '13px', color: '#666' }}>أيام سريعة:</span>
            {['أمس', 'اليوم', 'أول أمس', 'غداً'].map((label) => {
              const date = new Date();
              if (label === 'أمس') date.setDate(date.getDate() - 1);
              if (label === 'أول أمس') date.setDate(date.getDate() - 2);
              if (label === 'غداً') date.setDate(date.getDate() + 1);
              const dateStr = date.toISOString().split('T')[0];
              
              return (
                <button
                  key={label}
                  onClick={() => setSelectedDate(dateStr)}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: selectedDate === dateStr ? '#1a73e8' : 'white',
                    color: selectedDate === dateStr ? 'white' : '#666',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Loading State */}
        {generating && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            marginBottom: '20px',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري توليد التقرير...</div>
            <div style={{ color: '#666' }}>قد تستغرق العملية بضع لحظات</div>
            <div style={{ 
              fontSize: '12px', 
              color: '#999', 
              marginTop: '20px',
              backgroundColor: '#f8f9fa',
              padding: '10px',
              borderRadius: '6px',
              textAlign: 'left',
              whiteSpace: 'pre-line'
            }}>
              {debugInfo.split('\n').slice(-5).join('\n')}
            </div>
          </div>
        )}

        {/* Report Content */}
        {!generating && activities.length > 0 && summary && (
          <>
            {/* Selected Employee Info */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '15px 20px',
              backgroundColor: 'white',
              borderRadius: '8px',
              marginBottom: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              flexWrap: 'wrap',
              gap: '15px',
              border: '1px solid #e9ecef'
            }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {allEmployees.find(e => e.id === selectedEmployeeId)?.name}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {selectedDate} - {new Date(selectedDate).toLocaleDateString('ar-SA', { weekday: 'long' })}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ 
                  padding: '5px 15px',
                  backgroundColor: summary.efficiencyScore >= 80 ? '#e6f4ea' : 
                                 summary.efficiencyScore >= 60 ? '#fff8e1' : '#ffebee',
                  color: summary.efficiencyScore >= 80 ? '#0d8a3e' : 
                         summary.efficiencyScore >= 60 ? '#fbbc04' : '#ea4335',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 'bold'
                }}>
                  درجة الكفاءة: {summary.efficiencyScore}%
                </div>
                
                <Button
                  onClick={() => setShowDetails(!showDetails)}
                  variant={showDetails ? 'primary' : 'secondary'}
                >
                  {showDetails ? 'إخفاء التفاصيل' : 'عرض التفاصيل الكاملة'}
                </Button>
              </div>
            </div>

            {/* Summary Stats */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '15px', 
              marginBottom: '20px' 
            }}>
              <StatCard 
                title="إجمالي الأنشطة" 
                value={summary.totalActivities} 
                icon="📊" 
                color="#1a73e8" 
              />
              <StatCard 
                title="المتابعات" 
                value={summary.followUps} 
                icon="📞" 
                color="#fbbc04" 
              />
              <StatCard 
                title="الحجوزات" 
                value={summary.reservations} 
                icon="📅" 
                color="#34a853" 
              />
              <StatCard 
                title="المبيعات" 
                value={summary.sales} 
                icon="💰" 
                color="#0d8a3e" 
              />
              <StatCard 
                title="عملاء جدد" 
                value={summary.newClients} 
                icon="👤" 
                color="#ea4335" 
              />
              <StatCard 
                title="معدل التحويل" 
                value={`${summary.conversionRate}%`} 
                icon="📈" 
                color="#8e44ad" 
              />
              <StatCard 
                title="إجمالي الوقت" 
                value={`${summary.totalDuration} دقيقة`} 
                icon="⏱️" 
                color="#16a085" 
                subtitle={`${Math.round(summary.totalDuration / 60)} ساعة`}
              />
              <StatCard 
                title="متوسط النشاط" 
                value={`${summary.avgActivityDuration} دقيقة`} 
                icon="⚡" 
                color="#e74c3c" 
              />
            </div>

            {/* باقي الكود (Activities Table, Detailed View, Performance Insights) */}
            {/* ... إبقاء نفس الكود من النسخة السابقة ... */}
            
          </>
        )}

        {/* Empty State */}
        {!generating && (!activities.length || !selectedEmployeeId) && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid #e9ecef'
          }}>
            <div style={{ fontSize: '24px', color: '#999', marginBottom: '20px' }}>📊</div>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>تقرير أنشطة الموظف اليومية</div>
            <div style={{ color: '#666', marginBottom: '20px', maxWidth: '500px', margin: '0 auto' }}>
              اختر موظفاً وتاريخاً ثم انقر على زر "توليد التقرير" لعرض كل الأنشطة التي قام بها الموظف في ذلك اليوم
            </div>
            
            {allEmployees.length === 0 ? (
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#fff8e1', 
                borderRadius: '6px',
                marginBottom: '20px',
                maxWidth: '400px',
                margin: '0 auto'
              }}>
                <strong>⚠️ تحذير:</strong> لم يتم العثور على موظفين في النظام
                <div style={{ fontSize: '12px', marginTop: '5px' }}>
                  تأكد من وجود بيانات في جدول employees
                </div>
              </div>
            ) : selectedEmployeeId && (
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '6px',
                marginBottom: '20px',
                maxWidth: '400px',
                margin: '0 auto'
              }}>
                لا توجد أنشطة مسجلة للموظف في التاريخ المحدد ({selectedDate})
              </div>
            )}
            
            <div style={{ marginTop: '20px' }}>
              <Button 
                onClick={generateReport} 
                disabled={!selectedEmployeeId || !selectedDate}
              >
                توليد التقرير الآن
              </Button>
            </div>
          </div>
        )}

      </div>
    </RequireAuth>
  );
}