'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */

type Project = {
  id: string;
  name: string;
  code: string;
  location: string | null;
};

type Employee = {
  id: string;
  role: 'admin' | 'sales';
};

/* =====================
   Page
===================== */

export default function ProjectsPage() {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form (admin فقط)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');

  /* =====================
     LOAD
  ===================== */

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const emp = await getCurrentEmployee();

    if (!emp) {
      router.push('/login');
      return;
    }

    setEmployee(emp);
    await loadProjects(emp);
  }

  async function loadProjects(emp: Employee) {
    setLoading(true);

    // 👑 admin → كل المشاريع
    if (emp.role === 'admin') {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      setProjects(data || []);
      setLoading(false);
      return;
    }

    // 🧑‍💻 sales → المشاريع المسموح بها فقط
    const { data: rows } = await supabase
      .from('employee_projects')
      .select('project:projects(id,name,code,location)')
      .eq('employee_id', emp.id);

    const allowedProjects =
      rows?.map((r: any) => r.project).filter(Boolean) || [];

    setProjects(allowedProjects);
    setLoading(false);
  }

  /* =====================
     FORM (admin فقط)
  ===================== */

  function resetForm() {
    setEditingId(null);
    setName('');
    setCode('');
    setLocation('');
  }

  async function handleSubmit() {
    if (!name.trim() || !code.trim()) {
      alert('اسم المشروع والكود مطلوبين');
      return;
    }

    setLoading(true);

    if (editingId) {
      await supabase
        .from('projects')
        .update({
          name: name.trim(),
          code: code.trim(),
          location: location.trim() || null,
        })
        .eq('id', editingId);
    } else {
      await supabase.from('projects').insert({
        name: name.trim(),
        code: code.trim(),
        location: location.trim() || null,
      });
    }

    setLoading(false);
    resetForm();
    if (employee) loadProjects(employee);
  }

  function startEdit(p: Project) {
    setEditingId(p.id);
    setName(p.name);
    setCode(p.code);
    setLocation(p.location || '');
  }

  async function deleteProject(id: string) {
    if (!confirm('هل أنت متأكد من حذف المشروع؟')) return;

    const { count } = await supabase
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id);

    if ((count || 0) > 0) {
      alert('لا يمكن حذف مشروع مرتبط بوحدات');
      return;
    }

    setDeletingId(id);
    await supabase.from('projects').delete().eq('id', id);
    setDeletingId(null);

    if (employee) loadProjects(employee);
  }

  /* =====================
     UI
  ===================== */

  return (
    <RequireAuth>
      <div className="page">

        {/* 👑 الفورم يظهر للـ admin فقط */}
        {employee?.role === 'admin' && (
          <Card title={editingId ? 'تعديل مشروع' : 'إضافة مشروع'}>
            <div className="form-row">
              <Input
                placeholder="اسم المشروع"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                placeholder="كود المشروع"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Input
                placeholder="الموقع"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />

              <Button onClick={handleSubmit} disabled={loading}>
                {editingId ? 'تعديل' : 'حفظ'}
              </Button>

              {editingId && <Button onClick={resetForm}>إلغاء</Button>}
            </div>
          </Card>
        )}

        {/* ===== LIST ===== */}
        <Card title="قائمة المشاريع">
          <Table headers={['اسم المشروع', 'الكود', 'الموقع', 'إجراء']}>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center' }}>
                  لا توجد مشاريع
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id}>
                  <td data-label="اسم المشروع">{p.name}</td>
                  <td data-label="الكود">{p.code}</td>
                  <td data-label="الموقع">{p.location || '-'}</td>
                  <td data-label="إجراء">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>

                      {/* 👑 أزرار admin فقط */}
                      {employee?.role === 'admin' && (
                        <>
                          <Button onClick={() => startEdit(p)}>تعديل</Button>

                          <Button
                            onClick={() =>
                              router.push(`/dashboard/projects/${p.id}/models`)
                            }
                          >
                            النماذج
                          </Button>

                          <Button
                            variant="danger"
                            disabled={deletingId === p.id}
                            onClick={() => deleteProject(p.id)}
                          >
                            حذف
                          </Button>
                        </>
                      )}

                      {/* 🧑‍💻 sales → مفيش أزرار */}
                      {employee?.role === 'sales' && <span>-</span>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </Table>
        </Card>
      </div>
    </RequireAuth>
  );
}