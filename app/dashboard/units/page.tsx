'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */

type Unit = {
  id: string;
  project_id: string;
  model_id: string | null;

  unit_code: string;
  block_no: string | null;
  unit_no: string | null;

  unit_type: 'villa' | 'duplex' | 'apartment';
  status: 'available' | 'reserved' | 'sold';

  supported_price: number;
  land_area: number | null;
  build_area: number | null;

  // ✅ OBJECT مش Array
  project: {
    name: string;
    code: string | null;
  }[] | null;

  model: {
    name: string;
  }[] | null;
};

type ProjectOption = { id: string; name: string; code: string | null };
type ModelOption = { id: string; name: string };

const UNIT_TYPES = [
  { value: 'villa', label: 'فيلا' },
  { value: 'duplex', label: 'دوبلكس' },
  { value: 'apartment', label: 'شقة' },
];

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [unitCode, setUnitCode] = useState('');
  const [blockNo, setBlockNo] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [unitType, setUnitType] =
    useState<'villa' | 'duplex' | 'apartment'>('apartment');
  const [status, setStatus] =
    useState<'available' | 'reserved' | 'sold'>('available');
  const [price, setPrice] = useState('');
  const [landArea, setLandArea] = useState('');
  const [buildArea, setBuildArea] = useState('');
  const [projectId, setProjectId] = useState('');
  const [modelId, setModelId] = useState('');

  /* =====================
     LOAD
  ===================== */

  useEffect(() => {
    loadProjects();
    loadUnits();
  }, []);

  async function loadUnits() {
    setLoading(true);

    const { data, error } = await supabase
      .from('units')
      .select(`
        id,
        project_id,
        model_id,
        unit_code,
        block_no,
        unit_no,
        unit_type,
        status,
        supported_price,
        land_area,
        build_area,
        project:projects (
          name,
          code
        ),
        model:project_models (
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setUnits([]);
    } else {
      setUnits((data || []) as Unit[]);
    }

    setLoading(false);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name, code')
      .order('name');

    setProjects((data || []) as ProjectOption[]);
  }

  async function loadModels(projectIdValue: string) {
    const { data } = await supabase
      .from('project_models')
      .select('id, name')
      .eq('project_id', projectIdValue)
      .order('name');

    setModels((data || []) as ModelOption[]);
  }

  useEffect(() => {
    if (!projectId) {
      setModels([]);
      setModelId('');
      return;
    }
    loadModels(projectId);
    setModelId('');
  }, [projectId]);

  /* =====================
     HELPERS
  ===================== */

  function resetForm() {
    setEditingId(null);
    setUnitCode('');
    setBlockNo('');
    setUnitNo('');
    setUnitType('apartment');
    setStatus('available');
    setPrice('');
    setLandArea('');
    setBuildArea('');
    setProjectId('');
    setModelId('');
    setModels([]);
  }

  function renderStatus(s: Unit['status']) {
    if (s === 'available') return 'متاحة';
    if (s === 'reserved') return 'محجوزة';
    return 'مباعة';
  }

  function renderType(t: Unit['unit_type']) {
    if (t === 'villa') return 'فيلا';
    if (t === 'duplex') return 'دوبلكس';
    return 'شقة';
  }

  /* =====================
     SUBMIT
  ===================== */

  async function handleSubmit() {
    if (!unitCode || !projectId || !modelId || !price) {
      alert('من فضلك أكمل كل البيانات');
      return;
    }

    setSaving(true);

    const payload = {
      unit_code: unitCode,
      block_no: blockNo || null,
      unit_no: unitNo || null,
      unit_type: unitType,
      status,
      supported_price: Number(price),
      land_area: landArea ? Number(landArea) : null,
      build_area: buildArea ? Number(buildArea) : null,
      project_id: projectId,
      model_id: modelId,
    };

    const res = editingId
      ? await supabase.from('units').update(payload).eq('id', editingId)
      : await supabase.from('units').insert(payload);

    setSaving(false);

    if (res.error) {
      alert(res.error.message);
      return;
    }

    resetForm();
    loadUnits();
  }

  async function startEdit(u: Unit) {
    setEditingId(u.id);
    setUnitCode(u.unit_code);
    setBlockNo(u.block_no || '');
    setUnitNo(u.unit_no || '');
    setUnitType(u.unit_type);
    setStatus(u.status);
    setPrice(String(u.supported_price));
    setLandArea(u.land_area ? String(u.land_area) : '');
    setBuildArea(u.build_area ? String(u.build_area) : '');
    setProjectId(u.project_id);
    await loadModels(u.project_id);
    setModelId(u.model_id || '');
  }

  async function deleteUnit(u: Unit) {
    if (u.status !== 'available') {
      alert('لا يمكن حذف وحدة محجوزة أو مباعة');
      return;
    }

    if (!confirm('هل أنت متأكد؟')) return;

    setDeletingId(u.id);
    await supabase.from('units').delete().eq('id', u.id);
    setDeletingId(null);
    loadUnits();
  }

  /* =====================
     UI
  ===================== */

  return (
    <RequireAuth>
      <div className="page">
        <Card title={editingId ? 'تعديل وحدة' : 'إضافة وحدة'}>
          <div className="form-row">
            <Input placeholder="كود الوحدة" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} />
            <Input placeholder="رقم البلوك" value={blockNo} onChange={(e) => setBlockNo(e.target.value)} />
            <Input placeholder="رقم الوحدة" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} />

            <select value={unitType} onChange={(e) => setUnitType(e.target.value as any)}>
              {UNIT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <Input type="number" placeholder="مساحة الأرض" value={landArea} onChange={(e) => setLandArea(e.target.value)} />
            <Input type="number" placeholder="مسطح البناء" value={buildArea} onChange={(e) => setBuildArea(e.target.value)} />
            <Input type="number" placeholder="السعر" value={price} onChange={(e) => setPrice(e.target.value)} />

            <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="available">متاحة</option>
              <option value="reserved">محجوزة</option>
              <option value="sold">مباعة</option>
            </select>

            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">اختر المشروع</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.code ? ` (${p.code})` : ''}
                </option>
              ))}
            </select>

            <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!projectId}>
              <option value="">اختر النموذج</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'جاري الحفظ...' : editingId ? 'تعديل' : 'إضافة'}
            </Button>

            {editingId && <Button variant="danger" onClick={resetForm}>إلغاء</Button>}
          </div>
        </Card>

        <Card title="قائمة الوحدات">
          <Table headers={['الكود','النوع','الحالة','الأرض','البناء','السعر','المشروع','النموذج','إجراء']}>
            {units.map(u => (
              <tr key={u.id}>
                <td>{u.unit_code}</td>
                <td>{renderType(u.unit_type)}</td>
                <td>{renderStatus(u.status)}</td>
                <td>{u.land_area ?? '-'}</td>
                <td>{u.build_area ?? '-'}</td>
                <td>{u.supported_price.toLocaleString()}</td>
               <td>
  {u.project?.[0]
    ? `${u.project[0].name}${u.project[0].code ? ` (${u.project[0].code})` : ''}`
    : '-'}
</td>
                <td>{u.model?.[0]?.name || '-'}</td>
                <td>
                  <Button onClick={() => startEdit(u)}>تعديل</Button>
                  <Button variant="danger" onClick={() => deleteUnit(u)}>حذف</Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </RequireAuth>
  );
}