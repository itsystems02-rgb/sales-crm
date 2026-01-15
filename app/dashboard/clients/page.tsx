'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

type Client = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  identity_type: string | null;
  identity_no: string | null;
  job_sector: string | null;
};

const IDENTITY_TYPES = [
  { value: '', label: 'اختر نوع الهوية' },
  { value: 'national_id', label: 'بطاقة شخصية' },
  { value: 'passport', label: 'جواز سفر' },
  { value: 'residence', label: 'إقامة' },
];

export default function ClientsPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [identityType, setIdentityType] = useState('');
  const [identityNo, setIdentityNo] = useState('');
  const [jobSector, setJobSector] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('id,name,mobile,email,identity_type,identity_no,job_sector')
      .order('created_at', { ascending: false });

    if (!error) setClients(data || []);
  }

  function resetForm() {
    setEditingId(null);
    setName('');
    setMobile('');
    setEmail('');
    setIdentityType('');
    setIdentityNo('');
    setJobSector('');
  }

  async function handleSubmit() {
    if (!name || !mobile) {
      alert('الاسم ورقم الجوال مطلوبين');
      return;
    }

    setLoading(true);

    if (editingId) {
      const { error } = await supabase
        .from('clients')
        .update({
          name,
          mobile,
          email: email || null,
          identity_type: identityType || null,
          identity_no: identityNo || null,
          job_sector: jobSector || null,
        })
        .eq('id', editingId);

      if (error) alert(error.message);
    } else {
      const { error } = await supabase.from('clients').insert({
        name,
        mobile,
        email: email || null,
        identity_type: identityType || null,
        identity_no: identityNo || null,
        job_sector: jobSector || null,
        status: 'lead',
      });

      if (error) alert(error.message);
    }

    setLoading(false);
    resetForm();
    fetchClients();
  }

  function startEdit(c: Client) {
    setEditingId(c.id);
    setName(c.name);
    setMobile(c.mobile);
    setEmail(c.email || '');
    setIdentityType(c.identity_type || '');
    setIdentityNo(c.identity_no || '');
    setJobSector(c.job_sector || '');
  }

  async function deleteClient(id: string) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;

    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) alert(error.message);

    fetchClients();
  }

  return (
    <div className="page">
      {/* Add / Edit */}
      <Card title={editingId ? 'تعديل عميل' : 'إضافة عميل'}>
        <div className="form-col">
          <Input placeholder="اسم العميل" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="رقم الجوال" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          <Input placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />

          <select value={identityType} onChange={(e) => setIdentityType(e.target.value)}>
            {IDENTITY_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <Input
            placeholder="رقم الهوية"
            value={identityNo}
            onChange={(e) => setIdentityNo(e.target.value)}
          />

          <Input
            placeholder="القطاع الوظيفي"
            value={jobSector}
            onChange={(e) => setJobSector(e.target.value)}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleSubmit} disabled={loading}>
              {editingId ? 'تعديل' : 'حفظ'}
            </Button>

            {editingId && (
              <Button onClick={resetForm}>
                إلغاء
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* List */}
      <Card title="قائمة العملاء">
        <Table
          headers={[
            'الاسم',
            'الجوال',
            'الإيميل',
            'نوع الهوية',
            'رقم الهوية',
            'القطاع',
            'إجراء',
          ]}
        >
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.mobile}</td>
              <td>{c.email || '-'}</td>
              <td>{c.identity_type || '-'}</td>
              <td>{c.identity_no || '-'}</td>
              <td>{c.job_sector || '-'}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>
                    فتح
                  </Button>

                  <Button onClick={() => startEdit(c)}>تعديل</Button>

                  <button
                    className="btn-danger"
                    onClick={() => deleteClient(c.id)}
                  >
                    حذف
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}