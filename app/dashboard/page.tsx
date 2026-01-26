'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';

/* =====================
   Types
===================== */

type Employee = {
  id: string;
  name: string;
  role: 'admin' | 'sales' | 'sales_manager';
  email: string;
  projects?: string[];
};

type DashboardStats = {
  // إحصائيات عامة
  totalClients: number;
  totalAvailableUnits: number;
  
  // إحصائيات الموظف الحالي
  myFollowUps: number;
  myReservations: number;
  mySales: number;
  
  // إحصائيات الموظفين الآخرين
  otherEmployeesStats: Array<{
    id: string;
    name: string;
    followUps: number;
    reservations: number;
    sales: number;
    totalActivity: number;
    projects: string[];
  }>;
  
  // إحصائيات الفريق (لـ sales_manager فقط)
  myTeamStats?: Array<{
    id: string;
    name: string;
    followUps: number;
    reservations: number;
    sales: number;
    totalActivity: number;
    projects: string[];
  }>;
  
  // إحصائيات إضافية
  clientsByStatus: {
    lead: number;
    reserved: number;
    converted: number;
    visited: number;
  };
  
  unitsByStatus: {
    available: number;
    reserved: number;
    sold: number;
  };
  
  // متوسط النشاط
  avgFollowUpsPerEmployee: number;
  avgReservationsPerEmployee: number;
  avgSalesPerEmployee: number;
  
  // معدل التحويل
  conversionRate: number;
  reservationToSaleRate: number;
  
  // إحصائيات إضافية
  myProjectsUnits: {
    available: number;
    reserved: number;
    sold: number;
  };
  
  // المشاريع الخاصة بالـ sales_manager
  managerProjects?: string[];
};

/* =====================
   Page
===================== */

export default function DashboardPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('month');

  /* =====================
     Helper Functions
  ===================== */
  function getStartDate(range: 'today' | 'week' | 'month' | 'all'): string {
    const now = new Date();
    
    switch (range) {
      case 'today':
        now.setHours(0, 0, 0, 0);
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        break;
      case 'all':
        return '1970-01-01';
    }
    
    return now.toISOString();
  }

  function getActivityLevel(activity: number): { label: string; color: string; bgColor: string } {
    if (activity >= 20) return { label: 'ممتاز', color: '#0d8a3e', bgColor: '#e6f4ea' };
    if (activity >= 10) return { label: 'جيد جداً', color: '#34a853', bgColor: '#e8f5e9' };
    if (activity >= 5) return { label: 'جيد', color: '#fbbc04', bgColor: '#fff8e1' };
    if (activity >= 1) return { label: 'ضعيف', color: '#ea4335', bgColor: '#ffebee' };
    return { label: 'لا يوجد نشاط', color: '#666', bgColor: '#f5f5f5' };
  }

  function calculatePercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.min((value / total) * 100, 100);
  }

  // دالة مساعدة لجلب كل الوحدات باستخدام Pagination
  async function getAllUnits(projectIds?: string[]) {
    let allUnits: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
      let query = supabase
        .from('units')
        .select('status, project_id')
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (projectIds && projectIds.length > 0) {
        query = query.in('project_id', projectIds);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching units:', error);
        break;
      }
      
      if (data && data.length > 0) {
        allUnits = [...allUnits, ...data];
        page++;
        
        if (data.length < pageSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
    
    return allUnits;
  }

  // دالة جديدة: جلب المشاريع المرتبطة بالموظف
  async function getEmployeeProjects(employeeId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('employee_projects')
      .select('project_id')
      .eq('employee_id', employeeId);
    
    if (error) {
      console.error('Error fetching employee projects:', error);
      return [];
    }
    
    return data?.map(p => p.project_id) || [];
  }

  // دالة جديدة: جلب موظفي الفريق لـ sales_manager
  async function getTeamEmployees(managerId: string): Promise<Employee[]> {
    // جلب المشاريع الخاصة بالـ manager
    const managerProjects = await getEmployeeProjects(managerId);
    
    if (managerProjects.length === 0) return [];
    
    // جلب جميع الموظفين المرتبطين بنفس المشاريع
    const { data: employeeProjects, error } = await supabase
      .from('employee_projects')
      .select('employee_id')
      .in('project_id', managerProjects);
    
    if (error) {
      console.error('Error fetching team employees:', error);
      return [];
    }
    
    const employeeIds = [...new Set(employeeProjects?.map(ep => ep.employee_id) || [])];
    
    // إزالة المدير نفسه من القائمة
    const filteredIds = employeeIds.filter(id => id !== managerId);
    
    if (filteredIds.length === 0) return [];
    
    // جلب بيانات الموظفين
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, name, email, role')
      .in('id', filteredIds)
      .in('role', ['sales', 'sales_manager']);
    
    if (empError) {
      console.error('Error fetching employees data:', empError);
      return [];
    }
    
    return employees as Employee[];
  }

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
  }, [timeRange]);

  async function init() {
    try {
      setLoading(true);
      
      // 1. الحصول على بيانات الموظف الحالي
      const emp = await getCurrentEmployee();
      if (!emp) {
        setLoading(false);
        return;
      }
      
      // 2. الحصول على اسم الموظف والمشاريع المرتبطة
      const [empData, empProjects] = await Promise.all([
        supabase
          .from('employees')
          .select('name, email')
          .eq('id', emp.id)
          .single(),
        getEmployeeProjects(emp.id)
      ]);
      
      const employeeData: Employee = {
        ...emp,
        name: empData?.data?.name || 'موظف',
        email: empData?.data?.email || '',
        projects: empProjects
      };
      
      setEmployee(employeeData);

      // 3. تحميل الإحصائيات
      await loadDashboardStats(employeeData);
      
      setLoading(false);
    } catch (err) {
      console.error('Error in init():', err);
      setLoading(false);
    }
  }

  /* =====================
     Load Dashboard Stats
  ===================== */
  async function loadDashboardStats(emp: Employee) {
    setLoading(true);
    
    try {
      const startDate = getStartDate(timeRange);
      
      // ===== تحديد المشاريع المسموحة حسب الدور =====
      let allowedProjectIds: string[] = [];
      let managerProjects: string[] = [];
      let teamEmployees: Employee[] = [];
      
      if (emp.role === 'sales' || emp.role === 'sales_manager') {
        allowedProjectIds = emp.projects || [];
      }
      
      if (emp.role === 'sales_manager') {
        managerProjects = emp.projects || [];
        // جلب فريق المبيعات المرتبط بنفس المشاريع
        teamEmployees = await getTeamEmployees(emp.id);
      }

      // ===== حالة الموظفين بدون مشاريع =====
      if ((emp.role === 'sales' || emp.role === 'sales_manager') && allowedProjectIds.length === 0) {
        const unitsByStatus = {
          available: 0,
          reserved: 0,
          sold: 0
        };

        const dashboardStats: DashboardStats = {
          totalClients: 0,
          totalAvailableUnits: 0,
          myFollowUps: 0,
          myReservations: 0,
          mySales: 0,
          otherEmployeesStats: [],
          clientsByStatus: { lead: 0, reserved: 0, converted: 0, visited: 0 },
          unitsByStatus,
          avgFollowUpsPerEmployee: 0,
          avgReservationsPerEmployee: 0,
          avgSalesPerEmployee: 0,
          conversionRate: 0,
          reservationToSaleRate: 0,
          myProjectsUnits: unitsByStatus
        };

        setStats(dashboardStats);
        return;
      }

      // ===== جلب الوحدات حسب الصلاحيات =====
      let filteredUnits: any[] = [];
      
      if (emp.role === 'admin') {
        filteredUnits = await getAllUnits();
      } else {
        filteredUnits = await getAllUnits(allowedProjectIds);
      }

      const unitsByStatus = {
        available: filteredUnits.filter(u => u.status === 'available').length,
        reserved: filteredUnits.filter(u => u.status === 'reserved').length,
        sold: filteredUnits.filter(u => u.status === 'sold').length
      };

      // ===== عدد الوحدات المتاحة =====
      const getAvailableUnitsCount = async (projectIds?: string[]) => {
        let count = 0;
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          let query = supabase
            .from('units')
            .select('id', { count: 'exact', head: false })
            .eq('status', 'available')
            .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (projectIds && projectIds.length > 0) {
            query = query.in('project_id', projectIds);
          }
          
          const { data } = await query;
          
          if (data) {
            count += data.length;
            page++;
            
            if (data.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }
        
        return count;
      };

      let myAvailableUnits = 0;
      let totalAvailableUnitsForAdmin = 0;

      if (emp.role === 'admin') {
        totalAvailableUnitsForAdmin = await getAvailableUnitsCount();
      } else {
        myAvailableUnits = await getAvailableUnitsCount(allowedProjectIds);
      }

      // ===== المتابعات الخاصة بالموظف الحالي =====
      const { count: myFollowUps } = await supabase
        .from('client_followups')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', emp.id)
        .gte('created_at', startDate);

      // ===== الحجوزات الخاصة بالموظف الحالي =====
      const { count: myReservations } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', emp.id)
        .gte('created_at', startDate);

      // ===== التنفيذات الخاصة بالموظف الحالي =====
      const { count: mySales } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('sales_employee_id', emp.id)
        .gte('created_at', startDate);

      // ===== إحصائيات الموظفين الآخرين =====
      let otherEmployeesStats = [];
      let myTeamStats = [];
      
      if (emp.role === 'admin') {
        // الأدمن يرى كل الموظفين
        const { data: allEmployees } = await supabase
          .from('employees')
          .select('id, name, role')
          .neq('id', emp.id)
          .in('role', ['sales', 'sales_manager']);

        for (const otherEmp of (allEmployees || [])) {
          const otherEmpProjects = await getEmployeeProjects(otherEmp.id);
          
          const [
            { count: followUps },
            { count: reservations },
            { count: sales }
          ] = await Promise.all([
            supabase
              .from('client_followups')
              .select('*', { count: 'exact', head: true })
              .eq('employee_id', otherEmp.id)
              .gte('created_at', startDate),
            
            supabase
              .from('reservations')
              .select('*', { count: 'exact', head: true })
              .eq('employee_id', otherEmp.id)
              .gte('created_at', startDate),
            
            supabase
              .from('sales')
              .select('*', { count: 'exact', head: true })
              .eq('sales_employee_id', otherEmp.id)
              .gte('created_at', startDate)
          ]);

          otherEmployeesStats.push({
            id: otherEmp.id,
            name: otherEmp.name || 'موظف',
            followUps: followUps || 0,
            reservations: reservations || 0,
            sales: sales || 0,
            totalActivity: (followUps || 0) + (reservations || 0) + (sales || 0),
            projects: otherEmpProjects
          });
        }
      } else if (emp.role === 'sales_manager') {
        // sales_manager يرى فريق المبيعات الخاص به
        for (const teamMember of teamEmployees) {
          const teamMemberProjects = await getEmployeeProjects(teamMember.id);
          
          // فلترة فقط المشاريع المشتركة مع المدير
          const sharedProjects = teamMemberProjects.filter(projectId => 
            managerProjects.includes(projectId)
          );
          
          if (sharedProjects.length === 0) continue;
          
          const [
            { count: followUps },
            { count: reservations },
            { count: sales }
          ] = await Promise.all([
            supabase
              .from('client_followups')
              .select('*', { count: 'exact', head: true })
              .eq('employee_id', teamMember.id)
              .gte('created_at', startDate),
            
            supabase
              .from('reservations')
              .select('*', { count: 'exact', head: true })
              .eq('employee_id', teamMember.id)
              .gte('created_at', startDate),
            
            supabase
              .from('sales')
              .select('*', { count: 'exact', head: true })
              .eq('sales_employee_id', teamMember.id)
              .gte('created_at', startDate)
          ]);

          myTeamStats.push({
            id: teamMember.id,
            name: teamMember.name || 'موظف',
            followUps: followUps || 0,
            reservations: reservations || 0,
            sales: sales || 0,
            totalActivity: (followUps || 0) + (reservations || 0) + (sales || 0),
            projects: sharedProjects
          });
        }
      }

      // ===== توزيع العملاء حسب الحالة =====
      let clientsQuery = supabase
        .from('clients')
        .select('status');
      
      if (emp.role === 'sales' || emp.role === 'sales_manager') {
        clientsQuery = clientsQuery.in('project_id', allowedProjectIds);
      }
      
      const { data: clientsByStatusData } = await clientsQuery;

      const clientsByStatus = {
        lead: clientsByStatusData?.filter(c => c.status === 'lead').length || 0,
        reserved: clientsByStatusData?.filter(c => c.status === 'reserved').length || 0,
        converted: clientsByStatusData?.filter(c => c.status === 'converted').length || 0,
        visited: clientsByStatusData?.filter(c => c.status === 'visited').length || 0
      };

      // ===== حساب المتوسطات =====
      let employeeCount = 1;
      let totalFollowUps = myFollowUps || 0;
      let totalReservations = myReservations || 0;
      let totalSales = mySales || 0;
      
      if (emp.role === 'admin') {
        const { data: allSalesEmployees } = await supabase
          .from('employees')
          .select('id')
          .in('role', ['sales', 'sales_manager']);
        
        employeeCount = allSalesEmployees?.length || 1;
        
        totalFollowUps = otherEmployeesStats.reduce((sum, emp) => sum + emp.followUps, myFollowUps || 0);
        totalReservations = otherEmployeesStats.reduce((sum, emp) => sum + emp.reservations, myReservations || 0);
        totalSales = otherEmployeesStats.reduce((sum, emp) => sum + emp.sales, mySales || 0);
      } else if (emp.role === 'sales_manager') {
        employeeCount = myTeamStats.length + 1; // +1 للمدير نفسه
        
        const teamFollowUps = myTeamStats.reduce((sum, emp) => sum + emp.followUps, 0);
        const teamReservations = myTeamStats.reduce((sum, emp) => sum + emp.reservations, 0);
        const teamSales = myTeamStats.reduce((sum, emp) => sum + emp.sales, 0);
        
        totalFollowUps = (myFollowUps || 0) + teamFollowUps;
        totalReservations = (myReservations || 0) + teamReservations;
        totalSales = (mySales || 0) + teamSales;
      }

      // ===== حساب معدلات التحويل =====
      const totalClients = Object.values(clientsByStatus).reduce((a, b) => a + b, 0);
      
      const conversionRate = totalClients && totalSales 
        ? Math.round((totalSales / totalClients) * 100) 
        : 0;
      
      const reservationToSaleRate = totalReservations && totalSales
        ? Math.round((totalSales / totalReservations) * 100)
        : 0;

      // ===== تجميع كل الإحصائيات =====
      const dashboardStats: DashboardStats = {
        totalClients,
        totalAvailableUnits: emp.role === 'admin' ? totalAvailableUnitsForAdmin : myAvailableUnits,
        
        myFollowUps: myFollowUps || 0,
        myReservations: myReservations || 0,
        mySales: mySales || 0,
        
        otherEmployeesStats,
        myTeamStats: myTeamStats.length > 0 ? myTeamStats : undefined,
        
        clientsByStatus,
        unitsByStatus,
        
        avgFollowUpsPerEmployee: Math.round(totalFollowUps / employeeCount),
        avgReservationsPerEmployee: Math.round(totalReservations / employeeCount),
        avgSalesPerEmployee: Math.round(totalSales / employeeCount),
        
        conversionRate,
        reservationToSaleRate,
        
        myProjectsUnits: unitsByStatus,
        managerProjects: emp.role === 'sales_manager' ? managerProjects : undefined
      };

      setStats(dashboardStats);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }

  /* =====================
     Helper: Get Role Label
  ===================== */
  function getRoleLabel(role: string): string {
    switch (role) {
      case 'admin': return 'مدير نظام';
      case 'sales_manager': return 'مدير مبيعات';
      case 'sales': return 'مندوب مبيعات';
      default: return role;
    }
  }

  /* =====================
     UI
  ===================== */
  if (loading) {
    return (
      <RequireAuth>
        <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>جاري تحميل الإحصائيات...</div>
            <div style={{ color: '#666' }}>يرجى الانتظار</div>
          </div>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="page dashboard-page">
        
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            <h1 style={{ margin: 0 }}>لوحة التحكم</h1>
            <p style={{ color: '#666', marginTop: '5px' }}>
              مرحباً {employee?.name} ({getRoleLabel(employee?.role || '')})
              {employee?.projects && employee.projects.length > 0 && (
                <span style={{ fontSize: '12px', color: '#0d8a3e', marginRight: '10px' }}>
                  • {employee.projects.length} مشروع
                </span>
              )}
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span>الفترة الزمنية:</span>
            <select 
              value={timeRange} 
              onChange={e => setTimeRange(e.target.value as any)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd' }}
            >
              <option value="today">اليوم</option>
              <option value="week">آخر أسبوع</option>
              <option value="month">آخر شهر</option>
              <option value="all">الكل</option>
            </select>
          </div>
        </div>

        {/* Quick Stats Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '20px', 
          marginBottom: '30px' 
        }}>
          {/* العملاء */}
          <div className="card-stats" style={{ 
            padding: '20px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid #eaeaea'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>إجمالي العملاء</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1a73e8' }}>
                  {stats?.totalClients.toLocaleString()}
                </div>
                {employee?.role === 'sales_manager' && (
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                    في مشاريعك ({stats?.managerProjects?.length || 0})
                  </div>
                )}
              </div>
              <div style={{ 
                width: '50px', 
                height: '50px', 
                borderRadius: '12px', 
                backgroundColor: '#e8f0fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '24px', color: '#1a73e8' }}>👥</span>
              </div>
            </div>
            <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span style={{ color: '#0d8a3e' }}>متابعة: {stats?.clientsByStatus.lead}</span>
              <span style={{ color: '#fbbc04' }}>محجوز: {stats?.clientsByStatus.reserved}</span>
              <span style={{ color: '#34a853' }}>تم البيع: {stats?.clientsByStatus.converted}</span>
            </div>
          </div>

          {/* الوحدات المتاحة */}
          <div className="card-stats" style={{ 
            padding: '20px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid #eaeaea'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>
                  الوحدات المتاحة 
                  {employee?.role === 'sales' && '(مشاريعك)'}
                  {employee?.role === 'sales_manager' && '(فريقك)'}
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#0d8a3e' }}>
                  {stats?.totalAvailableUnits.toLocaleString()}
                </div>
              </div>
              <div style={{ 
                width: '50px', 
                height: '50px', 
                borderRadius: '12px', 
                backgroundColor: '#e6f4ea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '24px', color: '#0d8a3e' }}>🏠</span>
              </div>
            </div>
            <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
              {employee?.role === 'admin' ? 'كل المشاريع' : 
               employee?.role === 'sales_manager' ? 'المشاريع الخاصة بفريقك' : 
               'المشاريع المرتبطة بك فقط'}
            </div>
          </div>

          {/* نشاطي الشخصي */}
          <div className="card-stats" style={{ 
            padding: '20px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid #eaeaea'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>نشاطي الشخصي</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  <span style={{ color: '#1a73e8' }}>{stats?.myFollowUps}</span> / 
                  <span style={{ color: '#fbbc04' }}> {stats?.myReservations}</span> / 
                  <span style={{ color: '#34a853' }}> {stats?.mySales}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  متابعات / حجوزات / تنفيذات
                </div>
              </div>
              <div style={{ 
                width: '50px', 
                height: '50px', 
                borderRadius: '12px', 
                backgroundColor: '#fff8e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '24px', color: '#fbbc04' }}>📊</span>
              </div>
            </div>
            <div style={{ marginTop: '15px' }}>
              <div style={{ 
                height: '6px', 
                backgroundColor: '#eee', 
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{ 
                  width: `${Math.min((stats?.myFollowUps || 0) * 5, 100)}%`, 
                  height: '100%', 
                  backgroundColor: '#1a73e8' 
                }} />
              </div>
            </div>
          </div>

          {/* معدلات التحويل */}
          <div className="card-stats" style={{ 
            padding: '20px', 
            backgroundColor: 'white', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid #eaeaea'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#666', fontSize: '14px', marginBottom: '5px' }}>معدل التحويل</div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ea4335' }}>
                  {stats?.conversionRate}%
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  من عميل إلى بيع
                </div>
              </div>
              <div style={{ 
                width: '50px', 
                height: '50px', 
                borderRadius: '12px', 
                backgroundColor: '#ffebee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span style={{ fontSize: '24px', color: '#ea4335' }}>📈</span>
              </div>
            </div>
            <div style={{ marginTop: '15px', fontSize: '12px' }}>
              {stats?.reservationToSaleRate}% من الحجوزات تتحول لبيع
            </div>
          </div>
        </div>

        {/* قسمين رئيسيين */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: employee?.role === 'admin' ? '1fr 1fr' : '1fr', 
          gap: '20px',
          marginBottom: '30px'
        }}>
          {/* إحصائيات الوحدات */}
          <Card title={`توزيع الوحدات ${employee?.role === 'sales' ? '(مشاريعك)' : employee?.role === 'sales_manager' ? '(فريقك)' : ''}`}>
            <div style={{ padding: '15px' }}>
              {(() => {
                const total = (stats?.unitsByStatus.available || 0) + 
                             (stats?.unitsByStatus.reserved || 0) + 
                             (stats?.unitsByStatus.sold || 0);
                
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                      <div style={{ 
                        width: '12px', 
                        height: '12px', 
                        backgroundColor: '#0d8a3e', 
                        borderRadius: '50%',
                        marginRight: '8px'
                      }} />
                      <span>متاحة: {stats?.unitsByStatus.available}</span>
                      <div style={{ flex: 1, marginLeft: '10px' }}>
                        <div style={{ 
                          width: `${calculatePercentage(stats?.unitsByStatus.available || 0, total)}%`, 
                          height: '8px', 
                          backgroundColor: '#0d8a3e',
                          borderRadius: '4px'
                        }} />
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                      <div style={{ 
                        width: '12px', 
                        height: '12px', 
                        backgroundColor: '#fbbc04', 
                        borderRadius: '50%',
                        marginRight: '8px'
                      }} />
                      <span>محجوزة: {stats?.unitsByStatus.reserved}</span>
                      <div style={{ flex: 1, marginLeft: '10px' }}>
                        <div style={{ 
                          width: `${calculatePercentage(stats?.unitsByStatus.reserved || 0, total)}%`, 
                          height: '8px', 
                          backgroundColor: '#fbbc04',
                          borderRadius: '4px'
                        }} />
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ 
                        width: '12px', 
                        height: '12px', 
                        backgroundColor: '#34a853', 
                        borderRadius: '50%',
                        marginRight: '8px'
                      }} />
                      <span>مباعة: {stats?.unitsByStatus.sold}</span>
                      <div style={{ flex: 1, marginLeft: '10px' }}>
                        <div style={{ 
                          width: `${calculatePercentage(stats?.unitsByStatus.sold || 0, total)}%`, 
                          height: '8px', 
                          backgroundColor: '#34a853',
                          borderRadius: '4px'
                        }} />
                      </div>
                    </div>
                    
                    <div style={{ marginTop: '15px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                      إجمالي الوحدات: {total.toLocaleString()}
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>

          {/* أداء الفريق (لـ sales_manager) أو أداء الموظفين (لـ admin) */}
          {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
            <Card title={employee?.role === 'admin' ? "أداء فريق المبيعات" : "أداء فريقك"}>
              <div style={{ padding: '15px' }}>
                {employee?.role === 'sales_manager' && (!stats?.myTeamStats || stats.myTeamStats.length === 0) ? (
                  <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                    لا يوجد موظفين في فريقك حالياً
                    <div style={{ marginTop: '10px', fontSize: '12px' }}>
                      قم بإضافة موظفين إلى المشاريع الخاصة بك
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                      gap: '10px',
                      marginBottom: '10px',
                      paddingBottom: '10px',
                      borderBottom: '1px solid #eee',
                      fontWeight: 'bold',
                      fontSize: '12px',
                      color: '#666'
                    }}>
                      <div>الاسم</div>
                      <div style={{ textAlign: 'center' }}>متابعات</div>
                      <div style={{ textAlign: 'center' }}>حجوزات</div>
                      <div style={{ textAlign: 'center' }}>تنفيذات</div>
                      <div style={{ textAlign: 'center' }}>النشاط</div>
                    </div>
                    
                    {(employee?.role === 'admin' ? stats?.otherEmployeesStats : stats?.myTeamStats)?.map(empStat => {
                      const activityLevel = getActivityLevel(empStat.totalActivity);
                      return (
                        <div 
                          key={empStat.id}
                          style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                            gap: '10px',
                            padding: '8px 0',
                            borderBottom: '1px solid #f5f5f5',
                            fontSize: '14px',
                            alignItems: 'center'
                          }}
                        >
                          <div>{empStat.name}</div>
                          <div style={{ textAlign: 'center', color: '#1a73e8' }}>{empStat.followUps}</div>
                          <div style={{ textAlign: 'center', color: '#fbbc04' }}>{empStat.reservations}</div>
                          <div style={{ textAlign: 'center', color: '#34a853' }}>{empStat.sales}</div>
                          <div style={{ textAlign: 'center' }}>
                            <span style={{ 
                              padding: '3px 8px', 
                              borderRadius: '12px', 
                              fontSize: '11px',
                              backgroundColor: activityLevel.bgColor,
                              color: activityLevel.color
                            }}>
                              {activityLevel.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    
                    <div style={{ marginTop: '15px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                      المتوسط: {stats?.avgFollowUpsPerEmployee} متابعة | {stats?.avgReservationsPerEmployee} حجز | {stats?.avgSalesPerEmployee} تنفيذ
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* إحصائيات سريعة إضافية */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: '20px' 
        }}>
          {/* مقارنة الأداء */}
          <Card title="مقارنة الأداء">
            <div style={{ padding: '15px' }}>
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px' }}>متابعات</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    أنت: {stats?.myFollowUps} | المتوسط: {stats?.avgFollowUpsPerEmployee}
                  </span>
                </div>
                <div style={{ display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${calculatePercentage(stats?.myFollowUps || 0, Math.max(stats?.myFollowUps || 0, stats?.avgFollowUpsPerEmployee || 1))}%`, 
                    backgroundColor: '#1a73e8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '10px'
                  }}>
                    {stats?.myFollowUps || 0}
                  </div>
                  <div style={{ 
                    width: `${calculatePercentage(stats?.avgFollowUpsPerEmployee || 0, Math.max(stats?.myFollowUps || 0, stats?.avgFollowUpsPerEmployee || 1))}%`, 
                    backgroundColor: '#c2e0ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1a73e8',
                    fontSize: '10px'
                  }}>
                    {stats?.avgFollowUpsPerEmployee || 0}
                  </div>
                </div>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px' }}>حجوزات</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    أنت: {stats?.myReservations} | المتوسط: {stats?.avgReservationsPerEmployee}
                  </span>
                </div>
                <div style={{ display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${calculatePercentage(stats?.myReservations || 0, Math.max(stats?.myReservations || 0, stats?.avgReservationsPerEmployee || 1))}%`, 
                    backgroundColor: '#fbbc04',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '10px'
                  }}>
                    {stats?.myReservations || 0}
                  </div>
                  <div style={{ 
                    width: `${calculatePercentage(stats?.avgReservationsPerEmployee || 0, Math.max(stats?.myReservations || 0, stats?.avgReservationsPerEmployee || 1))}%`, 
                    backgroundColor: '#ffeaa7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fbbc04',
                    fontSize: '10px'
                  }}>
                    {stats?.avgReservationsPerEmployee || 0}
                  </div>
                </div>
              </div>
              
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px' }}>تنفيذات</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    أنت: {stats?.mySales} | المتوسط: {stats?.avgSalesPerEmployee}
                  </span>
                </div>
                <div style={{ display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${calculatePercentage(stats?.mySales || 0, Math.max(stats?.mySales || 0, stats?.avgSalesPerEmployee || 1))}%`, 
                    backgroundColor: '#34a853',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '10px'
                  }}>
                    {stats?.mySales || 0}
                  </div>
                  <div style={{ 
                    width: `${calculatePercentage(stats?.avgSalesPerEmployee || 0, Math.max(stats?.mySales || 0, stats?.avgSalesPerEmployee || 1))}%`, 
                    backgroundColor: '#a8e6a8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#34a853',
                    fontSize: '10px'
                  }}>
                    {stats?.avgSalesPerEmployee || 0}
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
                <div>🔵 أنت | ⚪ المتوسط {employee?.role === 'sales_manager' ? 'فريقك' : 'بين المندوبين'}</div>
              </div>
            </div>
          </Card>

          {/* أزرار سريعة */}
          <Card title="إجراءات سريعة">
            <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                onClick={() => router.push('/dashboard/clients')}
                style={{ 
                  padding: '12px', 
                  backgroundColor: '#2563eb',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.2s',
                  textAlign: 'right',
                  color: 'white'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                <span style={{ marginRight: '10px', fontSize: '18px' }}>👥</span> إدارة العملاء
              </button>
              
              <button 
                onClick={() => router.push('/dashboard/units')}
                style={{ 
                  padding: '12px', 
                  backgroundColor: '#2563eb',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.2s',
                  textAlign: 'right',
                  color: 'white'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                <span style={{ marginRight: '10px', fontSize: '18px' }}>🏠</span> إدارة الوحدات
              </button>
              
              <button 
                onClick={() => router.push('/dashboard/projects')}
                style={{ 
                  padding: '12px', 
                  backgroundColor: '#2563eb',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.2s',
                  textAlign: 'right',
                  color: 'white'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                <span style={{ marginRight: '10px', fontSize: '18px' }}>📋</span> إدارة المشاريع
              </button>
              
              {employee?.role === 'admin' && (
                <button 
                  onClick={() => router.push('/dashboard/employees')}
                  style={{ 
                    padding: '12px', 
                    backgroundColor: '#2563eb',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.2s',
                    textAlign: 'right',
                    color: 'white'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                >
                  <span style={{ marginRight: '10px', fontSize: '18px' }}>👨‍💼</span> إدارة الموظفين
                </button>
              )}
              
              {employee?.role === 'sales_manager' && (
                <button 
                  onClick={() => router.push('/dashboard/team')}
                  style={{ 
                    padding: '12px', 
                    backgroundColor: '#2563eb',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.2s',
                    textAlign: 'right',
                    color: 'white'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                >
                  <span style={{ marginRight: '10px', fontSize: '18px' }}>👥</span> إدارة الفريق
                </button>
              )}
              
              <button 
                onClick={() => router.push('/dashboard/reservations')}
                style={{ 
                  padding: '12px', 
                  backgroundColor: '#2563eb',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.2s',
                  textAlign: 'right',
                  color: 'white'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                <span style={{ marginRight: '10px', fontSize: '18px' }}>📅</span> الحجوزات
              </button>
              
              <button 
                onClick={() => router.push('/dashboard/sales')}
                style={{ 
                  padding: '12px', 
                  backgroundColor: '#2563eb',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.2s',
                  textAlign: 'right',
                  color: 'white'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                <span style={{ marginRight: '10px', fontSize: '18px' }}>💰</span> التنفيذات
              </button>
            </div>
          </Card>
        </div>

        {/* ملخص أداء */}
        <Card title="ملخص الأداء">
          <div style={{ padding: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                backgroundColor: employee?.role === 'admin' ? '#e6f4ea' : 
                                 employee?.role === 'sales_manager' ? '#e0e7ff' : '#e8f0fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '15px'
              }}>
                <span style={{ fontSize: '20px' }}>
                  {employee?.role === 'admin' ? '👨‍💼' : 
                   employee?.role === 'sales_manager' ? '👔' : '👤'}
                </span>
              </div>
              <div>
                <div style={{ fontWeight: 'bold' }}>{employee?.name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {getRoleLabel(employee?.role || '')} | {employee?.email}
                  {employee?.projects && employee.projects.length > 0 && (
                    <span style={{ marginRight: '10px', color: '#0d8a3e' }}>
                      • {employee.projects.length} مشروع
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '15px', 
              marginTop: '15px' 
            }}>
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '15px', 
                borderRadius: '8px',
                borderLeft: '4px solid #1a73e8'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>كفاءة المتابعة</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {stats?.myFollowUps && stats.myFollowUps > 0 && stats.myReservations 
                    ? Math.round((stats.myReservations / stats.myFollowUps) * 100) 
                    : 0}%
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>من المتابعات تتحول لحجوزات</div>
              </div>
              
            <div style={{ 
               backgroundColor: '#f8f9fa', 
               padding: '15px', 
               borderRadius: '8px',
               borderLeft: '4px solid #fbbc04' // ← تصحيح هنا
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>معدل الإنجاز</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {stats?.myReservations && stats.myReservations > 0 && stats.mySales 
                    ? Math.round((stats.mySales / stats.myReservations) * 100) 
                    : 0}%
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>من الحجوزات تتحول لتنفيذات</div>
              </div>
              
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '15px', 
                borderRadius: '8px',
                borderLeft: '4px solid '#34a853'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>قيمة التنفيذات</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {stats?.mySales || 0}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>وحدات تم بيعها</div>
              </div>
            </div>
            
            {employee?.role === 'sales_manager' && stats?.myTeamStats && stats.myTeamStats.length > 0 && (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#0c4a6e' }}>
                  أداء فريقك ({stats.myTeamStats.length} عضو)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <div>إجمالي المتابعات: {stats.myTeamStats.reduce((sum, emp) => sum + emp.followUps, 0)}</div>
                  <div>إجمالي الحجوزات: {stats.myTeamStats.reduce((sum, emp) => sum + emp.reservations, 0)}</div>
                  <div>إجمالي التنفيذات: {stats.myTeamStats.reduce((sum, emp) => sum + emp.sales, 0)}</div>
                </div>
              </div>
            )}
            
            <div style={{ marginTop: '20px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
              آخر تحديث: {new Date().toLocaleString('ar-SA')} | الفترة: {timeRange === 'today' ? 'اليوم' : timeRange === 'week' ? 'آخر أسبوع' : timeRange === 'month' ? 'آخر شهر' : 'الكل'}
            </div>
          </div>
        </Card>

      </div>
    </RequireAuth>
  );
}