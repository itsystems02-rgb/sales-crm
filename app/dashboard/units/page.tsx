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
};

type Unit = {
  id: string;
  unit_code: string;
  block_no: string | null;
  unit_no: string | null;
  unit_type: string | null;
  status: string;
  supported_price: number;
  projects: {
    name: string;
    code: string;
  }[];
};

export default function UnitsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form state
  const [projectId, setProjectId] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [blockNo, setBlockNo] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [unitType, setUnitType] = useState('');
  const [price, setPrice] = useState('');

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name, code')
      .order('created_at', { ascending: false });

    setProjects(data || []);
  }

  async function loadUnits() {
    const { data, error } = await supabase
      .from('units')
      .select(
        `
        id,
        unit_code,
        block_no,
        unit_no,
        unit_type,
        status,
        supported_price,
        projects:project_id ( name, code )
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setUnits(data || []);
  }

  async function addUnit() {
    if (!projectId) return alert('اختار مشروع');
    if (!unitCode.trim()) return alert('اكتب رمز الوحدة');
    if (!price || Number(price) <= 0) return alert('اكتب سعر الوحدة');

    setLoading(true);

    const { error } = await supabase.from('units').insert([
      {
        project_id: projectId,
        unit_code: unitCode.trim(),
        block_no: blockNo || null,
        unit_no: unitNo || null,
        unit_type: unitType || null,
        supported_price: Number(price),
        status: 'available',
      },
    ]);

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    // reset
    setUnitCode('');
    setBlockNo('');
    setUnitNo('');
    setUnitType('');
    setPrice('');

    loadUnits();
  }

  async function deleteUnit(id: string) {
    const ok = confirm('هل تريد حذف الوحدة؟');
    if (!ok) return;

    setDeletingId(id);
    const { error } = await supabase.from('units').delete().eq('id', id);
    setDeletingId(null);

    if (error) {
      alert(error.message);
      return;
    }

    loadUnits();
  }

  useEffect(() => {
    loadProjects();
    loadUnits();
  }, []);

  return (
    <RequireAuth>
      <div className="page">
        {/* إضافة وحدة */}
        <Card title="إضافة وحدة">
          <div className="form-row">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">اختر المشروع</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>

            <Input
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
              placeholder="رمز الوحدة"
            />
            <Input
              value={blockNo}
              onChange={(e) => setBlockNo(e.target.value)}
              placeholder="رقم البلوك"
            />
            <Input
              value={unitNo}
              onChange={(e) => setUnitNo(e.target.value)}
              placeholder="رقم الوحدة"
            />
            <Input
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              placeholder="نوع الوحدة"
            />
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="سعر الوحدة"
            />

            <Button onClick={addUnit} disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </Card>

        {/* قائمة الوحدات */}
        <Card title="قائمة الوحدات">
          <Table headers={['رمز الوحدة', 'البلوك', 'الوحدة', 'النوع', 'السعر', 'الحالة', 'المشروع', 'إجراء']}>
            {units.length === 0 ? (
              <tr>
                <td colSpan={8}>لا توجد وحدات</td>
              </tr>
            ) : (
              units.map((u) => (
                <tr key={u.id}>
                  <td>{u.unit_code}</td>
                  <td>{u.block_no || '-'}</td>
                  <td>{u.unit_no || '-'}</td>
                  <td>{u.unit_type || '-'}</td>
                  <td>{u.supported_price.toLocaleString()}</td>
                  <td>{u.status}</td>
                  <td>
                    {u.projects ? `${u.projects.name} (${u.projects.code})` : '-'}
                  </td>
                  <td>
                    <Button
                      variant="danger"
                      disabled={deletingId === u.id}
                      onClick={() => deleteUnit(u.id)}
                    >
                      {deletingId === u.id ? '...' : 'حذف'}
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