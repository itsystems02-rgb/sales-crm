'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

type Unit = {
  id: string;
  project_id: string;
  unit_code: string;
  block_no: string | null;
  unit_no: string | null;
  unit_type: 'villa' | 'duplex' | 'apartment';
  status: 'available' | 'reserved' | 'sold';
  supported_price: number;
  land_area: number | null;
  build_area: number | null;
  projects: {
    name: string;
    code: string;
  }[];
};

const UNIT_TYPES = [
  { value: 'villa', label: 'فيلا' },
  { value: 'duplex', label: 'دوبلكس' },
  { value: 'apartment', label: 'شقة' },
];

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; code?: string | null }[]>([]);
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
      .select(
        `
        id,
        project_id,
        unit_code,
        block_no,
        unit_no,
        unit_type,
        status,
        supported_price,
        land_area,
        build_area,
        projects:project_id (
          name,
          code
        )
      `
      )
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

    setProjects(data || []);
  }

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
  }

  async function handleSubmit() {
    if (!unitCode.trim() || !projectId) {
      alert('كود الوحدة والمشروع مطلوبين');
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

  function startEdit(u: Unit) {
    setEditingId(u.id);
    setUnitCode(u.unit_code);
    setBlockNo(u.block_no || '');
    setUnitNo(u.unit_no || '');
    setUnitType(u.unit_type);
    setStatus(u.status);
    setPrice(String(u.supported_price));
    setLandArea(u.land_area !== null ? String(u.land_area) : '');
    setBuildArea(u.build_area !== null ? String(u.build_area) : '');
    setProjectId(u.project_id); // ✔ FIX
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

            <Input
              type="number"
              placeholder="مساحة الأرض"
              value={landArea}
              onChange={(e) => setLandArea(e.target.value)}
            />

            <Input
              type="number"
              placeholder="مسطح البناء"
              value={buildArea}
              onChange={(e) => setBuildArea(e.target.value)}
            />

            <Input
              type="number"
              placeholder="السعر المعتمد"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />

            <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="available">متاحة</option>
              <option value="reserved">محجوزة</option>
              <option value="sold">مباعة</option>
            </select>

            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">اختر المشروع</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.code ? ` (${p.code})` : ''}
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
          <Table headers={['الكود', 'النوع', 'الحالة', 'الأرض', 'البناء', 'السعر', 'المشروع', 'إجراء']}>
            {loading ? (
              <tr>
                <td colSpan={8}>جاري التحميل...</td>
              </tr>
            ) : units.length === 0 ? (
              <tr>
                <td colSpan={8}>لا توجد وحدات</td>
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

                  <td data-label="المشروع">
                    {u.projects.length ? `${u.projects[0].name} (${u.projects[0].code})` : '-'}
                  </td>

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