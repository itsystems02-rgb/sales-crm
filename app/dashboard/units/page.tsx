'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

type Unit = {
  id: string;
  unit_code: string;
  unit_type: string;
  status: 'available' | 'reserved' | 'sold';
  supported_price: number;
  projects: {
    name: string;
  }[];
};

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);

  async function loadUnits() {
    const { data } = await supabase
      .from('units')
      .select(`
        id,
        unit_code,
        unit_type,
        status,
        supported_price,
        projects:project_id ( name )
      `)
      .order('created_at', { ascending: false });

    setUnits(data || []);
  }

  useEffect(() => {
    loadUnits();
  }, []);

  function renderStatus(status: string) {
    if (status === 'available') return 'متاحة';
    if (status === 'reserved') return 'محجوزة';
    if (status === 'sold') return 'مباعة';
    return status;
  }

  function renderType(type: string) {
    if (type === 'villa') return 'فيلا';
    if (type === 'duplex') return 'دوبلكس';
    return 'شقة';
  }

  return (
    <RequireAuth>
      <div className="page">
        <Card title="قائمة الوحدات">
          <Table headers={['كود الوحدة', 'النوع', 'الحالة', 'السعر', 'المشروع']}>
            {units.map((u) => (
              <tr key={u.id}>
                <td data-label="كود الوحدة">{u.unit_code}</td>
                <td data-label="النوع">{renderType(u.unit_type)}</td>
                <td data-label="الحالة">
                  <span className={`badge ${u.status}`}>
                    {renderStatus(u.status)}
                  </span>
                </td>
                <td data-label="السعر">{u.supported_price.toLocaleString()}</td>
                <td data-label="المشروع">{u.projects[0]?.name || '-'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </RequireAuth>
  );
}