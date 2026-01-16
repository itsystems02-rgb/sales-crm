'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

type Project = {
  id: string;
  name: string;
  code: string;
  location: string | null;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');

  /* =========================
     LOAD
  ========================= */
  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setProjects(data || []);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  /* =========================
     RESET FORM
  ========================= */
  function resetForm() {
    setEditingId(null);
    setName('');
    setCode('');
    setLocation('');
  }

  /* =========================
     ADD / UPDATE
  ========================= */
  async function handleSubmit() {
    if (!name.trim() || !code.trim()) {
      alert('اسم المشروع والكود مطلوبين');
      return;
    }

    setLoading(true);

    if (editingId) {
      // update
      const { error } = await supabase
        .from('projects')
        .update({
          name: name.trim(),
          code: code.trim(),
          location: location.trim() || null,
        })
        .eq('id', editingId);

      if (error) alert(error.message);
    } else {
      // insert
      const { error } = await supabase.from('projects').insert({
        name: name.trim(),
        code: code.trim(),
        location: location.trim() || null,
      });

      if (error) alert(error.message);
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

  /* =========================
     DELETE (WITH CHECK)
  ========================= */
  async function deleteProject(id: string) {
    const ok = confirm('هل أنت متأكد من حذف المشروع؟');
    if (!ok) return;

    setDeletingId(id);

    // 🔒 تحقق هل فيه وحدات مربوطة بالمشروع
    const { count, error: countError } = await supabase
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id);

    if (countError) {
      alert(countError.message);
      setDeletingId(null);
      return;
    }

    if ((count || 0) > 0) {
      alert('لا يمكن حذف مشروع مرتبط بوحدات');
      setDeletingId(null);
      return;
    }

    // حذف فعلي
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    setDeletingId(null);

    if (error) {
      alert(error.message);
      return;
    }

    loadProjects();
  }

  /* =========================
     UI
  ========================= */
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
              {loading ? 'جاري الحفظ...' : editingId ? 'تعديل' : 'حفظ'}
            </Button>

            {editingId && (
              <Button onClick={resetForm}>
                إلغاء
              </Button>
            )}
          </div>
        </Card>

        {/* List */}
        <Card title="قائمة المشاريع">
          <Table headers={['اسم المشروع', 'الكود', 'الموقع', 'إجراء']}>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={4}>لا توجد مشاريع</td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.code}</td>
                  <td>{p.location || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button onClick={() => startEdit(p)}>
                        تعديل
                      </Button>

                      <Button
                        variant="danger"
                        disabled={deletingId === p.id}
                        onClick={() => deleteProject(p.id)}
                      >
                        {deletingId === p.id ? '...' : 'حذف'}
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