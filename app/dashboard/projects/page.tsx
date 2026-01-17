'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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

/* =====================
   Page
===================== */

export default function ProjectsPage() {
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');

  /* =====================
     LOAD
  ===================== */

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    setProjects(data || []);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  /* =====================
     FORM
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
    loadProjects();
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
    loadProjects();
  }

  /* =====================
     UI
  ===================== */

  return (
    <RequireAuth>
      <div className="page">
        {/* Add / Edit */}
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

        {/* List */}
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
                      <Button onClick={() => startEdit(p)}>تعديل</Button>

                      {/* زر النماذج */}
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