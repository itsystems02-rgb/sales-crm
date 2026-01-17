'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */

type Model = {
  id: string;
  name: string;
  code: string | null;
};

/* =====================
   Page
===================== */

export default function ProjectModelsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  /* =====================
     LOAD
  ===================== */

  useEffect(() => {
    loadModels();
  }, [projectId]);

  async function loadModels() {
    const { data } = await supabase
      .from('project_models')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');

    setModels(data || []);
  }

  /* =====================
     FORM
  ===================== */

  function resetForm() {
    setEditingId(null);
    setName('');
    setCode('');
  }

  async function handleSubmit() {
    if (!name.trim()) {
      alert('اسم النموذج مطلوب');
      return;
    }

    setLoading(true);

    if (editingId) {
      await supabase
        .from('project_models')
        .update({
          name: name.trim(),
          code: code.trim() || null,
        })
        .eq('id', editingId);
    } else {
      await supabase.from('project_models').insert({
        project_id: projectId,
        name: name.trim(),
        code: code.trim() || null,
      });
    }

    setLoading(false);
    resetForm();
    loadModels();
  }

  function startEdit(m: Model) {
    setEditingId(m.id);
    setName(m.name);
    setCode(m.code || '');
  }

  async function deleteModel(id: string) {
    if (!confirm('هل أنت متأكد من حذف النموذج؟')) return;

    await supabase.from('project_models').delete().eq('id', id);
    loadModels();
  }

  /* =====================
     UI
  ===================== */

  return (
    <RequireAuth>
      <div className="page">
        {/* Add / Edit */}
        <Card title={editingId ? 'تعديل نموذج' : 'إضافة نموذج'}>
          <div className="form-row">
            <Input
              placeholder="اسم النموذج (A / B / 1 / 2)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Input
              placeholder="كود النموذج (اختياري)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />

            <Button onClick={handleSubmit} disabled={loading}>
              {editingId ? 'تعديل' : 'حفظ'}
            </Button>

            {editingId && <Button onClick={resetForm}>إلغاء</Button>}
          </div>
        </Card>

        {/* List */}
        <Card title="نماذج المشروع">
          <Table headers={['اسم النموذج', 'الكود', 'إجراء']}>
            {models.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center' }}>
                  لا توجد نماذج
                </td>
              </tr>
            ) : (
              models.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.code || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button onClick={() => startEdit(m)}>تعديل</Button>
                      <Button variant="danger" onClick={() => deleteModel(m.id)}>
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