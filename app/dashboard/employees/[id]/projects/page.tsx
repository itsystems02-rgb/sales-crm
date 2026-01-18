'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

/* =====================
   Types
===================== */

type Project = {
  id: string;
  name: string;
  code: string | null;
};

/* =====================
   Page
===================== */

export default function EmployeeProjectsPage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = params.id as string;

  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* =====================
     ACCESS
  ===================== */

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const emp = await getCurrentEmployee();

    if (!emp) {
      router.push('/login');
      return;
    }

    if (emp.role !== 'admin') {
      alert('غير مسموح');
      router.push('/dashboard');
      return;
    }

    await Promise.all([fetchProjects(), fetchEmployeeProjects()]);
    setLoading(false);
  }

  /* =====================
     DATA
  ===================== */

  async function fetchProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id, name, code')
      .order('name');

    setProjects(data || []);
  }

  async function fetchEmployeeProjects() {
    const { data } = await supabase
      .from('employee_projects')
      .select('project_id')
      .eq('employee_id', employeeId);

    setSelected((data || []).map((r) => r.project_id));
  }

  /* =====================
     SAVE
  ===================== */

  async function saveProjects() {
    setSaving(true);

    await supabase
      .from('employee_projects')
      .delete()
      .eq('employee_id', employeeId);

    if (selected.length > 0) {
      await supabase.from('employee_projects').insert(
        selected.map((pid) => ({
          employee_id: employeeId,
          project_id: pid,
        }))
      );
    }

    setSaving(false);
    alert('تم حفظ المشاريع');
    router.push('/dashboard/employees');
  }

  /* =====================
     UI
  ===================== */

  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">
      <div className="tabs">
        <Button onClick={() => router.push('/dashboard/employees')}>
          رجوع
        </Button>

        <Button onClick={saveProjects} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </Button>
      </div>

      <Card title="المشاريع المسموح بها">
        <div className="details-grid">
          {projects.map((p) => {
            const checked = selected.includes(p.id);

            return (
              <label
                key={p.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  background: checked ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, p.id]
                        : selected.filter((x) => x !== p.id)
                    );
                  }}
                />

                <div>
                  <strong>{p.name}</strong>
                  {p.code && (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {p.code}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </Card>
    </div>
  );
}