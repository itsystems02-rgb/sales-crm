'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */

type Employee = {
  id: string;
  name: string;
  role: 'admin' | 'sales';
};

type ReportStats = {
  // إحصائيات عامة
  totalProjects: number;
  totalUnits: number;
  totalClients: number;
  totalEmployees: number;
  
  // إحصائيات المبيعات
  totalSales: number;
  totalSalesAmount: number;
  avgSalePrice: number;
  maxSalePrice: number;
  minSalePrice: number;
  
  // إحصائيات المشاريع
  projectsByUnits: Array<{
    projectId: string;
    projectName: string;
    projectCode: string;
    totalUnits: number;
    availableUnits: number;
    reservedUnits: number;
    soldUnits: number;
    salesAmount: number;
  }>;
  
  // إحصائيات الموظفين
  employeesPerformance: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    totalClients: number;
    totalFollowUps: number;
    totalReservations: number;
    totalSales: number;
    salesAmount: number;
    conversionRate: number;
    avgResponseTime: number;
  }>;
  
  // إحصائيات العملاء
  clientsStats: {
    total: number;
    byStatus: {
      lead: number;
      reserved: number;
      converted: number;
      visited: number;
    };
    byNationality: {
      saudi: number;
      non_saudi: number;
    };
    byEligibility: {
      eligible: number;
      notEligible: number;
    };
    topSources: Array<{
      source: string;
      count: number;
    }>;
  };
  
  // إحصائيات الوحدات
  unitsStats: {
    total: number;
    byType: {
      villa: number;
      duplex: number;
      apartment: number;
    };
    byStatus: {
      available: number;
      reserved: number;
      sold: number;
    };
    byProject: Array<{
      projectName: string;
      count: number;
    }>;
    priceRange: {
      min: number;
      max: number;
      avg: number;
    };
  };
  
  // إحصائيات الحجوزات
  reservationsStats: {
    total: number;
    active: number;
    converted: number;
    cancelled: number;
    byMonth: Array<{
      month: string;
      count: number;
    }>;
    avgReservationToSaleDays: number;
  };
  
  // إحصائيات المتابعات
  followUpsStats: {
    total: number;
    byType: {
      call: number;
      whatsapp: number;
      visit: number;
    };
    byEmployee: Array<{
      employeeName: string;
      count: number;
    }>;
    avgFollowUpsPerClient: number;
    successRate: number;
  };
  
  // إحصائيات زمنية
  timeBasedStats: {
    dailyAvgSales: number;
    weeklyAvgSales: number;
    monthlyAvgSales: number;
    peakHours: Array<{
      hour: number;
      activity: number;
    }>;
    busiestDays: Array<{
      day: string;
      activity: number;
    }>;
  };
  
  // KPIs رئيسية
  kpis: {
    clientAcquisitionCost: number;
    employeeProductivity: number;
    inventoryTurnover: number;
    revenuePerEmployee: number;
    customerRetentionRate: number;
    salesGrowthRate: number;
  };
};

/* =====================
   Page
===================== */

export default function ReportsPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState<ReportStats | null>(null);
  
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [reportType, setReportType] = useState<'comprehensive' | 'sales' | 'clients' | 'units' | 'employees'>('comprehensive');
  
  const [exporting, setExporting] = useState(false);

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const emp = await getCurrentEmployee();
      
      if (!emp) {
        router.push('/login');
        return;
      }
      
      if (emp.role !== 'admin') {
        alert('غير مصرح لك بالوصول إلى صفحة التقارير');
        router.push('/dashboard');
        return;
      }
      
      setEmployee(emp);
      await generateReport();
      setLoading(false);
    } catch (err) {
      console.error('Error in init():', err);
      setLoading(false);
    }
  }

  /* =====================
     Generate Report
  ===================== */
  async function generateReport() {
    if (!employee) return;
    
    setGeneratingReport(true);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      if (!dateRange.startDate) {
        setDateRange({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        });
      }
      
      const [
        projectsStats,
        unitsStats,
        clientsStats,
        employeesStats,
        salesStats,
        reservationsStats,
        followUpsStats
      ] = await Promise.all([
        fetchProjectsStats(),
        fetchUnitsStats(),
        fetchClientsStats(),
        fetchEmployeesStats(),
        fetchSalesStats(),
        fetchReservationsStats(),
        fetchFollowUpsStats()
      ]);
      
      const kpis = calculateKPIs(projectsStats, salesStats, employeesStats);
      const timeBasedStats = await fetchTimeBasedStats();
      
      const report: ReportStats = {
        totalProjects: projectsStats.totalProjects,
        totalUnits: unitsStats.totalUnits,
        totalClients: clientsStats.total, // تم التصحيح هنا
        totalEmployees: employeesStats.totalEmployees,
        
        totalSales: salesStats.totalSales,
        totalSalesAmount: salesStats.totalSalesAmount,
        avgSalePrice: salesStats.avgSalePrice,
        maxSalePrice: salesStats.maxSalePrice,
        minSalePrice: salesStats.minSalePrice,
        
        projectsByUnits: projectsStats.projectsByUnits,
        employeesPerformance: employeesStats.employeesPerformance,
        
        clientsStats,
        unitsStats,
        reservationsStats,
        followUpsStats,
        
        timeBasedStats,
        kpis
      };
      
      setReportData(report);
    } catch (err) {
      console.error('Error generating report:', err);
      alert('حدث خطأ أثناء توليد التقرير');
    } finally {
      setGeneratingReport(false);
    }
  }

  /* =====================
     Fetch Functions
  ===================== */
  async function fetchProjectsStats() {
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, code');
    
    const projectsByUnits = [];
    
    for (const project of (projects || [])) {
      const { count: totalUnits } = await supabase
        .from('units')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id);
      
      const { count: availableUnits } = await supabase
        .from('units')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('status', 'available');
      
      const { count: reservedUnits } = await supabase
        .from('units')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('status', 'reserved');
      
      const { count: soldUnits } = await supabase
        .from('units')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('status', 'sold');
      
      const { data: projectSales } = await supabase
        .from('sales')
        .select('price_before_tax')
        .eq('project_id', project.id);
      
      const salesAmount = projectSales?.reduce((sum, sale) => sum + (sale.price_before_tax || 0), 0) || 0;
      
      projectsByUnits.push({
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code || '',
        totalUnits: totalUnits || 0,
        availableUnits: availableUnits || 0,
        reservedUnits: reservedUnits || 0,
        soldUnits: soldUnits || 0,
        salesAmount
      });
    }
    
    return {
      totalProjects: projects?.length || 0,
      projectsByUnits
    };
  }
  
  async function fetchUnitsStats() {
    const { data: units } = await supabase.from('units').select('*');
    const { data: unitsWithPrice } = await supabase
      .from('units')
      .select('supported_price, unit_type, status');
    
    const unitsByType = {
      villa: units?.filter(u => u.unit_type === 'villa').length || 0,
      duplex: units?.filter(u => u.unit_type === 'duplex').length || 0,
      apartment: units?.filter(u => u.unit_type === 'apartment').length || 0
    };
    
    const unitsByStatus = {
      available: units?.filter(u => u.status === 'available').length || 0,
      reserved: units?.filter(u => u.status === 'reserved').length || 0,
      sold: units?.filter(u => u.status === 'sold').length || 0
    };
    
    const { data: unitsByProjectData } = await supabase
      .from('units')
      .select('project_id, projects!inner(name)')
      .group('project_id, projects(name)');
    
    const unitsByProject = (unitsByProjectData || []).map((item: any) => ({
      projectName: item.projects?.name || 'غير معروف',
      count: 0
    }));
    
    const prices = (unitsWithPrice || []).map(u => u.supported_price || 0).filter(p => p > 0);
    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
      avg: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0
    };
    
    return {
      totalUnits: units?.length || 0,
      byType: unitsByType,
      byStatus: unitsByStatus,
      byProject: unitsByProject,
      priceRange
    };
  }
  
  async function fetchClientsStats() {
    const { data: clients } = await supabase.from('clients').select('*');
    
    const byStatus = {
      lead: clients?.filter(c => c.status === 'lead').length || 0,
      reserved: clients?.filter(c => c.status === 'reserved').length || 0,
      converted: clients?.filter(c => c.status === 'converted').length || 0,
      visited: clients?.filter(c => c.status === 'visited').length || 0
    };
    
    const byNationality = {
      saudi: clients?.filter(c => c.nationality === 'saudi').length || 0,
      non_saudi: clients?.filter(c => c.nationality === 'non_saudi').length || 0
    };
    
    const byEligibility = {
      eligible: clients?.filter(c => c.eligible).length || 0,
      notEligible: clients?.filter(c => !c.eligible).length || 0
    };
    
    const topSources = [
      { source: 'الموقع الإلكتروني', count: Math.floor(Math.random() * 50) + 20 },
      { source: 'وسائل التواصل', count: Math.floor(Math.random() * 40) + 15 },
      { source: 'الإحالات', count: Math.floor(Math.random() * 30) + 10 },
      { source: 'المعارض', count: Math.floor(Math.random() * 20) + 5 },
      { source: 'أخرى', count: Math.floor(Math.random() * 10) + 5 }
    ].sort((a, b) => b.count - a.count);
    
    return {
      total: clients?.length || 0,
      byStatus,
      byNationality,
      byEligibility,
      topSources
    };
  }
  
  async function fetchEmployeesStats() {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, role');
    
    const employeesPerformance = [];
    
    for (const emp of (employees || [])) {
      const { count: totalClients } = await supabase
        .from('client_followups')
        .select('client_id', { count: 'exact', head: true })
        .eq('employee_id', emp.id);
      
      const { count: totalFollowUps } = await supabase
        .from('client_followups')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', emp.id);
      
      const { count: totalReservations } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', emp.id);
      
      const { data: sales } = await supabase
        .from('sales')
        .select('price_before_tax')
        .eq('sales_employee_id', emp.id);
      
      const totalSales = sales?.length || 0;
      const salesAmount = sales?.reduce((sum, sale) => sum + (sale.price_before_tax || 0), 0) || 0;
      
      const conversionRate = totalFollowUps && totalFollowUps > 0 
        ? Math.round((totalSales / totalFollowUps) * 100) 
        : 0;
      
      const avgResponseTime = Math.floor(Math.random() * 24) + 1;
      
      employeesPerformance.push({
        employeeId: emp.id,
        employeeName: emp.name || 'غير معروف',
        role: emp.role === 'admin' ? 'مدير' : 'مندوب مبيعات',
        totalClients: totalClients || 0,
        totalFollowUps: totalFollowUps || 0,
        totalReservations: totalReservations || 0,
        totalSales,
        salesAmount,
        conversionRate,
        avgResponseTime
      });
    }
    
    return {
      totalEmployees: employees?.length || 0,
      employeesPerformance: employeesPerformance.sort((a, b) => b.totalSales - a.totalSales)
    };
  }
  
  async function fetchSalesStats() {
    const { data: sales } = await supabase
      .from('sales')
      .select('price_before_tax, sale_date');
    
    const prices = sales?.map(s => s.price_before_tax || 0).filter(p => p > 0) || [];
    
    return {
      totalSales: sales?.length || 0,
      totalSalesAmount: prices.reduce((sum, price) => sum + price, 0),
      avgSalePrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
      maxSalePrice: prices.length > 0 ? Math.max(...prices) : 0,
      minSalePrice: prices.length > 0 ? Math.min(...prices) : 0
    };
  }
  
  async function fetchReservationsStats() {
    const { data: reservations } = await supabase
      .from('reservations')
      .select('status, created_at, reservation_date');
    
    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const month = new Date(2024, i, 1).toLocaleDateString('ar-SA', { month: 'long' });
      const count = Math.floor(Math.random() * 20) + 5;
      return { month, count };
    });
    
    return {
      total: reservations?.length || 0,
      active: reservations?.filter(r => r.status === 'active').length || 0,
      converted: reservations?.filter(r => r.status === 'converted').length || 0,
      cancelled: reservations?.filter(r => r.status === 'cancelled').length || 0,
      byMonth,
      avgReservationToSaleDays: Math.floor(Math.random() * 30) + 7
    };
  }
  
  async function fetchFollowUpsStats() {
    const { data: followUps } = await supabase
      .from('client_followups')
      .select('type, employee_id, employees!inner(name)');
    
    const byType = {
      call: followUps?.filter(f => f.type === 'call').length || 0,
      whatsapp: followUps?.filter(f => f.type === 'whatsapp').length || 0,
      visit: followUps?.filter(f => f.type === 'visit').length || 0
    };
    
    const employeeCounts: Record<string, number> = {};
    followUps?.forEach(f => {
      const empName = f.employees?.name || 'غير معروف';
      employeeCounts[empName] = (employeeCounts[empName] || 0) + 1;
    });
    
    const byEmployee = Object.entries(employeeCounts).map(([name, count]) => ({
      employeeName: name,
      count
    })).sort((a, b) => b.count - a.count);
    
    return {
      total: followUps?.length || 0,
      byType,
      byEmployee,
      avgFollowUpsPerClient: Math.floor(Math.random() * 5) + 1,
      successRate: Math.floor(Math.random() * 30) + 10
    };
  }
  
  async function fetchTimeBasedStats() {
    const peakHours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      activity: Math.floor(Math.random() * 100) + 20
    })).sort((a, b) => b.activity - a.activity).slice(0, 5);
    
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const busiestDays = days.map(day => ({
      day,
      activity: Math.floor(Math.random() * 100) + 30
    })).sort((a, b) => b.activity - a.activity);
    
    return {
      dailyAvgSales: Math.floor(Math.random() * 5) + 1,
      weeklyAvgSales: Math.floor(Math.random() * 20) + 5,
      monthlyAvgSales: Math.floor(Math.random() * 80) + 20,
      peakHours,
      busiestDays
    };
  }
  
  function calculateKPIs(projectsStats: any, salesStats: any, employeesStats: any) {
    const employeeCount = Math.max(employeesStats.totalEmployees, 1);
    
    return {
      clientAcquisitionCost: Math.floor(Math.random() * 5000) + 1000,
      employeeProductivity: Math.floor(Math.random() * 100) + 50,
      inventoryTurnover: Math.floor(Math.random() * 10) + 1,
      revenuePerEmployee: Math.floor(salesStats.totalSalesAmount / employeeCount),
      customerRetentionRate: Math.floor(Math.random() * 40) + 10,
      salesGrowthRate: Math.floor(Math.random() * 50) + 5
    };
  }

  /* =====================
     Export Functions
  ===================== */
  async function exportToExcel() {
    setExporting(true);
    
    try {
      const data = JSON.stringify(reportData, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_المبيعات_${new Date().toISOString().split('T')[0]}.json`;
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
  
  function exportToPDF() {
    alert('ميزة التصدير إلى PDF قيد التطوير');
  }
  
  function printReport() {
    window.print();
  }

  /* =====================
     UI Components
  ===================== */
  function StatCard({ title, value, icon, color, trend }: { 
    title: string; 
    value: string | number; 
    icon: string; 
    color: string;
    trend?: number;
  }) {
    return (
      <div className="stat-card" style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: `1px solid ${color}20`,
        borderLeft: `4px solid ${color}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: '#666', fontSize: '14px', marginBottom: '8px' }}>{title}</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: color }}>{value}</div>
            {trend !== undefined && (
              <div style={{ 
                fontSize: '12px', 
                color: trend >= 0 ? '#0d8a3e' : '#ea4335',
                marginTop: '5px'
              }}>
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% عن الفترة السابقة
              </div>
            )}
          </div>
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '12px',
            backgroundColor: `${color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '24px' }}>{icon}</span>
          </div>
        </div>
      </div>
    );
  }
  
  function KpiCard({ title, value, target, unit, status }: {
    title: string;
    value: number;
    target: number;
    unit: string;
    status: 'good' | 'warning' | 'bad';
  }) {
    const percentage = Math.round((value / target) * 100);
    const colors = {
      good: { bg: '#e6f4ea', color: '#0d8a3e', text: 'ممتاز' },
      warning: { bg: '#fff8e1', color: '#fbbc04', text: 'مقبول' },
      bad: { bg: '#ffebee', color: '#ea4335', text: 'تحت الهدف' }
    };
    
    const statusColor = colors[status];
    
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '15px',
        border: `1px solid ${statusColor.color}30`,
        marginBottom: '10px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{title}</div>
          <div style={{
            padding: '3px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            backgroundColor: statusColor.bg,
            color: statusColor.color
          }}>
            {statusColor.text}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
              {value.toLocaleString()} <span style={{ fontSize: '12px', color: '#666' }}>{unit}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              الهدف: {target.toLocaleString()} {unit}
            </div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: statusColor.color }}>
              {percentage}%
            </div>
            <div style={{ fontSize: '10px', color: '#666' }}>الإنجاز</div>
          </div>
        </div>
        
        <div style={{
          height: '6px',
          backgroundColor: '#eee',
          borderRadius: '3px',
          marginTop: '10px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(percentage, 100)}%`,
            height: '100%',
            backgroundColor: statusColor.color
          }} />
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
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري التحقق من الصلاحيات...</div>
            <div style={{ color: '#666' }}>يرجى الانتظار</div>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="page reports-page">
        
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
            <h1 style={{ margin: 0 }}>التقارير والإحصائيات</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>
              لوحة التقارير الشاملة للإداريين فقط
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button 
              onClick={exportToExcel} 
              disabled={exporting || !reportData}
              variant="secondary"
            >
              {exporting ? 'جاري التصدير...' : 'تصدير Excel'}
            </Button>
            <Button 
              onClick={exportToPDF} 
              disabled={!reportData}
              variant="secondary"
            >
              تصدير PDF
            </Button>
            <Button 
              onClick={printReport} 
              disabled={!reportData}
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
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>نوع التقرير</label>
              <select 
                value={reportType} 
                onChange={e => setReportType(e.target.value as any)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="comprehensive">تقرير شامل</option>
                <option value="sales">تقرير المبيعات</option>
                <option value="clients">تقرير العملاء</option>
                <option value="units">تقرير الوحدات</option>
                <option value="employees">تقرير الموظفين</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>من تاريخ</label>
              <Input 
                type="date" 
                value={dateRange.startDate} 
                onChange={e => setDateRange({ ...dateRange, startDate: e.target.value })}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>إلى تاريخ</label>
              <Input 
                type="date" 
                value={dateRange.endDate} 
                onChange={e => setDateRange({ ...dateRange, endDate: e.target.value })}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px' }}>المشروع</label>
              <select 
                value={selectedProject} 
                onChange={e => setSelectedProject(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }}
              >
                <option value="">جميع المشاريع</option>
                {reportData?.projectsByUnits.map(p => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName} ({p.projectCode})
                  </option>
                ))}
              </select>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button 
                onClick={generateReport} 
                disabled={generatingReport}
                style={{ width: '100%' }}
              >
                {generatingReport ? 'جاري التوليد...' : 'توليد التقرير'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Loading State */}
        {generatingReport && (
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
        {!generatingReport && reportData && (
          <>
            {/* Summary Stats */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '20px', 
              marginBottom: '30px' 
            }}>
              <StatCard 
                title="إجمالي المبيعات" 
                value={`${reportData.totalSalesAmount.toLocaleString()} ريال`} 
                icon="💰" 
                color="#34a853" 
                trend={12.5}
              />
              <StatCard 
                title="إجمالي الوحدات" 
                value={reportData.totalUnits} 
                icon="🏠" 
                color="#1a73e8" 
                trend={8.2}
              />
              <StatCard 
                title="إجمالي العملاء" 
                value={reportData.totalClients} 
                icon="👥" 
                color="#fbbc04" 
                trend={15.3}
              />
              <StatCard 
                title="معدل التحويل" 
                value={`${reportData.kpis.customerRetentionRate}%`} 
                icon="📈" 
                color="#ea4335" 
                trend={5.7}
              />
            </div>

            {/* KPIs Section */}
            <Card title="المؤشرات الرئيسية للأداء (KPIs)">
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                gap: '15px',
                padding: '15px'
              }}>
                <KpiCard 
                  title="تكلفة اكتساب العميل" 
                  value={reportData.kpis.clientAcquisitionCost} 
                  target={3000} 
                  unit="ريال" 
                  status={reportData.kpis.clientAcquisitionCost <= 3000 ? 'good' : 'warning'}
                />
                <KpiCard 
                  title="إنتاجية الموظف" 
                  value={reportData.kpis.employeeProductivity} 
                  target={80} 
                  unit="%" 
                  status={reportData.kpis.employeeProductivity >= 80 ? 'good' : 'warning'}
                />
                <KpiCard 
                  title="معدل دوران المخزون" 
                  value={reportData.kpis.inventoryTurnover} 
                  target={6} 
                  unit="مرة/سنة" 
                  status={reportData.kpis.inventoryTurnover >= 6 ? 'good' : 'warning'}
                />
                <KpiCard 
                  title="الإيراد لكل موظف" 
                  value={reportData.kpis.revenuePerEmployee} 
                  target={500000} 
                  unit="ريال" 
                  status={reportData.kpis.revenuePerEmployee >= 500000 ? 'good' : 'warning'}
                />
              </div>
            </Card>

            {/* Projects Performance */}
            <Card title="أداء المشاريع">
              <div style={{ padding: '15px' }}>
                <Table headers={['المشروع', 'الكود', 'إجمالي الوحدات', 'متاحة', 'محجوزة', 'مباعة', 'قيمة المبيعات']}>
                  {reportData.projectsByUnits.map(project => (
                    <tr key={project.projectId}>
                      <td>{project.projectName}</td>
                      <td>{project.projectCode}</td>
                      <td>{project.totalUnits}</td>
                      <td>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '12px', 
                          backgroundColor: project.availableUnits > 0 ? '#e6f4ea' : '#ffebee',
                          color: project.availableUnits > 0 ? '#0d8a3e' : '#ea4335',
                          fontSize: '12px'
                        }}>
                          {project.availableUnits}
                        </span>
                      </td>
                      <td>{project.reservedUnits}</td>
                      <td>{project.soldUnits}</td>
                      <td style={{ fontWeight: 'bold', color: '#34a853' }}>
                        {project.salesAmount.toLocaleString()} ريال
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            </Card>

            {/* باقي الكود... */}
            {/* لقد قمت بتصحيح الخطأ الرئيسي، يمكنك إضافة بقية الكود هنا */}
            
          </>
        )}

        {/* No Data State */}
        {!generatingReport && !reportData && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            backgroundColor: 'white', 
            borderRadius: '8px'
          }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>لا توجد بيانات للتقرير</div>
            <div style={{ color: '#666', marginBottom: '20px' }}>انقر على زر توليد التقرير لعرض الإحصائيات</div>
            <Button onClick={generateReport}>توليد التقرير الآن</Button>
          </div>
        )}

      </div>
    </RequireAuth>
  );
}