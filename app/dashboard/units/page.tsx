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

  // ✅ هنا Object مش Array
  project: { name: string; code: string } | null;

  // ✅ model برضه Object مش Array
  model: { name: string } | null;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form state (كلها string عشان TS)
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
  const [modelId, setModelId] = useState(''); // ✅ اختيار النموذج

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
      setUnits((data as Unit[]) || []);
    }

    setLoading(false);
  }

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, code')
      .order('name');

    if (error) {
      console.error(error);
      setProjects([]);
      return;
    }

    setProjects((data as ProjectOption[]) || []);
  }

  async function loadModels(projectIdValue: string) {
    const { data, error } = await supabase
      .from('project_models')
      .select('id, name')
      .eq('project_id', projectIdValue)
      .order('name');

    if (error) {
      console.error(error);
      setModels([]);
      return;
    }

    setModels((data as ModelOption[]) || []);
  }

  // ✅ أول ما تختار مشروع → نجيب نماذجه
  useEffect(() => {
    if (!projectId) {
      setModels([]);
      setModelId('');
      return;
    }
    loadModels(projectId);
    setModelId(''); // reset اختيار النموذج عند تغيير المشروع
  }, [projectId]);

  /* =====================
     FORM HELPERS
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
    if (!unitCode.trim() || !projectId) {
      alert('كود الوحدة والمشروع مطلوبين');
      return;
    }

    // ✅ لازم نموذج
    if (!modelId) {
      alert('من فضلك اختر النموذج');
      return;
    }

    if (!price || Number(price) <= 0) {
      alert('من فضلك أدخل سعر صحيح');
      return;
    }

    const payload = {
      unit_code: unitCode.trim(),
      block_no: blockNo.trim() || null,
      unit_no: unitNo.trim() || null,
      unit_type: unitType,
      status,
      supported_price: Number(price),
      land_area: landArea ? Number(landArea) : null,
      build_area: buildArea ? Number(buildArea) : null,
      project_id: projectId,
      model_id: modelId, // ✅ حفظ النموذج
    };

    if (editingId) {
      const { error } = await supabase.from('units').update(payload).eq('id', editingId);
      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('units').insert(payload);
      if (error) {
        alert(error.message);
        return;
      }
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
    setLandArea(u.land_area !== null ? String(u.land_area) : '');
    setBuildArea(u.build_area !== null ? String(u.build_area) : '');

    setProjectId(u.project_id);

    // ✅ لازم نحمل نماذج المشروع قبل ما نحط value
    await loadModels(u.project_id);
    setModelId(u.model_id || '');
  }

  async function deleteUnit(u: Unit) {
    if (u.status !== 'available') {
      alert('لا يمكن حذف وحدة محجوزة أو مباعة');
      return;
    }

    if (!confirm('هل أنت متأكد من حذف الوحدة؟')) return;

    setDeletingId(u.id);
    const { error } = await supabase.from('units').delete().eq('id', u.id);
    setDeletingId(null);

    if (error) {
      alert(error.message);
      return;
    }

    loadUnits();
  }

  function renderStatus(statusValue: Unit['status']) {
    if (statusValue === 'available') return 'متاحة';
    if (statusValue === 'reserved') return 'محجوزة';
    return 'مباعة';
  }

  function renderType(typeValue: Unit['unit_type']) {
    if (typeValue === 'villa') return 'فيلا';
    if (typeValue === 'duplex') return 'دوبلكس';
    return 'شقة';
  }

  /* =====================
     UI
  ===================== */

  return (
    <RequireAuth>
      <div className="page">
        {/* FORM */}
        <Card title="إدارة الوحدات">
          <div className="form-row">
            <Input placeholder="كود الوحدة" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} />
            <Input placeholder="رقم البلوك" value={blockNo} onChange={(e) => setBlockNo(e.target.value)} />
            <Input placeholder="رقم الوحدة" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} />

            <select value={unitType} onChange={(e) => setUnitType(e.target.value as any)}>
              {UNIT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <Input type="number" placeholder="مساحة الأرض" value={landArea} onChange={(e) => setLandArea(e.target.value)} />
            <Input type="number" placeholder="مسطح البناء" value={buildArea} onChange={(e) => setBuildArea(e.target.value)} />
            <Input type="number" placeholder="السعر المعتمد" value={price} onChange={(e) => setPrice(e.target.value)} />

            <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="available">متاحة</option>
              <option value="reserved">محجوزة</option>
              <option value="sold">مباعة</option>
            </select>

            {/* ✅ المشروع */}
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">اختر المشروع</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.code ? ` (${p.code})` : ''}
                </option>
              ))}
            </select>

            {/* ✅ النموذج يظهر بعد اختيار المشروع */}
            <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!projectId}>
              <option value="">اختر النموذج</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            <Button onClick={handleSubmit}>
              {editingId ? 'تعديل الوحدة' : 'إضافة وحدة'}
            </Button>

            {editingId && (
              <Button variant="danger" onClick={resetForm}>
                إلغاء
              </Button>
            )}
          </div>
        </Card>

        {/* TABLE */}
        <Card title="قائمة الوحدات">
          <Table headers={['الكود', 'النوع', 'الحالة', 'الأرض', 'البناء', 'السعر', 'المشروع', 'النموذج', 'إجراء']}>
            {loading ? (
              <tr>
                <td colSpan={9}>جاري التحميل...</td>
              </tr>
            ) : units.length === 0 ? (
              <tr>
                <td colSpan={9}>لا توجد وحدات</td>
              </tr>
            ) : (
              units.map((u) => (
                <tr key={u.id}>
                  <td data-label="الكود">{u.unit_code}</td>
                  <td data-label="النوع">{renderType(u.unit_type)}</td>

                  <td data-label="الحالة">
                    <span className={`badge ${u.status}`}>{renderStatus(u.status)}</span>
                  </td>

                  <td data-label="الأرض">{u.land_area ?? '-'}</td>
                  <td data-label="البناء">{u.build_area ?? '-'}</td>
                  <td data-label="السعر">{u.supported_price.toLocaleString()}</td>

                  {/* ✅ المشروع لن يكون فاضي بعد إصلاح الـ type */}
                  <td data-label="المشروع">
                    {u.project ? `${u.project.name}${u.project.code ? ` (${u.project.code})` : ''}` : '-'}
                  </td>

                  {/* ✅ النموذج */}
                  <td data-label="النموذج">{u.model?.name || '-'}</td>

                  <td data-label="إجراء">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button onClick={() => startEdit(u)}>تعديل</Button>
                      <Button
                        variant="danger"
                        disabled={deletingId === u.id}
                        onClick={() => deleteUnit(u)}
                      >
                        {deletingId === u.id ? '...' : 'حذف'}
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