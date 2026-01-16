'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

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
  role: 'admin' | 'sales';
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
  const [role, setRole] = useState<'admin' | 'sales'>('sales');

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

    if (emp.role !== 'admin') {
      alert('غير مسموح لك بالدخول');
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
    const { data } = await supabase
      .from('employees')
      .select('id,name,job_title,mobile,email,status,role')
      .order('created_at', { ascending: false });

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
    if (!name || !email || (!editingId && !password)) {
      alert('الاسم والإيميل وكلمة المرور مطلوبة');
      return;
    }

    setLoading(true);

    if (editingId) {
      // تعديل موظف
      const { error } = await supabase
        .from('employees')
        .update({
          name,
          job_title: jobTitle || null,
          mobile: mobile || null,
          email,
          status,
          role,
        })
        .eq('id', editingId);

      if (error) alert(error.message);
    } else {
      // إنشاء موظف + auth
      const res = await fetch('/api/employees/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          job_title: jobTitle,
          mobile,
          role,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        alert(result.error);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    resetForm();
    fetchEmployees();
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
    if (!confirm('هل أنت متأكد من الحذف؟')) return;

    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);

    if (error) alert(error.message);
    fetchEmployees();
  }

  /* =========================
     LOADING
  ========================= */
  if (checkingAccess) {
    return <div className="page">جاري التحقق من الصلاحيات...</div>;
  }

  /* =========================
     UI
  ========================= */
  return (
    <div className="page">
      <Card title={editingId ? 'تعديل موظف' : 'إضافة موظف'}>
        <div className="form-col">
          <Input placeholder="اسم الموظف" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="المسمى الوظيفي" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          <Input placeholder="رقم الجوال" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          <Input placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />

          {!editingId && (
            <Input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          <select value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="sales">مبيعات</option>
            <option value="admin">مدير</option>
          </select>

          <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleSubmit} disabled={loading}>
              {editingId ? 'تعديل' : 'حفظ'}
            </Button>
            {editingId && <Button onClick={resetForm}>إلغاء</Button>}
          </div>
        </div>
      </Card>

      <Card title="قائمة الموظفين">
        <Table headers={['الاسم', 'الوظيفة', 'الجوال', 'الإيميل', 'الدور', 'الحالة', 'إجراء']}>
          {employees.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>{e.job_title || '-'}</td>
              <td>{e.mobile || '-'}</td>
              <td>{e.email}</td>
              <td>{e.role === 'admin' ? 'مدير' : 'مبيعات'}</td>
              <td>{e.status === 'active' ? 'نشط' : 'غير نشط'}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button onClick={() => startEdit(e)}>تعديل</Button>
                  <button className="btn-danger" onClick={() => deleteEmployee(e.id)}>
                    حذف
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}