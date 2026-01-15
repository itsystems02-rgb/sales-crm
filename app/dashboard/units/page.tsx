'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/* =====================
   Types
===================== */

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

/* =====================
   Page
===================== */

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);

  // form state
  const [unitCode, setUnitCode] = useState('');
  const [blockNo, setBlockNo] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [unitType, setUnitType] = useState('');
  const [status, setStatus] = useState('available');
  const [price, setPrice] = useState<number>(0);
  const [projectId, setProjectId] = useState('');

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  /* =====================
     Load Data
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
        unit_code,
        block_no,
        unit_no,
        unit_type,
        status,
        supported_price,
        projects:project_id (
          name,
          code
        )
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
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .order('name');

    setProjects(data || []);
  }

  /* =====================
     Add Unit
  ===================== */

  async function addUnit() {
    if (!unitCode || !projectId) {
      alert('كود الوحدة والمشروع مطلوبين');
      return;
    }

    const { error } = await supabase.from('units').insert([
      {
        unit_code: unitCode,
        block_no: blockNo || null,
        unit_no: unitNo || null,
        unit_type: unitType || null,
        status,
        supported_price: price,
        project_id: projectId,
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    // reset
    setUnitCode('');
    setBlockNo('');
    setUnitNo('');
    setUnitType('');
    setStatus('available');
    setPrice(0);
    setProjectId('');

    await loadUnits();
  }

  /* =====================
     UI
  ===================== */

  return (
    <div className="card">
      <h2 className="card-title">Units Management</h2>

      {/* ===== Add Unit ===== */}
      <div className="form-grid">
        <input
          placeholder="Unit Code"
          value={unitCode}
          onChange={(e) => setUnitCode(e.target.value)}
        />

        <input
          placeholder="Block No"
          value={blockNo}
          onChange={(e) => setBlockNo(e.target.value)}
        />

        <input
          placeholder="Unit No"
          value={unitNo}
          onChange={(e) => setUnitNo(e.target.value)}
        />

        <input
          placeholder="Unit Type"
          value={unitType}
          onChange={(e) => setUnitType(e.target.value)}
        />

        <input
          type="number"
          placeholder="Supported Price"
          value={price || ''}
          onChange={(e) => setPrice(Number(e.target.value))}
        />

        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </select>

        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Select Project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button className="primary-btn" onClick={addUnit}>
          Add Unit
        </button>
      </div>

      {/* ===== Table ===== */}
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Unit Code</th>
              <th>Block</th>
              <th>Unit No</th>
              <th>Type</th>
              <th>Status</th>
              <th>Project</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {units.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>
                  No units found
                </td>
              </tr>
            ) : (
              units.map((u) => (
                <tr key={u.id}>
                  <td>{u.unit_code}</td>
                  <td>{u.block_no || '-'}</td>
                  <td>{u.unit_no || '-'}</td>
                  <td>{u.unit_type || '-'}</td>
                  <td>{u.status}</td>
                  <td>
                    {u.projects.length > 0
                      ? `${u.projects[0].name} (${u.projects[0].code})`
                      : '-'}
                  </td>
                  <td>{u.supported_price.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}