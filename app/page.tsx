'use client';

import { useEffect, useState } from 'react';
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
  role: 'admin' | 'sales';
  email: string;
};

type DashboardStats = {
  // إحصائيات عامة
  totalClients: number;
  totalAvailableUnits: number;
  
  // إحصائيات الموظف الحالي
  myFollowUps: number;
  myReservations: number;
  mySales: number;
  
  // إحصائيات الموظفين الآخرين (للأدمن فقط)
  otherEmployeesStats: Array<{
    id: string;
    name: string;
    followUps: number;
    reservations: number;
    sales: number;
    totalActivity: number;
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
  conversionRate: number; // من حجز إلى بيع
  reservationToSaleRate: number;
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
     INIT
  ===================== */
  useEffect(() => {
    init();
  }, [timeRange]);

  async function init() {
    try {
      // 1. الحصول على بيانات الموظف الحالي
      const emp = await getCurrentEmployee();
      if (!emp) {
        setLoading(false);
        return;
      }
      
      // 2. الحصول على اسم الموظف
      const { data: empData } = await supabase
        .from('employees')
        .select('name, email')
        .eq('id', emp.id)
        .single();
      
      setEmployee({
        ...emp,
        name: empData?.name || 'موظف',
        email: empData?.email || ''
      });

      // 3. تحميل الإحصائيات
      await loadDashboardStats(emp);
      
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
      
      // 1. عدد العملاء (عام)
      const { count: totalClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

      // 2. عدد الوحدات المتاحة حسب الصلاحية
      let availableUnitsQuery = supabase
        .from('units')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'available');

      if (emp.role === 'sales') {
        // الحصول على المشاريع المسموح بها
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        
        if (allowedProjectIds.length > 0) {
          availableUnitsQuery = availableUnitsQuery.in('project_id', allowedProjectIds);
        } else {
          availableUnitsQuery = availableUnitsQuery.eq('project_id', 'no-projects');
        }
      }

      const { count: totalAvailableUnits } = await availableUnitsQuery;

      // 3. المتابعات الخاصة بالموظف الحالي (ضمن الفترة الزمنية)
      const { count: myFollowUps } = await supabase
        .from('client_followups')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', emp.id)
        .gte('created_at', startDate);

      // 4. الحجوزات الخاصة بالموظف الحالي
      const { count: myReservations } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', emp.id)
        .gte('created_at', startDate);

      // 5. التنفيذات الخاصة بالموظف الحالي
      const { count: mySales } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .eq('sales_employee_id', emp.id)
        .gte('created_at', startDate);

      // 6. إحصائيات الموظفين الآخرين (للأدمن فقط)
      let otherEmployeesStats = [];
      if (emp.role === 'admin') {
        const { data: allEmployees } = await supabase
          .from('employees')
          .select('id, name, role')
          .neq('id', emp.id)
          .eq('role', 'sales');

        for (const otherEmp of (allEmployees || [])) {
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
            totalActivity: (followUps || 0) + (reservations || 0) + (sales || 0)
          });
        }
      }

      // 7. توزيع العملاء حسب الحالة
      const { data: clientsByStatusData } = await supabase
        .from('clients')
        .select('status');

      const clientsByStatus = {
        lead: clientsByStatusData?.filter(c => c.status === 'lead').length || 0,
        reserved: clientsByStatusData?.filter(c => c.status === 'reserved').length || 0,
        converted: clientsByStatusData?.filter(c => c.status === 'converted').length || 0,
        visited: clientsByStatusData?.filter(c => c.status === 'visited').length || 0
      };

      // 8. توزيع الوحدات حسب الحالة
      const { data: unitsByStatusData } = await supabase
        .from('units')
        .select('status');

      const unitsByStatus = {
        available: unitsByStatusData?.filter(u => u.status === 'available').length || 0,
        reserved: unitsByStatusData?.filter(u => u.status === 'reserved').length || 0,
        sold: unitsByStatusData?.filter(u => u.status === 'sold').length || 0
      };

      // 9. حساب المتوسطات
      const { data: allSalesEmployees } = await supabase
        .from('employees')
        .select('id')
        .eq('role', 'sales');

      const employeeCount = allSalesEmployees?.length || 1;
      
      const totalFollowUps = otherEmployeesStats.reduce((sum, emp) => sum + emp.followUps, myFollowUps || 0);
      const totalReservations = otherEmployeesStats.reduce((sum, emp) => sum + emp.reservations, myReservations || 0);
      const totalSales = otherEmployeesStats.reduce((sum, emp) => sum + emp.sales, mySales || 0);

      // 10. حساب معدلات التحويل
      const conversionRate = totalClients && totalSales 
        ? Math.round((totalSales / totalClients) * 100) 
        : 0;
      
      const reservationToSaleRate = totalReservations && totalSales
        ? Math.round((totalSales / totalReservations) * 100)
        : 0;

      // 11. تجميع كل الإحصائيات
      const dashboardStats: DashboardStats = {
        totalClients: totalClients || 0,
        totalAvailableUnits: totalAvailableUnits || 0,
        
        myFollowUps: myFollowUps || 0,
        myReservations: myReservations || 0,
        mySales: mySales || 0,
        
        otherEmployeesStats,
        
        clientsByStatus,
        unitsByStatus,
        
        avgFollowUpsPerEmployee: Math.round(totalFollowUps / employeeCount),
        avgReservationsPerEmployee: Math.round(totalReservations / employeeCount),
        avgSalesPerEmployee: Math.round(totalSales / employeeCount),
        
        conversionRate,
        reservationToSaleRate
      };

      setStats(dashboardStats);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  }

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
        return '1970-01-01'; // بداية الوقت
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
              مرحباً {employee?.name} ({employee?.role === 'admin' ? 'مدير' : 'مندوب مبيعات'})
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
                  الوحدات المتاحة {employee?.role === 'sales' && '(مشاريعك)'}
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
              {employee?.role === 'admin' ? 'كل المشاريع' : 'المشاريع المرتبطة بك فقط'}
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
                  width: `${Math.min((stats?.myFollowUps || 0) * 10, 100)}%`, 
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
          <Card title="توزيع الوحدات">
            <div style={{ padding: '15px' }}>
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
                    width: `${(stats?.unitsByStatus.available || 0) / ((stats?.unitsByStatus.available || 0) + (stats?.unitsByStatus.reserved || 0) + (stats?.unitsByStatus.sold || 0)) * 100}%`, 
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
                    width: `${(stats?.unitsByStatus.reserved || 0) / ((stats?.unitsByStatus.available || 0) + (stats?.unitsByStatus.reserved || 0) + (stats?.unitsByStatus.sold || 0)) * 100}%`, 
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
                    width: `${(stats?.unitsByStatus.sold || 0) / ((stats?.unitsByStatus.available || 0) + (stats?.unitsByStatus.reserved || 0) + (stats?.unitsByStatus.sold || 0)) * 100}%`, 
                    height: '8px', 
                    backgroundColor: '#34a853',
                    borderRadius: '4px'
                  }} />
                </div>
              </div>
            </div>
          </Card>

          {/* أداء الموظفين الآخرين (للأدمن فقط) */}
          {employee?.role === 'admin' && stats?.otherEmployeesStats && stats.otherEmployeesStats.length > 0 && (
            <Card title="أداء فريق المبيعات">
              <div style={{ padding: '15px' }}>
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
                
                {stats.otherEmployeesStats.map(empStat => {
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
                  المتوسط: {stats.avgFollowUpsPerEmployee} متابعة | {stats.avgReservationsPerEmployee} حجز | {stats.avgSalesPerEmployee} تنفيذ
                </div>
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
          {/* رسوم بيانية بسيطة */}
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
                    width: `${Math.min((stats?.myFollowUps || 0) * 20, 100)}%`, 
                    backgroundColor: '#1a73e8' 
                  }} />
                  <div style={{ 
                    width: `${Math.min((stats?.avgFollowUpsPerEmployee || 0) * 20, 100 - Math.min((stats?.myFollowUps || 0) * 20, 100))}%`, 
                    backgroundColor: '#c2e0ff' 
                  }} />
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
                    width: `${Math.min((stats?.myReservations || 0) * 20, 100)}%`, 
                    backgroundColor: '#fbbc04' 
                  }} />
                  <div style={{ 
                    width: `${Math.min((stats?.avgReservationsPerEmployee || 0) * 20, 100 - Math.min((stats?.myReservations || 0) * 20, 100))}%`, 
                    backgroundColor: '#ffeaa7' 
                  }} />
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
                    width: `${Math.min((stats?.mySales || 0) * 20, 100)}%`, 
                    backgroundColor: '#34a853' 
                  }} />
                  <div style={{ 
                    width: `${Math.min((stats?.avgSalesPerEmployee || 0) * 20, 100 - Math.min((stats?.mySales || 0) * 20, 100))}%`, 
                    backgroundColor: '#a8e6a8' 
                  }} />
                </div>
              </div>
            </div>
          </Card>

          {/* أزرار سريعة */}
          <Card title="إجراءات سريعة">
            <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Button 
                onClick={() => router.push('/dashboard/clients')}
                style={{ justifyContent: 'flex-start', padding: '12px' }}
              >
                <span style={{ marginRight: '10px' }}>👥</span> إدارة العملاء
              </Button>
              
              <Button 
                onClick={() => router.push('/dashboard/units')}
                style={{ justifyContent: 'flex-start', padding: '12px' }}
              >
                <span style={{ marginRight: '10px' }}>🏠</span> إدارة الوحدات
              </Button>
              
              <Button 
                onClick={() => router.push('/dashboard/projects')}
                style={{ justifyContent: 'flex-start', padding: '12px' }}
              >
                <span style={{ marginRight: '10px' }}>📋</span> إدارة المشاريع
              </Button>
              
              <Button 
                onClick={() => router.push('/dashboard/reservations')}
                style={{ justifyContent: 'flex-start', padding: '12px' }}
              >
                <span style={{ marginRight: '10px' }}>📅</span> الحجوزات
              </Button>
              
              <Button 
                onClick={() => router.push('/dashboard/sales')}
                style={{ justifyContent: 'flex-start', padding: '12px' }}
              >
                <span style={{ marginRight: '10px' }}>💰</span> التنفيذات
              </Button>
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
                backgroundColor: employee?.role === 'admin' ? '#e6f4ea' : '#e8f0fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '15px'
              }}>
                <span style={{ fontSize: '20px' }}>{employee?.role === 'admin' ? '👨‍💼' : '👤'}</span>
              </div>
              <div>
                <div style={{ fontWeight: 'bold' }}>{employee?.name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {employee?.role === 'admin' ? 'مدير النظام' : 'مندوب مبيعات'} | {employee?.email}
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
                  {stats?.myFollowUps && stats.myReservations 
                    ? Math.round((stats.myReservations / stats.myFollowUps) * 100) 
                    : 0}%
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>من المتابعات تتحول لحجوزات</div>
              </div>
              
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '15px', 
                borderRadius: '8px',
                borderLeft: '4px solid #fbbc04'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>معدل الإنجاز</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {stats?.myReservations && stats.mySales 
                    ? Math.round((stats.mySales / stats.myReservations) * 100) 
                    : 0}%
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>من الحجوزات تتحول لتنفيذات</div>
              </div>
              
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '15px', 
                borderRadius: '8px',
                borderLeft: '4px solid #34a853'
              }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>قيمة التنفيذات</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {stats?.mySales || 0}
                </div>
                <div style={{ fontSize: '11px', color: '#666' }}>وحدات تم بيعها</div>
              </div>
            </div>
            
            <div style={{ marginTop: '20px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
              آخر تحديث: {new Date().toLocaleString('ar-SA')} | الفترة: {timeRange === 'today' ? 'اليوم' : timeRange === 'week' ? 'آخر أسبوع' : timeRange === 'month' ? 'آخر شهر' : 'الكل'}
            </div>
          </div>
        </Card>

      </div>
    </RequireAuth>
  );
}