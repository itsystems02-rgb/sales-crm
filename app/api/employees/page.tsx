'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

type Employee = {
  id: string;
  name: string;
  job_title: string | null;
  mobile: string | null;
  email: string;
  status: 'active' | 'inactive';
  role: 'admin' | 'sales' | 'sales_manager'; // ← أضفنا sales_manager
};

// وظيفة لتحويل role code إلى نص عربي
const getRoleLabel = (role: Employee['role']): string => {
  switch (role) {
    case 'admin': return 'مدير نظام';
    case 'sales_manager': return 'مدير مبيعات';
    case 'sales': return 'مندوب مبيعات';
    default: return role;
  }
};

export default function EmployeesPage() {
  const router = useRouter();

  /* =========================
     STATE
  ========================= */
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [role, setRole] = useState<'admin' | 'sales' | 'sales_manager'>('sales'); // ← تحديث القيمة الافتراضية

  /* =========================
     ACCESS CONTROL
  ========================= */
  useEffect(() => {
    init();
  }, []);

  async function init() {
    const emp = await getCurrentEmployee();

    if (!emp) {
      router.push('/login');
      return;
    }

    // السماح فقط للمديرين (admin) بالوصول
    if (emp.role !== 'admin') {
      alert('غير مسموح لك بالدخول. هذه الصفحة للمديرين فقط.');
      router.push('/dashboard');
      return;
    }

    await fetchEmployees();
    setCheckingAccess(false);
  }

  /* =========================
     DATA
  ========================= */
  async function fetchEmployees() {
    const { data, error } = await supabase
      .from('employees')
      .select('id,name,job_title,mobile,email,status,role')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching employees:', error);
      return;
    }

    setEmployees((data as Employee[]) || []);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setJobTitle('');
    setMobile('');
    setEmail('');
    setPassword('');
    setStatus('active');
    setRole('sales');
  }

  /* =========================
     SUBMIT
  ========================= */
  async function handleSubmit() {
    // التحقق من البيانات المطلوبة
    if (!name.trim()) {
      alert('الاسم مطلوب');
      return;
    }

    if (!email.trim()) {
      alert('الإيميل مطلوب');
      return;
    }

    if (!editingId && !password.trim()) {
      alert('كلمة المرور مطلوبة');
      return;
    }

    // التحقق من صحة الإيميل (بسيط)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('صيغة الإيميل غير صحيحة');
      return;
    }

    setLoading(true);

    try {
      if (editingId) {
        // تحديث موظف موجود
        const { error } = await supabase
          .from('employees')
          .update({
            name: name.trim(),
            job_title: jobTitle.trim() || null,
            mobile: mobile.trim() || null,
            email: email.trim(),
            status,
            role,
          })
          .eq('id', editingId);

        if (error) throw error;
        
        alert('تم تعديل الموظف بنجاح');
      } else {
        // إنشاء موظف جديد
        const res = await fetch('/api/employees/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            password: password.trim(),
            job_title: jobTitle.trim(),
            mobile: mobile.trim(),
            role,
          }),
        });

        const result = await res.json();
        
        if (!res.ok) {
          throw new Error(result.error || 'حدث خطأ أثناء إنشاء الموظف');
        }
        
        alert('تم إنشاء الموظف بنجاح');
      }

      resetForm();
      await fetchEmployees();
    } catch (error: any) {
      console.error('Error saving employee:', error);
      alert(error.message || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(e: Employee) {
    setEditingId(e.id);
    setName(e.name);
    setJobTitle(e.job_title || '');
    setMobile(e.mobile || '');
    setEmail(e.email);
    setStatus(e.status);
    setRole(e.role);
    setPassword('');
  }

  async function deleteEmployee(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الموظف؟ لا يمكن التراجع عن هذا الإجراء.')) return;

    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      alert('تم حذف الموظف بنجاح');
      await fetchEmployees();
    } catch (error: any) {
      console.error('Error deleting employee:', error);
      alert(error.message || 'حدث خطأ أثناء حذف الموظف');
    }
  }

  /* =========================
     LOADING
  ========================= */
  if (checkingAccess) {
    return (
      <div className="app-layout">
        <Sidebar />
        <div className="dashboard-content">
          <Header />
          <div className="content">
            <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
              <div className="text-center">
                <div className="spinner"></div>
                <p className="mt-3">جاري التحقق من الصلاحيات...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* =========================
     UI
  ========================= */
  return (
    <div className="app-layout">
      {/* ===== SIDEBAR ===== */}
      <Sidebar />

      {/* ===== MAIN ===== */}
      <div className="dashboard-content">
        <Header />

        <div className="content">
          <div className="page">

            {/* ===== FORM ===== */}
            <Card title={editingId ? 'تعديل موظف' : 'إضافة موظف جديد'}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">اسم الموظف *</label>
                  <Input
                    placeholder="أدخل اسم الموظف"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">المسمى الوظيفي</label>
                  <Input
                    placeholder="أدخل المسمى الوظيفي"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">رقم الجوال</label>
                  <Input
                    placeholder="أدخل رقم الجوال"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">البريد الإلكتروني *</label>
                  <Input
                    type="email"
                    placeholder="example@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {!editingId && (
                  <div className="form-group">
                    <label className="form-label">كلمة المرور *</label>
                    <Input
                      type="password"
                      placeholder="أدخل كلمة مرور قوية"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">الدور *</label>
                  <select 
                    className="form-select"
                    value={role} 
                    onChange={(e) => setRole(e.target.value as Employee['role'])}
                  >
                    <option value="sales">مندوب مبيعات</option>
                    <option value="sales_manager">مدير مبيعات</option>
                    <option value="admin">مدير نظام</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">الحالة *</label>
                  <select 
                    className="form-select"
                    value={status} 
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                  >
                    <option value="active">نشط</option>
                    <option value="inactive">غير نشط</option>
                  </select>
                </div>

                <div className="form-group col-span-2" style={{ gridColumn: 'span 2' }}>
                  <div className="flex gap-3 mt-4">
                    <Button 
                      onClick={handleSubmit} 
                      disabled={loading}
                      className="btn-primary"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <span className="spinner-small"></span>
                          {editingId ? 'جاري التعديل...' : 'جاري الحفظ...'}
                        </span>
                      ) : (
                        editingId ? 'تحديث الموظف' : 'إضافة الموظف'
                      )}
                    </Button>

                    {editingId && (
                      <Button 
                        onClick={resetForm}
                        className="btn-secondary"
                      >
                        إلغاء التعديل
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* ===== TABLE ===== */}
            <Card title="قائمة الموظفين">
              <div className="table-responsive">
                <Table headers={['الاسم', 'الوظيفة', 'الجوال', 'الإيميل', 'الدور', 'الحالة', 'الإجراءات']}>
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        لا يوجد موظفين لعرضهم
                      </td>
                    </tr>
                  ) : (
                    employees.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="font-medium">{e.name}</td>
                        <td>{e.job_title || '-'}</td>
                        <td dir="ltr">{e.mobile || '-'}</td>
                        <td dir="ltr" className="text-blue-600">{e.email}</td>
                        <td>
                          <span className={`badge ${e.role}`}>
                            {getRoleLabel(e.role)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${e.status}`}>
                            {e.status === 'active' ? 'نشط' : 'غير نشط'}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <Button 
                              onClick={() => startEdit(e)}
                              className="btn-sm btn-edit"
                            >
                              تعديل
                            </Button>
                            
                            <Button
                              onClick={() =>
                                router.push(`/dashboard/employees/${e.id}/projects`)
                              }
                              className="btn-sm btn-info"
                            >
                              المشاريع
                            </Button>

                            <button
                              className="btn-sm btn-danger"
                              onClick={() => deleteEmployee(e.id)}
                              disabled={e.role === 'admin'} // منع حذف المديرين
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </Table>
              </div>
              
              {employees.length > 0 && (
                <div className="mt-4 text-sm text-gray-500">
                  <p>عدد الموظفين: <span className="font-bold">{employees.length}</span></p>
                </div>
              )}
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}