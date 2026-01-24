'use client';

import { useEffect, useState, useMemo } from 'react';
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

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const emp = await getCurrentEmployee();
      setCurrentEmployee(emp);
      
      await fetchAllEmployees();
      setLoading(false);
    } catch (err) {
      console.error('Error in init():', err);
      setLoading(false);
    }
  }

  async function fetchAllEmployees() {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, email, role, phone, department')
        .order('name');
      
      if (error) throw error;
      
      setAllEmployees(data || []);
      
      if (currentEmployee) {
        setSelectedEmployeeId(currentEmployee.id);
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
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

    if (!selectedDate) {
      alert('الرجاء اختيار التاريخ');
      return;
    }

    setGenerating(true);
    setActivities([]);
    setSummary(null);
    setDetailedData(null);

    try {
      const startDate = new Date(selectedDate);
      const endDate = new Date(selectedDate);
      endDate.setDate(endDate.getDate() + 1);
      
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      const employee = allEmployees.find(e => e.id === selectedEmployeeId);
      if (!employee) return;

      const [
        followUps,
        reservations,
        sales,
        clientCreations,
        unitUpdates
      ] = await Promise.all([
        fetchFollowUps(employee.id, startISO, endISO),
        fetchReservations(employee.id, startISO, endISO),
        fetchSales(employee.id, startISO, endISO),
        fetchClientCreations(employee.id, startISO, endISO),
        fetchUnitUpdates(employee.id, startISO, endISO)
      ]);

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
          notes: `عقد ${s.contract_type} - تمويل ${s.finance_type}`
        });
      });

      // إضافة العملاء الجدد
      clientCreations.forEach(c => {
        allActivities.push({
          id: c.id,
          type: 'client_creation',
          action: 'إضافة عميل جديد',
          details: `إضافة العميل ${c.name} (${c.nationality})`,
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

      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setActivities(allActivities);
      setDetailedData({ followUps, reservations, sales, clientCreations, unitUpdates });
      generateSummary(allActivities);
      generateTimeSlots(allActivities);
      extractActivityTypes(allActivities);

    } catch (err) {
      console.error('Error generating report:', err);
      alert('حدث خطأ أثناء توليد التقرير');
    } finally {
      setGenerating(false);
    }
  }

  /* =====================
     Fetch Functions - تم الإصلاح هنا
  ===================== */
  async function fetchFollowUps(employeeId: string, startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('client_followups')
      .select(`
        id,
        type,
        notes,
        created_at,
        client_id,
        duration,
        clients!client_followups_client_id_fkey (
          name,
          status
        )
      `)
      .eq('employee_id', employeeId)
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching followups:', error);
      return [];
    }

    // الإصلاح: معالجة البيانات من Supabase بشكل صحيح
    return (data || []).map((f: any) => {
      // clients قد تكون مصفوفة، نأخذ أول عنصر
      const client = Array.isArray(f.clients) ? f.clients[0] : f.clients;
      
      return {
        ...f,
        client_name: client?.name || 'غير معروف',
        client_status: client?.status || 'غير معروف'
      };
    });
  }

  async function fetchReservations(employeeId: string, startDate: string, endDate: string) {
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
        clients!reservations_client_id_fkey (
          name
        ),
        units!reservations_unit_id_fkey (
          unit_code,
          project_id
        ),
        projects!units_project_id_fkey (
          name
        )
      `)
      .eq('employee_id', employeeId)
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reservations:', error);
      return [];
    }

    return (data || []).map((r: any) => {
      const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      const unit = Array.isArray(r.units) ? r.units[0] : r.units;
      const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
      
      return {
        ...r,
        client_name: client?.name || 'غير معروف',
        unit_code: unit?.unit_code || 'غير معروف',
        project_name: project?.name || 'غير معروف'
      };
    });
  }

  async function fetchSales(employeeId: string, startDate: string, endDate: string) {
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
        clients!sales_client_id_fkey (
          name
        ),
        units!sales_unit_id_fkey (
          unit_code,
          project_id
        ),
        projects!sales_project_id_fkey (
          name
        )
      `)
      .eq('sales_employee_id', employeeId)
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sales:', error);
      return [];
    }

    return (data || []).map((s: any) => {
      const client = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      const unit = Array.isArray(s.units) ? s.units[0] : s.units;
      const project = Array.isArray(s.projects) ? s.projects[0] : s.projects;
      
      return {
        ...s,
        client_name: client?.name || 'غير معروف',
        unit_code: unit?.unit_code || 'غير معروف',
        project_name: project?.name || 'غير معروف'
      };
    });
  }

  async function fetchClientCreations(employeeId: string, startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, nationality, mobile, status, source, created_at, created_by')
      .eq('created_by', employeeId)
      .gte('created_at', startDate)
      .lt('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching client creations:', error);
      return [];
    }

    return data || [];
  }

  async function fetchUnitUpdates(employeeId: string, startDate: string, endDate: string) {
    try {
      // محاولة جلب سجل التحديثات من جدول logs إذا كان موجوداً
      const { data, error } = await supabase
        .from('logs')
        .select('*')
        .eq('employee_id', employeeId)
        .like('action', '%unit%')
        .gte('created_at', startDate)
        .lt('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) {
        return [];
      }

      return (data || []).map((log: any) => ({
        id: log.id,
        unit_id: log.unit_id,
        old_status: log.old_value,
        new_status: log.new_value,
        notes: log.description,
        created_at: log.created_at,
        unit_code: log.unit_code,
        project_name: log.project_name
      }));
    } catch (err) {
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
      const employeeName = allEmployees.find(e => e.id === selectedEmployeeId)?.name.replace(/\s+/g, '_');
      a.download = `تقرير_${employeeName}_${selectedDate}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('تم تصدير التقرير بنجاح');
    } catch (err) {
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
        `"${a.details.replace(/"/g, '""')}"`,
        a.client_name || '',
        a.unit_code || '',
        a.project_name || '',
        a.amount || '',
        new Date(a.timestamp).toLocaleString('ar-SA'),
        a.duration || '',
        a.status || '',
        a.notes ? `"${a.notes.replace(/"/g, '""')}"` : ''
      ].join(','))
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const employeeName = allEmployees.find(e => e.id === selectedEmployeeId)?.name.replace(/\s+/g, '_');
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
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري التحميل...</div>
            <div style={{ color: '#666' }}>يرجى الانتظار</div>
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

        {/* Filter Controls */}
        <Card title="فلترة التقرير">
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '15px',
            padding: '15px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>اختر الموظف</label>
              <select 
                value={selectedEmployeeId} 
                onChange={e => setSelectedEmployeeId(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">اختر الموظف</option>
                {allEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role === 'admin' ? 'مدير' : emp.role === 'sales' ? 'مندوب مبيعات' : 'مدير'})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>اختر التاريخ</label>
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
              <Button 
                onClick={generateReport} 
                disabled={generating || !selectedEmployeeId || !selectedDate}
                style={{ width: '100%' }}
              >
                {generating ? 'جاري التوليد...' : 'توليد التقرير'}
              </Button>
            </div>
          </div>
          
          {/* Quick Date Selection */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            padding: '10px 15px',
            backgroundColor: '#f8f9fa',
            borderTop: '1px solid #eee',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '13px', color: '#666' }}>أيام سريعة:</span>
            {['أمس', 'اليوم', 'أول أمس'].map((label, index) => {
              const date = new Date();
              if (label === 'أمس') date.setDate(date.getDate() - 1);
              if (label === 'أول أمس') date.setDate(date.getDate() - 2);
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
                    cursor: 'pointer'
                  }}
                >
                  {label} ({dateStr})
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
            marginBottom: '20px'
          }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري توليد التقرير...</div>
            <div style={{ color: '#666' }}>قد تستغرق العملية بضع لحظات</div>
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
              gap: '15px'
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

            {/* Time Analysis */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
              gap: '20px',
              marginBottom: '20px'
            }}>
              <Card title="التوزيع الزمني للأنشطة">
                <div style={{ padding: '15px' }}>
                  {timeSlots.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {timeSlots.map(slot => (
                        <div key={slot.hour} style={{ display: 'flex', alignItems: 'center' }}>
                          <div style={{ width: '100px', fontSize: '13px' }}>{slot.hour}</div>
                          <div style={{ flex: 1, marginLeft: '10px' }}>
                            <div style={{ 
                              height: '10px', 
                              backgroundColor: '#eaeaea',
                              borderRadius: '5px',
                              overflow: 'hidden'
                            }}>
                              <div style={{ 
                                width: `${(slot.count / Math.max(...timeSlots.map(s => s.count))) * 100}%`, 
                                height: '100%',
                                backgroundColor: '#1a73e8'
                              }} />
                            </div>
                          </div>
                          <div style={{ width: '40px', textAlign: 'left', fontSize: '13px', fontWeight: 'bold' }}>
                            {slot.count}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                      لا توجد أنشطة في هذا اليوم
                    </div>
                  )}
                </div>
              </Card>

              <Card title="ملخص الأداء">
                <div style={{ padding: '15px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                      <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>ساعة الذروة</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{summary.peakHour}</div>
                    </div>
                    
                    <div>
                      <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>أكثر نشاط تكراراً</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{summary.busiestActivity}</div>
                    </div>
                    
                    <div>
                      <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>تحليل الكفاءة</div>
                      <div style={{ 
                        height: '10px', 
                        backgroundColor: '#eaeaea',
                        borderRadius: '5px',
                        overflow: 'hidden',
                        marginBottom: '5px'
                      }}>
                        <div style={{ 
                          width: `${summary.efficiencyScore}%`, 
                          height: '100%',
                          backgroundColor: 
                            summary.efficiencyScore >= 80 ? '#34a853' : 
                            summary.efficiencyScore >= 60 ? '#fbbc04' : '#ea4335'
                        }} />
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        color: '#666'
                      }}>
                        <span>ضعيف</span>
                        <span>متوسط</span>
                        <span>جيد</span>
                        <span>ممتاز</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Activities Table */}
            <Card title={`الأنشطة التفصيلية (${filteredActivities.length})`}>
              <div style={{ padding: '15px' }}>
                <Table headers={['النشاط', 'التفاصيل', 'العميل', 'الوحدة', 'المشروع', 'المبلغ', 'التاريخ', 'المدة', 'الحالة']}>
                  {filteredActivities.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                        {searchTerm ? 'لم يتم العثور على نتائج' : 'لا توجد أنشطة'}
                      </td>
                    </tr>
                  ) : (
                    filteredActivities.map(activity => (
                      <tr key={`${activity.type}-${activity.id}`}>
                        <td style={{ fontWeight: 'bold' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '12px', 
                              fontSize: '11px',
                              backgroundColor: 
                                activity.type === 'sale' ? '#e6f4ea' :
                                activity.type === 'reservation' ? '#fff8e1' :
                                activity.type === 'client_followup' ? '#e8f0fe' :
                                activity.type === 'client_creation' ? '#f3e5f5' : '#fce8e6',
                              color: 
                                activity.type === 'sale' ? '#0d8a3e' :
                                activity.type === 'reservation' ? '#fbbc04' :
                                activity.type === 'client_followup' ? '#1a73e8' :
                                activity.type === 'client_creation' ? '#8e44ad' : '#ea4335'
                            }}>
                              {activity.type === 'sale' ? 'بيع' :
                               activity.type === 'reservation' ? 'حجز' :
                               activity.type === 'client_followup' ? 'متابعة' :
                               activity.type === 'client_creation' ? 'عميل جديد' : 'تحديث'}
                            </span>
                            <span>{activity.action}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '13px' }}>{activity.details}</div>
                          {activity.notes && (
                            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                              {activity.notes}
                            </div>
                          )}
                        </td>
                        <td>{activity.client_name || '-'}</td>
                        <td>{activity.unit_code || '-'}</td>
                        <td>{activity.project_name || '-'}</td>
                        <td>
                          {activity.amount ? (
                            <span style={{ fontWeight: 'bold', color: '#34a853' }}>
                              {activity.amount.toLocaleString()} ر.س
                            </span>
                          ) : '-'}
                        </td>
                        <td>
                          <div style={{ fontSize: '12px' }}>
                            {new Date(activity.timestamp).toLocaleTimeString('ar-SA', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                          <div style={{ fontSize: '11px', color: '#666' }}>
                            {new Date(activity.timestamp).toLocaleDateString('ar-SA')}
                          </div>
                        </td>
                        <td>{activity.duration || 0} دقيقة</td>
                        <td>
                          <span style={{ 
                            padding: '2px 8px', 
                            borderRadius: '12px', 
                            fontSize: '11px',
                            backgroundColor: activity.status === 'مكتمل' ? '#e6f4ea' : 
                                           activity.status === 'نشط' ? '#fff8e1' : '#fce8e6',
                            color: activity.status === 'مكتمل' ? '#0d8a3e' : 
                                   activity.status === 'نشط' ? '#fbbc04' : '#ea4335'
                          }}>
                            {activity.status || '-'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </Table>
              </div>
            </Card>

            {/* Detailed View (Optional) */}
            {showDetails && detailedData && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                gap: '20px',
                marginBottom: '20px'
              }}>
                <Card title="المتابعات">
                  <div style={{ padding: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                    {detailedData.followUps.map((f, i) => (
                      <div key={i} style={{ 
                        padding: '10px', 
                        marginBottom: '8px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '6px',
                        borderLeft: '3px solid #1a73e8'
                      }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{f.client_name}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{f.notes}</div>
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                          {new Date(f.created_at).toLocaleTimeString()} - {f.type === 'call' ? 'مكالمة' : f.type === 'whatsapp' ? 'واتساب' : 'زيارة'}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title="الحجوزات">
                  <div style={{ padding: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                    {detailedData.reservations.map((r, i) => (
                      <div key={i} style={{ 
                        padding: '10px', 
                        marginBottom: '8px',
                        backgroundColor: '#fff8e1',
                        borderRadius: '6px',
                        borderLeft: '3px solid #fbbc04'
                      }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                          {r.unit_code} - {r.client_name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{r.project_name}</div>
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                          {r.status} - {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title="المبيعات">
                  <div style={{ padding: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                    {detailedData.sales.map((s, i) => (
                      <div key={i} style={{ 
                        padding: '10px', 
                        marginBottom: '8px',
                        backgroundColor: '#e6f4ea',
                        borderRadius: '6px',
                        borderLeft: '3px solid #34a853'
                      }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                          {s.unit_code} - {s.client_name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {s.project_name} - {s.price_before_tax.toLocaleString()} ر.س
                        </div>
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                          {s.contract_type} / {s.finance_type} - {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* Performance Insights */}
            <Card title="تحليل الأداء">
              <div style={{ padding: '20px' }}>
                <div style={{ 
                  backgroundColor: '#f8f9fa', 
                  padding: '15px', 
                  borderRadius: '8px',
                  borderLeft: '4px solid #1a73e8'
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>رؤى وتحليلات</div>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#555' }}>
                    <li style={{ marginBottom: '8px' }}>
                      <strong>إنتاجية اليوم:</strong> {summary.totalActivities} نشاط ({summary.efficiencyScore >= 80 ? 'ممتازة' : summary.efficiencyScore >= 60 ? 'جيدة' : 'تحتاج للتحسين'})
                    </li>
                    <li style={{ marginBottom: '8px' }}>
                      <strong>فاعلية المتابعات:</strong> {summary.conversionRate}% تحول من متابعات إلى مبيعات {summary.conversionRate >= 20 ? '(جيد)' : '(يمكن التحسين)'}
                    </li>
                    <li style={{ marginBottom: '8px' }}>
                      <strong>استغلال الوقت:</strong> {Math.round(summary.totalDuration / 60)} ساعة عمل ({summary.avgActivityDuration} دقيقة/نشاط)
                    </li>
                    <li style={{ marginBottom: '8px' }}>
                      <strong>التنوع:</strong> {summary.followUps > 0 && summary.reservations > 0 && summary.sales > 0 ? 'متنوع' : 'مركز على نوع واحد'}
                    </li>
                    {summary.peakHour === '9:00 - 10:00' || summary.peakHour === '10:00 - 11:00' ? (
                      <li style={{ marginBottom: '8px' }}>
                        <strong>توقيت الذروة:</strong> الصباح الباكر (أفضل وقت للإنتاجية)
                      </li>
                    ) : null}
                  </ul>
                </div>

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginTop: '20px',
                  padding: '15px',
                  backgroundColor: '#e6f4ea',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  <div>
                    <strong>ملاحظة:</strong> تم توليد التقرير في {new Date().toLocaleString('ar-SA')}
                  </div>
                  <div>
                    <strong>التاريخ المحدد:</strong> {selectedDate} ({new Date(selectedDate).toLocaleDateString('ar-SA', { weekday: 'long' })})
                  </div>
                  <div>
                    <strong>الموظف:</strong> {allEmployees.find(e => e.id === selectedEmployeeId)?.name}
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Empty State */}
        {!generating && (!activities.length || !selectedEmployeeId) && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '24px', color: '#999', marginBottom: '20px' }}>📊</div>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>تقرير أنشطة الموظف اليومية</div>
            <div style={{ color: '#666', marginBottom: '20px', maxWidth: '500px', margin: '0 auto' }}>
              اختر موظفاً وتاريخاً ثم انقر على زر "توليد التقرير" لعرض كل الأنشطة التي قام بها الموظف في ذلك اليوم
            </div>
            
            {!selectedEmployeeId && (
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#fff8e1', 
                borderRadius: '6px',
                marginBottom: '20px',
                maxWidth: '400px',
                margin: '0 auto'
              }}>
                <strong>ملاحظة:</strong> اختر موظفاً من القائمة أعلاه
              </div>
            )}
            
            {selectedEmployeeId && !activities.length && (
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
          </div>
        )}

      </div>
    </RequireAuth>
  );
}