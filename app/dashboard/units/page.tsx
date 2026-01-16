'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Unit = {
  id: string;
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
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [unitCode, setUnitCode] = useState('');
  const [blockNo, setBlockNo] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [unitType, setUnitType] = useState<'villa' | 'duplex' | 'apartment'>('apartment');
  const [status, setStatus] = useState<'available' | 'reserved' | 'sold'>('available');
  const [price, setPrice] = useState<number>(0);
  const [landArea, setLandArea] = useState<number | ''>('');
  const [buildArea, setBuildArea] = useState<number | ''>('');
  const [projectId, setProjectId] = useState('');

  /* =====================
     LOAD
  ===================== */

  useEffect(() => {
    loadUnits();
    loadProjects();
  }, []);

  async function loadUnits() {
    setLoading(true);

    const { data } = await supabase
      .from('units')
      .select(`
        id,
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
      `)
      .order('created_at', { ascending: false });

    setUnits((data as Unit[]) || []);
    setLoading(false);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .order('name');

    setProjects(data || []);
  }

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
    setPrice(0);
    setLandArea('');
    setBuildArea('');
    setProjectId('');
  }

  async function handleSubmit() {
    if (!unitCode || !projectId) {
      alert('كود الوحدة والمشروع مطلوبين');
      return;
    }

    const payload = {
      unit_code: unitCode,
      block_no: blockNo || null,
      unit_no: unitNo || null,
      unit_type: unitType,
      status,
      supported_price: price,
      land_area: landArea === '' ? null : landArea,
      build_area: buildArea === '' ? null : buildArea,
      project_id: projectId,
    };

    if (editingId) {
      const { error } = await supabase
        .from('units')
        .update(payload)
        .eq('id', editingId);

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
    setPrice(u.supported_price);
    setLandArea(u.land_area ?? '');
    setBuildArea(u.build_area ?? '');
    setProjectId(u.projects.length ? u.projects[0].code : '');
  }

  /* =====================
     DELETE WITH RULES
  ===================== */

  async function deleteUnit(u: Unit) {
    if (u.status !== 'available') {
      alert('لا يمكن حذف وحدة محجوزة أو مباعة');
      return;
    }

    const ok = confirm('هل أنت متأكد من حذف الوحدة؟');
    if (!ok) return;

    setDeletingId(u.id);

    const { error } = await supabase
      .from('units')
      .delete()
      .eq('id', u.id);

    setDeletingId(null);

    if (error) {
      alert(error.message);
      return;
    }

    loadUnits();
  }

  function renderStatus(status: string) {
    if (status === 'available') return 'متاحة';
    if (status === 'reserved') return 'محجوزة';
    if (status === 'sold') return 'مباعة';
    return status;
  }

  function renderType(type: string) {
    if (type === 'villa') return 'فيلا';
    if (type === 'duplex') return 'دوبلكس';
    if (type === 'apartment') return 'شقة';
    return type;
  }

  /* =====================
     UI
  ===================== */

  return (
    <div className="card">
      <h2 className="card-title">إدارة الوحدات</h2>

      {/* FORM */}
      <div className="form-grid">
        <input placeholder="كود الوحدة" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} />
        <input placeholder="رقم البلوك" value={blockNo} onChange={(e) => setBlockNo(e.target.value)} />
        <input placeholder="رقم الوحدة" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} />

        <select value={unitType} onChange={(e) => setUnitType(e.target.value as any)}>
          {UNIT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <input type="number" placeholder="مساحة الأرض" value={landArea} onChange={(e) => setLandArea(Number(e.target.value))} />
        <input type="number" placeholder="مسطح البناء" value={buildArea} onChange={(e) => setBuildArea(Number(e.target.value))} />

        <input type="number" placeholder="السعر المعتمد" value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} />

        <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="available">متاحة</option>
          <option value="reserved">محجوزة</option>
          <option value="sold">مباعة</option>
        </select>

        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">اختر المشروع</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <button className="primary-btn" onClick={handleSubmit}>
          {editingId ? 'تعديل الوحدة' : 'إضافة وحدة'}
        </button>

        {editingId && (
          <button className="btn-danger" onClick={resetForm}>
            إلغاء التعديل
          </button>
        )}
      </div>

      {/* TABLE */}
      {loading ? (
        <p className="muted">جاري التحميل...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th>الأرض</th>
              <th>البناء</th>
              <th>السعر</th>
              <th>المشروع</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td>{u.unit_code}</td>
                <td>{renderType(u.unit_type)}</td>
                <td>{renderStatus(u.status)}</td>
                <td>{u.land_area ?? '-'}</td>
                <td>{u.build_area ?? '-'}</td>
                <td>{u.supported_price.toLocaleString()}</td>
                <td>
                  {u.projects.length
                    ? `${u.projects[0].name} (${u.projects[0].code})`
                    : '-'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(u)}>تعديل</button>
                    <button
                      className="btn-danger"
                      disabled={deletingId === u.id}
                      onClick={() => deleteUnit(u)}
                    >
                      {deletingId === u.id ? '...' : 'حذف'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}