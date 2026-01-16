'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
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
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  useEffect(() => {
    fetchEmployees();
  }, []);

  async function fetchEmployees() {
    const { data } = await supabase
      .from('employees')
      .select('id,name,job_title,mobile,email,status')
      .order('created_at', { ascending: false });

    setEmployees((data as Employee[]) || []);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setJobTitle('');
    setMobile('');
    setEmail('');
    setStatus('active');
  }

  async function handleSubmit() {
    if (!name || !email) {
      alert('الاسم والإيميل مطلوبين');
      return;
    }

    setLoading(true);

    if (editingId) {
      const { error } = await supabase
        .from('employees')
        .update({
          name,
          job_title: jobTitle || null,
          mobile: mobile || null,
          email,
          status,
        })
        .eq('id', editingId);

      if (error) alert(error.message);
    } else {
      const { error } = await supabase.from('employees').insert({
        name,
        job_title: jobTitle || null,
        mobile: mobile || null,
        email,
        status,
        password_hash: 'temp', // للتجربة فقط
      });

      if (error) alert(error.message);
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
  }

  async function deleteEmployee(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;

    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) alert(error.message);

    fetchEmployees();
  }

  return (
    <div className="page">
      {/* Add / Edit */}
      <Card title={editingId ? 'تعديل موظف' : 'إضافة موظف'}>
        <div className="form-col">
          <Input placeholder="اسم الموظف" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="المسمى الوظيفي" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          <Input placeholder="رقم الجوال" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          <Input placeholder="الإيميل (لازم يطابق auth)" value={email} onChange={(e) => setEmail(e.target.value)} />

          <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleSubmit} disabled={loading}>
              {editingId ? 'تعديل' : 'حفظ'}
            </Button>

            {editingId && (
              <Button onClick={resetForm}>
                إلغاء
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* List */}
      <Card title="قائمة الموظفين">
        <Table headers={['الاسم', 'الوظيفة', 'الجوال', 'الإيميل', 'الحالة', 'إجراء']}>
          {employees.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>{e.job_title || '-'}</td>
              <td>{e.mobile || '-'}</td>
              <td>{e.email}</td>
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