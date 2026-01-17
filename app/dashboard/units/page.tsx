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

  // ✅ Supabase relations = ARRAY
  project: { name: string; code: string | null }[];
  model: { name: string }[];
};

type ProjectOption = { id: string; name: string; code: string | null };
type ModelOption = { id: string; name: string };

const UNIT_TYPES = [
  { value: 'villa', label: 'فيلا' },
  { value: 'duplex', label: 'دوبلكس' },
  { value: 'apartment', label: 'شقة' },
];

/* =====================
   Page
===================== */

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [unitCode, setUnitCode] = useState('');
  const [blockNo, setBlockNo] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [unitType, setUnitType] = useState<'villa' | 'duplex' | 'apartment'>('apartment');
  const [status, setStatus] = useState<'available' | 'reserved' | 'sold'>('available');
  const [price, setPrice] = useState('');
  const [landArea, setLandArea] = useState('');
  const [buildArea, setBuildArea] = useState('');

  const [projectId, setProjectId] = useState('');
  const [modelId, setModelId] = useState('');

  /* =====================
     LOAD DATA
  ===================== */

  useEffect(() => {
    loadUnits();
    loadProjects();
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
        project:project_id ( name, code ),
        model:model_id ( name )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setUnits([]);
    } else {
      setUnits(data || []);
    }

    setLoading(false);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name, code')
      .order('name');

    setProjects(data || []);
  }

  async function loadModels(pid: string) {
    const { data } = await supabase
      .from('project_models')
      .select('id, name')
      .eq('project_id', pid)
      .order('name');

    setModels(data || []);
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
     FORM
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
  }

  async function handleSubmit() {
    if (!unitCode || !projectId || !modelId) {
      alert('كل الحقول الأساسية مطلوبة');
      return;
    }

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

    if (editingId) {
      await supabase.from('units').update(payload).eq('id', editingId);
    } else {
      await supabase.from('units').insert(payload);
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
    if (u.status !== 'available') return;

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
        <Card title="إدارة الوحدات">
          <div className="form-row">
            <Input placeholder="كود الوحدة" value={unitCode} onChange={e => setUnitCode(e.target.value)} />
            <Input placeholder="رقم البلوك" value={blockNo} onChange={e => setBlockNo(e.target.value)} />
            <Input placeholder="رقم الوحدة" value={unitNo} onChange={e => setUnitNo(e.target.value)} />

            <select value={unitType} onChange={e => setUnitType(e.target.value as any)}>
              {UNIT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <Input type="number" placeholder="السعر" value={price} onChange={e => setPrice(e.target.value)} />

            <select value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">اختر المشروع</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.code ? `(${p.code})` : ''}
                </option>
              ))}
            </select>

            <select value={modelId} onChange={e => setModelId(e.target.value)} disabled={!projectId}>
              <option value="">اختر النموذج</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            <Button onClick={handleSubmit}>{editingId ? 'تعديل' : 'حفظ'}</Button>
          </div>
        </Card>

        <Card title="قائمة الوحدات">
          <Table headers={['الكود','المشروع','النموذج','الحالة','إجراء']}>
            {units.map(u => (
              <tr key={u.id}>
                <td>{u.unit_code}</td>
                <td>{u.project?.[0]?.name || '-'}</td>
                <td>{u.model?.[0]?.name || '-'}</td>
                <td>{u.status}</td>
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