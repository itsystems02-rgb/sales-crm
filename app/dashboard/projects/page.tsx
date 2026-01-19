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
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form admin
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');

  /* =====================
     INIT
  ===================== */

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      console.log('=== INIT START ===');

      const emp = await getCurrentEmployee();
      console.log('Current employee (getCurrentEmployee):', emp);

      if (!emp) {
        console.warn('No employee found. Redirect should happen via RequireAuth');
        setLoading(false);
        return;
      }

      setEmployee(emp);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('Supabase session:', session, 'Session error:', sessionError);

      await loadProjects(emp);
      setLoading(false);
    } catch (err) {
      console.error('Error in init():', err);
      setLoading(false);
    }
  }

  /* =====================
     LOAD PROJECTS
  ===================== */

  async function loadProjects(emp: Employee) {
    try {
      console.log('Loading projects for employee:', emp);

      if (emp.role === 'admin') {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

        console.log('Admin projects data:', data, 'error:', error);
        setProjects(data || []);
        return;
      }

      // sales → المشاريع المربوطة بيه فقط
      const { data, error } = await supabase
        .from('employee_projects')
        .select(`
          project:projects (
            id,
            name,
            code,
            location
          )
        `)
        .eq('employee_id', emp.id);

      console.log('Sales raw projects data:', data, 'error:', error);

      const allowed = (data || [])
        .map((r: any) => r.project)
        .filter(Boolean);

      console.log('Sales allowed projects after map/filter:', allowed);

      setProjects(allowed);
    } catch (err) {
      console.error('Error loading projects:', err);
    }
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
    if (employee?.role !== 'admin') return;

    if (!name.trim() || !code.trim()) {
      alert('اسم المشروع والكود مطلوبين');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('projects')
          .update({
            name: name.trim(),
            code: code.trim(),
            location: location.trim() || null,
          })
          .eq('id', editingId);

        console.log('Update project error:', error);
      } else {
        const { error } = await supabase.from('projects').insert({
          name: name.trim(),
          code: code.trim(),
          location: location.trim() || null,
        });

        console.log('Insert project error:', error);
      }

      resetForm();
      if (employee) loadProjects(employee);
    } catch (err) {
      console.error('Error in handleSubmit():', err);
    }
  }

  function startEdit(p: Project) {
    if (employee?.role !== 'admin') return;

    setEditingId(p.id);
    setName(p.name);
    setCode(p.code);
    setLocation(p.location || '');
  }

  async function deleteProject(id: string) {
    if (employee?.role !== 'admin') return;

    try {
      const { count } = await supabase
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', id);

      if ((count || 0) > 0) {
        alert('لا يمكن حذف مشروع مرتبط بوحدات');
        return;
      }

      setDeletingId(id);
      const { error } = await supabase.from('projects').delete().eq('id', id);
      console.log('Delete project error:', error);
      setDeletingId(null);

      if (employee) loadProjects(employee);
    } catch (err) {
      console.error('Error in deleteProject():', err);
    }
  }

  /* =====================
     UI
  ===================== */

  return (
    <RequireAuth>
      <div className="page">
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

              <Button onClick={handleSubmit}>
                {editingId ? 'تعديل' : 'حفظ'}
              </Button>

              {editingId && <Button onClick={resetForm}>إلغاء</Button>}
            </div>
          </Card>
        )}

        <Card title="قائمة المشاريع">
          <Table headers={['اسم المشروع', 'الكود', 'الموقع', 'إجراء']}>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center' }}>
                  جاري التحميل...
                </td>
              </tr>
            ) : projects.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center' }}>
                  لا توجد مشاريع
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.code}</td>
                  <td>{p.location || '-'}</td>
                  <td>
                    <div className="actions">
                      {employee?.role === 'admin' ? (
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
                      ) : (
                        <span>-</span>
                      )}
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