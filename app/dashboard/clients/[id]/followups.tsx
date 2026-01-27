'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

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
};

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

/* =====================
   Constants
===================== */

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
  'تمت الزيارة',
  'العميل غير متواجد',
];

/* =====================
   Component
===================== */

export default function FollowUps({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [type, setType] = useState<'call' | 'whatsapp' | 'visit'>('call');
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [visitLocation, setVisitLocation] = useState('');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);

  /* =====================
     Load
  ===================== */

  useEffect(() => {
    fetchFollowUps();
    getCurrentEmployeeData();
  }, [clientId]);

  async function getCurrentEmployeeData() {
    try {
      const emp = await getCurrentEmployee();
      if (emp) {
        const { data, error } = await supabase
          .from('employees')
          .select('id, name, email, role')
          .eq('id', emp.id)
          .single();
        
        if (error) {
          console.error('Error fetching employee details:', error);
          return;
        }
        
        if (data) {
          setEmployee(data);
        }
      }
    } catch (error) {
      console.error('Error getting current employee:', error);
    }
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
        )
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      setItems([]);
      return;
    }

    const normalized: FollowUp[] = (data ?? []).map((f: any) => ({
      ...f,
      employee: f.employee ?? null,
    }));

    setItems(normalized);
  }

  /* =====================
     Add FollowUp
  ===================== */

  async function addFollowUp() {
    if (!employee?.id) {
      alert('لم يتم تحديد الموظف. يرجى تسجيل الدخول مرة أخرى.');
      return;
    }

    if (type === 'visit' && !visitLocation) {
      alert('من فضلك أدخل مكان الزيارة');
      return;
    }

    setLoading(true);

    const finalNotes =
      details && notes
        ? `${details} - ${notes}`
        : details || notes || null;

    const { error } = await supabase.from('client_followups').insert({
      client_id: clientId,
      employee_id: employee.id,
      type,
      notes: finalNotes,
      next_follow_up_date: nextDate || null,
      visit_location: type === 'visit' ? visitLocation : null,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const status = type === 'visit' ? 'visited' : 'interested';
    await supabase.from('clients').update({ status }).eq('id', clientId);

    setDetails('');
    setNotes('');
    setNextDate('');
    setVisitLocation('');
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
      {employee && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '12px 16px', 
          backgroundColor: '#e6f4ea', 
          borderRadius: '8px',
          borderLeft: '5px solid #34a853'
        }}>
          <strong>المستخدم الحالي:</strong> {employee.name} ({employee.role === 'admin' ? 'مدير' : employee.role === 'sales' ? 'مندوب مبيعات' : 'مدير مبيعات'})
        </div>
      )}

      <Card title="إضافة متابعة">
        {!employee ? (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center', 
            backgroundColor: '#fee2e2', 
            borderRadius: '6px',
            border: '1px solid #fecaca'
          }}>
            <p style={{ color: '#dc2626', marginBottom: '10px' }}>
              ⚠️ لم يتم تحديد الموظف. يرجى تسجيل الدخول مرة أخرى.
            </p>
            <Button 
              onClick={getCurrentEmployeeData}
              variant="primary"  // استخدام variant بدلاً من style
            >
              تحديث بيانات الموظف
            </Button>
          </div>
        ) : (
          <div className="form-col" style={{ gap: 8 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              marginBottom: '10px',
              padding: '10px',
              backgroundColor: '#f0f9ff',
              borderRadius: '6px'
            }}>
              <span>📝</span>
              <span>
                <strong>موظف المتابعة:</strong> {employee.name}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value as any)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                {TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              <select 
                value={details} 
                onChange={(e) => setDetails(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                <option value="">تفاصيل المتابعة</option>
                {DETAILS_OPTIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {type === 'visit' && (
              <input
                placeholder="مكان الزيارة"
                value={visitLocation}
                onChange={(e) => setVisitLocation(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            )}

            <textarea
              placeholder="ملاحظات إضافية"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ 
                minHeight: 80, 
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: '14px'
              }}
            />

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#666' }}>
                تاريخ المتابعة القادمة (اختياري)
              </label>
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ width: '100%', marginTop: '10px' }}>
              <Button 
                onClick={addFollowUp} 
                disabled={loading || !employee}
                className="full-width"
                variant="primary"  // استخدام variant بدلاً من style
              >
                {loading ? 'جاري الحفظ...' : 'حفظ المتابعة'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="سجل المتابعات">
        <div style={{ 
          marginBottom: '15px', 
          padding: '10px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>
            <strong>عدد المتابعات:</strong> {items.length}
          </span>
          <Button 
            onClick={fetchFollowUps}
            variant="secondary"  // استخدام Button المخصص
          >
            تحديث القائمة
          </Button>
        </div>

        <Table headers={['النوع','التفاصيل','مكان الزيارة','المتابعة القادمة','الموظف','التاريخ']}>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ color: '#666', fontSize: '14px' }}>
                  لا توجد متابعات لهذا العميل بعد
                </div>
              </td>
            </tr>
          ) : (
            items.map(f => (
              <tr key={f.id}>
                <td>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    backgroundColor: 
                      f.type === 'visit' ? '#e0f2fe' : 
                      f.type === 'call' ? '#f0f9ff' : '#f0fdf4',
                    color: 
                      f.type === 'visit' ? '#0369a1' : 
                      f.type === 'call' ? '#0c4a6e' : '#166534'
                  }}>
                    {typeLabel(f.type)}
                  </span>
                </td>
                <td style={{ maxWidth: '300px', wordBreak: 'break-word' }}>
                  {f.notes || '-'}
                </td>
                <td>{f.visit_location || '-'}</td>
                <td>
                  {f.next_follow_up_date ? (
                    <span style={{ 
                      padding: '4px 8px', 
                      backgroundColor: '#fef3c7', 
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {new Date(f.next_follow_up_date).toLocaleDateString('ar-SA')}
                    </span>
                  ) : '-'}
                </td>
                <td>{f.employee?.name || '-'}</td>
                <td>
                  {new Date(f.created_at).toLocaleDateString('ar-SA')}
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {new Date(f.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </td>
              </tr>
            ))
          )}
        </Table>
      </Card>
    </>
  );
}