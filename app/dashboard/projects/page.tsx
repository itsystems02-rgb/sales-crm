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
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setProjects(data || []);
  }

  async function addProject() {
    if (!name.trim() || !code.trim()) {
      alert('اسم المشروع والكود مطلوبين');
      return;
    }

    setLoading(true);

    const { error } = await supabase.from('projects').insert([
      {
        name: name.trim(),
        code: code.trim(),
        location: location.trim() || null,
      },
    ]);

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setName('');
    setCode('');
    setLocation('');
    loadProjects();
  }

  async function deleteProject(id: string) {
    const ok = confirm('هل أنت متأكد من حذف المشروع؟');
    if (!ok) return;

    setDeletingId(id);
    const { error } = await supabase.from('projects').delete().eq('id', id);
    setDeletingId(null);

    if (error) {
      alert(error.message);
      return;
    }

    loadProjects();
  }

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <RequireAuth>
      <div className="page">
        {/* إضافة مشروع */}
        <Card title="إضافة مشروع">
          <div className="form-row">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم المشروع"
            />
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="كود المشروع"
            />
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="الموقع"
            />
            <Button onClick={addProject} disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </Card>

        {/* قائمة المشاريع */}
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
                    <Button
                      variant="danger"
                      disabled={deletingId === p.id}
                      onClick={() => deleteProject(p.id)}
                    >
                      {deletingId === p.id ? '...' : 'حذف'}
                    </Button>
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