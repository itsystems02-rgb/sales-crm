'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/* =====================
   Types
===================== */

type FollowUp = {
  id: string;
  type: 'call' | 'whatsapp' | 'visit';
  notes: string | null;
  next_follow_up_date: string | null;
  visit_location: string | null;
  created_at: string;
  employee: { name: string } | null;
  unit_id: string | null;
};

type Unit = {
  id: string;
  unit_code: string;
  project_id: string;
  status: 'available' | 'reserved' | 'sold';
};

type Employee = {
  id: string;
  role: 'admin' | 'sales';
};

const TYPES = [
  { value: 'call', label: 'مكالمة' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'visit', label: 'زيارة' },
];

const DETAILS_OPTIONS = [
  'لم يتم الرد',
  'مهتم',
  'غير مهتم',
  'طلب متابعة لاحقًا',
  'تم إرسال التفاصيل',
  'تم تحديد موعد',
  'العميل غير متواجد',
  'تمت الزيارة',
];

/* =====================
   Component
===================== */

export default function FollowUps({ clientId, projectId }: { clientId: string, projectId: string }) {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [type, setType] = useState<'call' | 'whatsapp' | 'visit'>('call');
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [visitLocation, setVisitLocation] = useState('');
  const [unitId, setUnitId] = useState('');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);

  /* =====================
     Load Employee + Data
  ===================== */
  useEffect(() => {
    fetchEmployee();
  }, []);

  useEffect(() => {
    if (employeeId) {
      fetchFollowUps();
      fetchUnits();
    }
  }, [employeeId]);

  async function fetchEmployee() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const { data } = await supabase
      .from('employees')
      .select('id, role')
      .eq('email', user.email)
      .maybeSingle();

    if (data?.id) {
      setEmployee(data);
      setEmployeeId(data.id);
    }
  }

  async function fetchUnits() {
    // جلب الوحدات المتاحة فقط
    let query = supabase
      .from('units')
      .select('id, unit_code, project_id, status')
      .eq('status', 'available')
      .eq('project_id', projectId)
      .order('unit_code');

    // لو employee role = sales → فلتر على المشاريع المسموحة
    if (employee?.role === 'sales' && employee?.id) {
      const { data: empProjects } = await supabase
        .from('employee_projects')
        .select('project_id')
        .eq('employee_id', employee.id);

      const allowedIds = (empProjects || []).map(p => p.project_id);
      if (allowedIds.length > 0) {
        query = query.in('project_id', allowedIds);
      } else {
        query = query.in('project_id', ['']); // مفيش وحدات
      }
    }

    const { data: u } = await query;
    setUnits(u || []);
  }

  async function fetchFollowUps() {
    const { data, error } = await supabase
      .from('client_followups')
      .select(`
        id,
        type,
        notes,
        next_follow_up_date,
        visit_location,
        created_at,
        employee:employees!client_followups_employee_id_fkey (
          name
        ),
        unit_id
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setItems([]);
      return;
    }

    setItems((data || []).map((f: any) => ({ ...f, employee: f.employee ?? null })));
  }

  /* =====================
     Add Follow Up
  ===================== */
  async function addFollowUp() {
    if (!employeeId) return alert('لم يتم تحديد الموظف');

    if (type === 'visit' && !visitLocation) return alert('ادخل مكان الزيارة');

    if (!unitId) return alert('اختر الوحدة');

    setLoading(true);

    const finalNotes = details && notes ? `${details} - ${notes}` : details || notes || null;

    const { error } = await supabase.from('client_followups').insert({
      client_id: clientId,
      employee_id: employeeId,
      type,
      notes: finalNotes,
      next_follow_up_date: nextDate || null,
      visit_location: type === 'visit' ? visitLocation : null,
      unit_id,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setDetails('');
    setNotes('');
    setNextDate('');
    setVisitLocation('');
    setUnitId('');
    setType('call');
    setLoading(false);

    fetchFollowUps();
  }

  function typeLabel(t: string) {
    return TYPES.find(x => x.value === t)?.label || t;
  }

  /* =====================
     UI
  ===================== */
  return (
    <>
      <Card title="إضافة متابعة">
        <div className="form-col">
          <select value={type} onChange={e => setType(e.target.value as any)}>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <select value={unitId} onChange={e => setUnitId(e.target.value)}>
            <option value="">اختر الوحدة</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
          </select>

          <select value={details} onChange={e => setDetails(e.target.value)}>
            <option value="">تفاصيل المتابعة</option>
            {DETAILS_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          {type === 'visit' && (
            <Input placeholder="مكان الزيارة" value={visitLocation} onChange={e => setVisitLocation(e.target.value)} />
          )}

          <textarea
            placeholder="ملاحظات إضافية"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ minHeight: 90 }}
          />

          <input
            type="date"
            value={nextDate}
            onChange={e => setNextDate(e.target.value)}
          />

          <Button onClick={addFollowUp} disabled={loading}>
            حفظ
          </Button>
        </div>
      </Card>

      <Card title="سجل المتابعات">
        <table>
          <thead>
            <tr>
              <th>الوحدة</th>
              <th>النوع</th>
              <th>التفاصيل</th>
              <th>مكان الزيارة</th>
              <th>المتابعة القادمة</th>
              <th>الموظف</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} style={{textAlign:'center'}}>لا توجد متابعات</td></tr>
            ) : items.map(f => (
              <tr key={f.id}>
                <td>{units.find(u => u.id === f.unit_id)?.unit_code || '-'}</td>
                <td>{typeLabel(f.type)}</td>
                <td>{f.notes || '-'}</td>
                <td>{f.visit_location || '-'}</td>
                <td>{f.next_follow_up_date || '-'}</td>
                <td>{f.employee?.name || '-'}</td>
                <td>{new Date(f.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}