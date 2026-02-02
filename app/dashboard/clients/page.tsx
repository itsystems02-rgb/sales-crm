'use client';

import { useEffect, useState, useRef, useCallback, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';
import * as XLSX from 'xlsx';

import RequireAuth from '@/components/auth/RequireAuth';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Table from '@/components/ui/Table';

/* =====================
   Types
===================== */
type ClientListItem = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  eligible: boolean;
  status: string;
  nationality: 'saudi' | 'non_saudi';
  identity_type: string | null;
  identity_no: string | null;
  residency_type: string | null;
  salary_bank_id: string | null;
  finance_bank_id: string | null;
  job_sector_id: string | null;
  interested_in_project_id: string | null;
  created_at: string;
};

type Option = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  name: string;
  code: string | null;
};

type Employee = {
  id: string;
  role: 'admin' | 'sales' | 'sales_manager';
};

type ClientStats = {
  leads: number;
  reserved: number;
  visited: number;
  converted: number;
  eligible: number;
  nonEligible: number;
  total: number;
};

type ClientFilters = {
  search: string;
  status: string[];
  eligible: string | null;
  nationality: string | null;
  salary_bank_id: string | null;
  finance_bank_id: string | null;
  job_sector_id: string | null;
  interested_in_project_id: string | null;
  from_date: string;
  to_date: string;
};

/* =====================
   Constants
===================== */
const IDENTITY_TYPES = [
  { value: '', label: 'اختر نوع الهوية' },
  { value: 'national_id', label: 'الهوية' },
  { value: 'passport', label: 'جواز سفر' },
  { value: 'residence', label: 'إقامة' },
];

const RESIDENCY_TYPES = [
  { value: 'residence', label: 'إقامة' },
  { value: 'golden', label: 'إقامة ذهبية' },
  { value: 'premium', label: 'إقامة مميزة' },
];

const STATUS_OPTIONS = [
  { value: 'lead', label: 'متابعة' },
  { value: 'reserved', label: 'محجوز' },
  { value: 'visited', label: 'تمت الزيارة' },
  { value: 'converted', label: 'تم البيع' },
];

const ELIGIBLE_OPTIONS = [
  { value: '', label: 'جميع العملاء' },
  { value: 'true', label: 'مستحق فقط' },
  { value: 'false', label: 'غير مستحق فقط' },
];

const NATIONALITY_OPTIONS = [
  { value: '', label: 'جميع الجنسيات' },
  { value: 'saudi', label: 'سعودي' },
  { value: 'non_saudi', label: 'غير سعودي' },
];

function translateStatus(status: string) {
  switch (status) {
    case 'lead': return 'متابعة';
    case 'reserved': return 'محجوز';
    case 'visited': return 'تمت الزيارة';
    case 'converted': return 'تم البيع';
    default: return status;
  }
}

function translateNationality(nationality: string) {
  switch (nationality) {
    case 'saudi': return 'سعودي';
    case 'non_saudi': return 'غير سعودي';
    default: return nationality;
  }
}

function translateEligible(eligible: boolean) {
  return eligible ? 'مستحق' : 'غير مستحق';
}

function getProjectText(project: Project | null | undefined) {
  if (!project) return '-';
  return project.code ? `${project.name} (${project.code})` : project.name;
}

/* =====================
   Excel Import/Export Functions
===================== */
function exportToExcel(clients: ClientListItem[], projects: Project[], fileName: string = 'العملاء.xlsx') {
  try {
    const getProjectName = (projectId: string | null) => {
      if (!projectId) return '-';
      const project = projects.find(p => p.id === projectId);
      return getProjectText(project);
    };

    const excelData = clients.map(client => ({
      'اسم العميل': client.name,
      'رقم الجوال': client.mobile || '-',
      'البريد الإلكتروني': client.email || '-',
      'نوع الهوية': client.identity_type || '-',
      'رقم الهوية': client.identity_no || '-',
      'الجنسية': translateNationality(client.nationality),
      'نوع الإقامة': client.residency_type || '-',
      'الحالة': translateStatus(client.status),
      'الأهلية': translateEligible(client.eligible),
      'مهتم بمشروع': getProjectName(client.interested_in_project_id),
      'تاريخ الإنشاء': new Date(client.created_at).toLocaleDateString('ar-SA'),
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'العملاء');
    XLSX.writeFile(wb, fileName);

    return true;
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    alert('حدث خطأ أثناء تصدير البيانات إلى Excel');
    return false;
  }
}

async function importFromExcel(file: File, onSuccess?: (data: any[]) => void, onError?: (error: string) => void) {
  try {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (onSuccess) onSuccess(jsonData);
      } catch (parseError) {
        console.error('Error parsing Excel file:', parseError);
        if (onError) onError('حدث خطأ في تحليل ملف Excel');
      }
    };

    reader.onerror = () => {
      if (onError) onError('حدث خطأ في قراءة الملف');
    };

    reader.readAsBinaryString(file);
  } catch (error) {
    console.error('Error importing from Excel:', error);
    if (onError) onError('حدث خطأ في استيراد البيانات');
  }
}

/* =====================
   Page
===================== */
export default function ClientsPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [banks, setBanks] = useState<Option[]>([]);
  const [jobSectors, setJobSectors] = useState<Option[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allowedProjects, setAllowedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [clientStats, setClientStats] = useState<ClientStats>({
    leads: 0,
    reserved: 0,
    visited: 0,
    converted: 0,
    eligible: 0,
    nonEligible: 0,
    total: 0
  });

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showImportErrors, setShowImportErrors] = useState(false);

  const [filters, setFilters] = useState<ClientFilters>({
    search: '',
    status: [],
    eligible: null,
    nationality: null,
    salary_bank_id: null,
    finance_bank_id: null,
    job_sector_id: null,
    interested_in_project_id: null,
    from_date: '',
    to_date: '',
  });

  const [showFilters, setShowFilters] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [identityType, setIdentityType] = useState('');
  const [identityNo, setIdentityNo] = useState('');
  const [eligible, setEligible] = useState(true);
  const [nationality, setNationality] = useState<'saudi' | 'non_saudi'>('saudi');
  const [residencyType, setResidencyType] = useState('');
  const [salaryBankId, setSalaryBankId] = useState('');
  const [financeBankId, setFinanceBankId] = useState('');
  const [jobSectorId, setJobSectorId] = useState('');
  const [interestedInProjectId, setInterestedInProjectId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* =====================
     HELPER FUNCTIONS
  ===================== */

  const fetchAllowedProjects = useCallback(async (emp: Employee | null) => {
    try {
      if (emp?.role === 'admin') {
        const { data, error } = await supabase
          .from('projects')
          .select('id, name, code')
          .order('name');

        if (error) throw error;
        setAllProjects(data || []);
        setAllowedProjects(data || []);
        return data || [];
      }

      if (emp?.role === 'sales' || emp?.role === 'sales_manager') {
        const { data: employeeProjects, error: empError } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        if (empError) throw empError;

        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);

        if (allowedProjectIds.length > 0) {
          const { data: projectsData, error: projectsError } = await supabase
            .from('projects')
            .select('id, name, code')
            .in('id', allowedProjectIds)
            .order('name');

          if (projectsError) throw projectsError;
          setAllowedProjects(projectsData || []);
          return projectsData || [];
        } else {
          setAllowedProjects([]);
          return [];
        }
      }

      setAllowedProjects([]);
      return [];
    } catch (err) {
      console.error('Error fetching allowed projects:', err);
      setAllowedProjects([]);
      return [];
    }
  }, []);

  const fetchAllProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, code')
        .order('name');

      if (error) throw error;
      setAllProjects(data || []);
    } catch (err) {
      console.error('Error fetching all projects:', err);
    }
  }, []);

  const fetchBanks = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('banks').select('id,name').order('name');
      if (error) {
        console.error('Error fetching banks:', error);
        return;
      }
      setBanks(data || []);
    } catch (error) {
      console.error('Error in fetchBanks:', error);
    }
  }, []);

  const fetchJobSectors = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('job_sectors').select('id,name').order('name');
      if (error) {
        console.error('Error fetching job sectors:', error);
        return;
      }
      setJobSectors(data || []);
    } catch (error) {
      console.error('Error in fetchJobSectors:', error);
    }
  }, []);

  /* =====================
     FILTER FUNCTIONS
  ===================== */
  const updateFilter = (key: keyof ClientFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleStatusFilter = (status: string, checked: boolean) => {
    const newStatus = checked
      ? [...filters.status, status]
      : filters.status.filter(s => s !== status);

    updateFilter('status', newStatus);
  };

  const applyFilters = () => {
    setCurrentPage(1);
    loadClients(employee, 1);
    setIsFiltered(true);
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      status: [],
      eligible: null,
      nationality: null,
      salary_bank_id: null,
      finance_bank_id: null,
      job_sector_id: null,
      interested_in_project_id: null,
      from_date: '',
      to_date: '',
    });
    setCurrentPage(1);
    loadClients(employee, 1);
    setIsFiltered(false);
  };

  const hasActiveFilters = () => {
    return (
      filters.search ||
      filters.status.length > 0 ||
      filters.eligible !== null ||
      filters.nationality !== null ||
      filters.salary_bank_id !== null ||
      filters.finance_bank_id !== null ||
      filters.job_sector_id !== null ||
      filters.interested_in_project_id !== null ||
      filters.from_date ||
      filters.to_date
    );
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') applyFilters();
  };

  /* =====================
     LOAD CLIENTS (UPDATED)
     - admin/sales_manager: نفس نظامك القديم (حسب المشاريع)
     - sales: يعرض فقط العملاء المعيّنين له من client_assignments
  ===================== */
  const loadClients = useCallback(async (emp: Employee | null = null, page: number = currentPage) => {
    try {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      // ✅ SALES: assigned only
      if (emp?.role === 'sales') {
        let q: any = supabase
          .from('client_assignments')
          .select('client_id, assigned_at, clients!inner(*)', { count: 'exact' })
          .eq('employee_id', emp.id)
          .order('assigned_at', { ascending: false })
          .range(from, to);

        // Filters على clients عبر join
        if (filters.search) {
          q = q.or(`clients.name.ilike.%${filters.search}%,clients.mobile.ilike.%${filters.search}%`);
        }
        if (filters.status.length > 0) {
          q = q.in('clients.status', filters.status);
        }
        if (filters.eligible !== null) {
          q = q.eq('clients.eligible', filters.eligible === 'true');
        }
        if (filters.nationality !== null) {
          q = q.eq('clients.nationality', filters.nationality);
        }
        if (filters.salary_bank_id !== null) {
          q = q.eq('clients.salary_bank_id', filters.salary_bank_id);
        }
        if (filters.finance_bank_id !== null) {
          q = q.eq('clients.finance_bank_id', filters.finance_bank_id);
        }
        if (filters.job_sector_id !== null) {
          q = q.eq('clients.job_sector_id', filters.job_sector_id);
        }
        if (filters.interested_in_project_id !== null) {
          q = q.eq('clients.interested_in_project_id', filters.interested_in_project_id);
        }
        if (filters.from_date) {
          q = q.gte('clients.created_at', filters.from_date);
        }
        if (filters.to_date) {
          const nextDay = new Date(filters.to_date);
          nextDay.setDate(nextDay.getDate() + 1);
          q = q.lt('clients.created_at', nextDay.toISOString().split('T')[0]);
        }

        const { data, error, count } = await q;

        if (error) {
          console.error('Error fetching assigned clients:', error);
          alert('حدث خطأ في تحميل العملاء: ' + error.message);
          setClients([]);
          setTotalClients(0);
          setTotalPages(1);
          return;
        }

        const mapped = (data || [])
          .map((row: any) => row.clients)
          .filter(Boolean) as ClientListItem[];

        setClients(mapped);
        const total = count || 0;
        setTotalClients(total);
        setTotalPages(Math.max(1, Math.ceil(total / itemsPerPage)));
        return;
      }

      // ✅ ADMIN / SALES_MANAGER: نفس النظام القديم
      let query: any = supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // sales_manager scope بالمشاريع
      if (emp?.role === 'sales_manager') {
        const allowed = await fetchAllowedProjects(emp);
        const allowedIds = allowed.map(p => p.id);

        if (allowedIds.length > 0) {
          query = query.in('interested_in_project_id', allowedIds);
        } else {
          setClients([]);
          setTotalClients(0);
          setTotalPages(1);
          return;
        }
      }

      // Filters
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%`);
      }
      if (filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters.eligible !== null) {
        query = query.eq('eligible', filters.eligible === 'true');
      }
      if (filters.nationality !== null) {
        query = query.eq('nationality', filters.nationality);
      }
      if (filters.salary_bank_id !== null) {
        query = query.eq('salary_bank_id', filters.salary_bank_id);
      }
      if (filters.finance_bank_id !== null) {
        query = query.eq('finance_bank_id', filters.finance_bank_id);
      }
      if (filters.job_sector_id !== null) {
        query = query.eq('job_sector_id', filters.job_sector_id);
      }
      if (filters.interested_in_project_id !== null) {
        query = query.eq('interested_in_project_id', filters.interested_in_project_id);
      }
      if (filters.from_date) {
        query = query.gte('created_at', filters.from_date);
      }
      if (filters.to_date) {
        const nextDay = new Date(filters.to_date);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('created_at', nextDay.toISOString().split('T')[0]);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching clients:', error);
        alert('حدث خطأ في تحميل العملاء: ' + error.message);
        return;
      }

      setClients(data || []);
      const total = count || 0;
      setTotalClients(total);
      setTotalPages(Math.max(1, Math.ceil(total / itemsPerPage)));
    } catch (error) {
      console.error('Error in loadClients:', error);
      setClients([]);
      setTotalClients(0);
      setTotalPages(1);
    }
  }, [currentPage, itemsPerPage, filters, fetchAllowedProjects]);

  /* =====================
     Stats (UPDATED)
     - admin/sales_manager: زي ما كان
     - sales: نحسب total assigned فقط (لـ pagination)
  ===================== */
  const fetchClientStats = useCallback(async (emp: Employee | null = null) => {
    try {
      // ✅ SALES: total assigned only
      if (emp?.role === 'sales') {
        const { count, error } = await supabase
          .from('client_assignments')
          .select('client_id', { count: 'exact', head: true })
          .eq('employee_id', emp.id);

        if (error) throw error;

        const total = count || 0;
        setClientStats({
          leads: 0, reserved: 0, visited: 0, converted: 0, eligible: 0, nonEligible: 0, total
        });
        setTotalClients(total);
        setTotalPages(Math.max(1, Math.ceil(total / itemsPerPage)));
        return;
      }

      // admin / sales_manager counts القديمة (حسب clients)
      const getCount = async (field: string, value?: any) => {
        let query: any = supabase
          .from('clients')
          .select('id', { count: 'exact', head: true });

        if (field === 'status' && value) query = query.eq('status', value);
        else if (field === 'eligible' && value !== undefined) query = query.eq('eligible', value);

        if (emp?.role === 'sales_manager') {
          const allowedProjects = await fetchAllowedProjects(emp);
          const allowedProjectIds = allowedProjects.map(p => p.id);

          if (allowedProjectIds.length > 0) query = query.in('interested_in_project_id', allowedProjectIds);
          else return 0;
        }

        const { count, error } = await query;
        if (error) throw error;
        return count || 0;
      };

      const [leads, reserved, visited, converted, eligible, nonEligible, total] = await Promise.all([
        getCount('status', 'lead'),
        getCount('status', 'reserved'),
        getCount('status', 'visited'),
        getCount('status', 'converted'),
        getCount('eligible', true),
        getCount('eligible', false),
        getCount('')
      ]);

      const stats: ClientStats = { leads, reserved, visited, converted, eligible, nonEligible, total };

      setClientStats(stats);
      setTotalClients(total);
      setTotalPages(Math.max(1, Math.ceil(total / itemsPerPage)));
    } catch (err) {
      console.error('Error fetching client stats:', err);
      setClientStats({
        leads: 0,
        reserved: 0,
        visited: 0,
        converted: 0,
        eligible: 0,
        nonEligible: 0,
        total: 0
      });
      setTotalClients(0);
      setTotalPages(1);
    }
  }, [itemsPerPage, fetchAllowedProjects]);

  /* =====================
     Init
  ===================== */
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const emp = await getCurrentEmployee();
        setEmployee(emp);

        await fetchBanks();
        await fetchJobSectors();
        await fetchAllowedProjects(emp);

        if (emp?.role === 'admin') {
          await fetchAllProjects();
        }

        await loadClients(emp, 1);
        await fetchClientStats(emp);
      } catch (error) {
        console.error('Error initializing page:', error);
        alert('حدث خطأ في تحميل البيانات');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [fetchBanks, fetchJobSectors, fetchAllowedProjects, fetchAllProjects, fetchClientStats, loadClients]);

  useEffect(() => {
    if (nationality !== 'non_saudi') setResidencyType('');
  }, [nationality]);

  useEffect(() => {
    if (employee) loadClients(employee, currentPage);
  }, [currentPage, itemsPerPage, employee, loadClients]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value);
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  /* =====================
     FORM HANDLERS
  ===================== */
  function resetForm() {
    setEditingId(null);
    setName('');
    setMobile('');
    setEmail('');
    setIdentityType('');
    setIdentityNo('');
    setEligible(true);
    setNationality('saudi');
    setResidencyType('');
    setSalaryBankId('');
    setFinanceBankId('');
    setJobSectorId('');
    setInterestedInProjectId('');
  }

  // ✅ UPDATED: sales auto-assign after insert
  async function handleSubmit() {
    if (!name || !mobile) {
      alert('الاسم ورقم الجوال مطلوبين');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name,
        mobile,
        email: email || null,
        identity_type: identityType || null,
        identity_no: identityNo || null,
        eligible,
        nationality,
        residency_type: nationality === 'non_saudi' ? residencyType || null : null,
        salary_bank_id: salaryBankId || null,
        finance_bank_id: financeBankId || null,
        job_sector_id: jobSectorId || null,
        interested_in_project_id: interestedInProjectId || null,
        status: 'lead',
      };

      // 👇 نجيب id العميل الجديد
      const { data: inserted, error: insErr } = await supabase
        .from('clients')
        .insert(payload)
        .select('id')
        .single();

      if (insErr) {
        alert(insErr.message);
        return;
      }

      const newClientId = inserted?.id as string | undefined;

      // ✅ لو Sales: اعمل auto-assign عشان يشوف العميل
      if (employee?.role === 'sales' && newClientId) {
        const { error: asgErr } = await supabase.from('client_assignments').insert({
          client_id: newClientId,
          employee_id: employee.id,
          assigned_by: employee.id, // أو null لو مسموح
        });
        if (asgErr) {
          // ما نوقفش الدنيا، بس ننبه
          console.error('Auto-assign error:', asgErr);
          alert('تم إضافة العميل ✅ لكن حدث خطأ في تعيينه للمندوب. راجع صفحة التوزيع.');
        }
      }

      alert('تم إضافة العميل بنجاح');
      resetForm();

      setCurrentPage(1);
      await loadClients(employee, 1);
      await fetchClientStats(employee);
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      alert('حدث خطأ في حفظ البيانات');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClient(clientId: string) {
    if (employee?.role !== 'admin' && employee?.role !== 'sales_manager') {
      alert('لا تملك صلاحية حذف العملاء');
      return;
    }

    const confirmDelete = window.confirm('هل أنت متأكد من حذف العميل؟');
    if (!confirmDelete) return;

    try {
      const { count: reservationsCount } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId);

      if ((reservationsCount || 0) > 0) {
        alert('لا يمكن حذف عميل مرتبط بحجوزات');
        return;
      }

      const { error } = await supabase.from('clients').delete().eq('id', clientId);

      if (error) {
        alert(error.message);
        return;
      }

      alert('تم حذف العميل بنجاح');
      await loadClients(employee, currentPage);
      await fetchClientStats(employee);
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('حدث خطأ في حذف العميل');
    }
  }

  async function handleEditClient(clientId: string) {
    if (employee?.role !== 'admin' && employee?.role !== 'sales_manager') {
      alert('لا تملك صلاحية تعديل العملاء');
      return;
    }

    try {
      const { data: client, error } = await supabase.from('clients').select('*').eq('id', clientId).single();

      if (error) {
        alert('خطأ في جلب بيانات العميل: ' + error.message);
        return;
      }

      if (!client) {
        alert('العميل غير موجود');
        return;
      }

      setEditingId(client.id);
      setName(client.name);
      setMobile(client.mobile);
      setEmail(client.email || '');
      setIdentityType(client.identity_type || '');
      setIdentityNo(client.identity_no || '');
      setEligible(client.eligible);
      setNationality(client.nationality);
      setResidencyType(client.residency_type || '');
      setSalaryBankId(client.salary_bank_id || '');
      setFinanceBankId(client.finance_bank_id || '');
      setJobSectorId(client.job_sector_id || '');
      setInterestedInProjectId(client.interested_in_project_id || '');

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Error editing client:', error);
      alert('حدث خطأ في تحميل بيانات العميل');
    }
  }

  async function handleSaveEdit() {
    if (!name || !mobile) {
      alert('الاسم ورقم الجوال مطلوبين');
      return;
    }

    if (!editingId) return;

    setSaving(true);

    try {
      const payload = {
        name,
        mobile,
        email: email || null,
        identity_type: identityType || null,
        identity_no: identityNo || null,
        eligible,
        nationality,
        residency_type: nationality === 'non_saudi' ? residencyType || null : null,
        salary_bank_id: salaryBankId || null,
        finance_bank_id: financeBankId || null,
        job_sector_id: jobSectorId || null,
        interested_in_project_id: interestedInProjectId || null,
      };

      const { error } = await supabase.from('clients').update(payload).eq('id', editingId);

      if (error) {
        alert(error.message);
        return;
      }

      alert('تم تحديث بيانات العميل بنجاح');
      resetForm();
      await loadClients(employee, currentPage);
      await fetchClientStats(employee);
    } catch (error) {
      console.error('Error in handleSaveEdit:', error);
      alert('حدث خطأ في حفظ البيانات');
    } finally {
      setSaving(false);
    }
  }

  /* =====================
     Excel Import/Export (كما هو)
  ===================== */
  const processImportedClients = useCallback(async (data: any[]) => {
    const processedClients = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        const name = row['اسم العميل'] || row['name'] || row['Name'];
        const mobile = row['رقم الجوال'] || row['mobile'] || row['Mobile'];
        const email = row['البريد الإلكتروني'] || row['email'] || row['Email'];

        if (!name) {
          errors.push(`الصف ${rowNumber}: اسم العميل مطلوب`);
          continue;
        }

        if (!mobile) {
          errors.push(`الصف ${rowNumber}: رقم الجوال مطلوب`);
          continue;
        }

        const identityTypeMap: Record<string, string> = {
          'الهوية': 'national_id',
          'جواز سفر': 'passport',
          'إقامة': 'residence',
          'national_id': 'national_id',
          'passport': 'passport',
          'residence': 'residence'
        };

        const identityTypeText = row['نوع الهوية'] || row['identity_type'] || row['Identity Type'] || '';
        const identityType = identityTypeMap[identityTypeText] || identityTypeText;

        const identityNo = row['رقم الهوية'] || row['identity_no'] || row['Identity No'] || null;

        const nationalityMap: Record<string, 'saudi' | 'non_saudi'> = {
          'سعودي': 'saudi',
          'غير سعودي': 'non_saudi',
          'saudi': 'saudi',
          'non_saudi': 'non_saudi'
        };

        const nationalityText = row['الجنسية'] || row['nationality'] || row['Nationality'] || 'saudi';
        const nationality = nationalityMap[nationalityText] || 'saudi';

        const residencyTypeText = row['نوع الإقامة'] || row['residency_type'] || row['Residency Type'] || '';
        const residencyType = nationality === 'non_saudi' ? (residencyTypeText || null) : null;

        const statusMap: Record<string, string> = {
          'متابعة': 'lead',
          'محجوز': 'reserved',
          'تمت الزيارة': 'visited',
          'تم البيع': 'converted',
          'lead': 'lead',
          'reserved': 'reserved',
          'visited': 'visited',
          'converted': 'converted'
        };

        const statusText = row['الحالة'] || row['status'] || row['Status'] || 'lead';
        const status = statusMap[statusText] || 'lead';

        const eligibleMap: Record<string, boolean> = {
          'مستحق': true,
          'غير مستحق': false,
          'نعم': true,
          'لا': false,
          'yes': true,
          'no': false,
          'true': true,
          'false': false
        };

        const eligibleText = row['الأهلية'] || row['eligible'] || row['Eligible'] || 'مستحق';
        const eligible = eligibleMap[eligibleText] !== undefined ? eligibleMap[eligibleText] : true;

        const salaryBankName = row['بنك الراتب'] || row['salary_bank'] || row['Salary Bank'];
        const financeBankName = row['بنك التمويل'] || row['finance_bank'] || row['Finance Bank'];

        let salaryBankId = null;
        let financeBankId = null;

        if (salaryBankName && banks.length > 0) {
          const bank = banks.find(b =>
            b.name === salaryBankName ||
            b.name.includes(salaryBankName) ||
            salaryBankName.includes(b.name)
          );
          if (bank) salaryBankId = bank.id;
        }

        if (financeBankName && banks.length > 0) {
          const bank = banks.find(b =>
            b.name === financeBankName ||
            b.name.includes(financeBankName) ||
            financeBankName.includes(b.name)
          );
          if (bank) financeBankId = bank.id;
        }

        const jobSectorName = row['القطاع الوظيفي'] || row['job_sector'] || row['Job Sector'];
        let jobSectorId = null;

        if (jobSectorName && jobSectors.length > 0) {
          const jobSector = jobSectors.find(j =>
            j.name === jobSectorName ||
            j.name.includes(jobSectorName) ||
            jobSectorName.includes(j.name)
          );
          if (jobSector) jobSectorId = jobSector.id;
        }

        const projectName = row['مهتم بمشروع'] || row['project'] || row['Project'] || row['المشروع'] || '';
        let interestedInProjectId = null;

        if (projectName) {
          const projectsToSearch = employee?.role === 'admin' ? allProjects : allowedProjects;

          if (projectsToSearch.length > 0) {
            const project = projectsToSearch.find(p =>
              p.name === projectName ||
              p.name.includes(projectName) ||
              projectName.includes(p.name)
            );
            if (project) interestedInProjectId = project.id;
          }
        }

        const client = {
          name,
          mobile,
          email: email || null,
          identity_type: identityType || null,
          identity_no: identityNo,
          eligible,
          nationality,
          residency_type: residencyType,
          salary_bank_id: salaryBankId,
          finance_bank_id: financeBankId,
          job_sector_id: jobSectorId,
          interested_in_project_id: interestedInProjectId,
          status,
        };

        processedClients.push(client);
      } catch (error) {
        errors.push(`الصف ${rowNumber}: خطأ في معالجة البيانات - ${error}`);
      }
    }

    return { processedClients, errors };
  }, [banks, jobSectors, allProjects, allowedProjects, employee]);

  function handleExportExcel() {
    if (totalClients === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    let message = 'هل تريد تصدير العملاء إلى ملف Excel؟';
    if (hasActiveFilters()) message = 'هل تريد تصدير العملاء المفلترة إلى ملف Excel؟';

    const confirmExport = window.confirm(message);
    if (!confirmExport) return;

    setLoading(true);

    const fetchFilteredClients = async () => {
      try {
        let query: any = supabase.from('clients').select('*').order('created_at', { ascending: false });

        if (employee?.role === 'sales_manager') {
          const allowed = await fetchAllowedProjects(employee);
          const allowedIds = allowed.map(p => p.id);

          if (allowedIds.length > 0) query = query.in('interested_in_project_id', allowedIds);
          else {
            setClients([]);
            setTotalClients(0);
            return;
          }
        }

        if (filters.search) query = query.or(`name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%`);
        if (filters.status.length > 0) query = query.in('status', filters.status);
        if (filters.eligible !== null) query = query.eq('eligible', filters.eligible === 'true');
        if (filters.nationality !== null) query = query.eq('nationality', filters.nationality);
        if (filters.salary_bank_id !== null) query = query.eq('salary_bank_id', filters.salary_bank_id);
        if (filters.finance_bank_id !== null) query = query.eq('finance_bank_id', filters.finance_bank_id);
        if (filters.job_sector_id !== null) query = query.eq('job_sector_id', filters.job_sector_id);
        if (filters.interested_in_project_id !== null) query = query.eq('interested_in_project_id', filters.interested_in_project_id);
        if (filters.from_date) query = query.gte('created_at', filters.from_date);
        if (filters.to_date) {
          const nextDay = new Date(filters.to_date);
          nextDay.setDate(nextDay.getDate() + 1);
          query = query.lt('created_at', nextDay.toISOString().split('T')[0]);
        }

        const { data, error } = await query;
        if (error) throw error;

        const fileName = hasActiveFilters()
          ? `العملاء_المفلترة_${new Date().toISOString().split('T')[0]}.xlsx`
          : `العملاء_${new Date().toISOString().split('T')[0]}.xlsx`;

        const projectsForExport = employee?.role === 'admin' ? allProjects : allowedProjects;
        exportToExcel(data || [], projectsForExport, fileName);
      } catch (err) {
        console.error('Error fetching clients for export:', err);
        alert('حدث خطأ في تحميل البيانات للتصدير');
      } finally {
        setLoading(false);
      }
    };

    fetchFilteredClients();
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('الرجاء اختيار ملف Excel بصيغة .xlsx أو .xls أو .csv');
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setImportErrors([]);
    setShowImportErrors(false);

    try {
      await importFromExcel(
        file,
        async (data) => {
          const { processedClients, errors } = await processImportedClients(data);

          if (errors.length > 0) {
            setImportErrors(errors);
            setShowImportErrors(true);

            if (processedClients.length === 0) {
              alert('لا توجد عملاء صالحين للإضافة بسبب الأخطاء');
              setImporting(false);
              return;
            }
          }

          setImportProgress(30);

          let successCount = 0;
          let errorCount = 0;

          for (let i = 0; i < processedClients.length; i++) {
            const client = processedClients[i];

            try {
              const { error } = await supabase.from('clients').insert(client);
              if (error) {
                errorCount++;
                console.error(`Error importing client ${i + 1}:`, error);
              } else {
                successCount++;
              }
              const progress = 30 + Math.floor(((i + 1) / processedClients.length) * 70);
              setImportProgress(progress);
            } catch (clientError) {
              errorCount++;
              console.error(`Error importing client ${i + 1}:`, clientError);
            }
          }

          setImportProgress(100);

          let message = `تم استيراد ${successCount} عميل بنجاح.`;
          if (errorCount > 0) message += ` فشل استيراد ${errorCount} عميل.`;
          if (errors.length > 0) message += ` يوجد ${errors.length} خطأ في تنسيق البيانات.`;

          alert(message);

          setCurrentPage(1);
          await loadClients(employee, 1);
          await fetchClientStats(employee);

          if (fileInputRef.current) fileInputRef.current.value = '';
        },
        (errorMessage) => {
          alert(`خطأ في الاستيراد: ${errorMessage}`);
        }
      );
    } catch (error) {
      console.error('Error in file upload:', error);
      alert('حدث خطأ أثناء استيراد الملف');
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const templateData = [
      {
        'اسم العميل': 'محمد أحمد',
        'رقم الجوال': '0512345678',
        'البريد الإلكتروني': 'mohamed@example.com',
        'نوع الهوية': 'الهوية',
        'رقم الهوية': '1234567890',
        'الجنسية': 'سعودي',
        'نوع الإقامة': '',
        'الحالة': 'متابعة',
        'الأهلية': 'مستحق',
        'بنك الراتب': 'البنك الأهلي',
        'بنك التمويل': 'مصرف الراجحي',
        'القطاع الوظيفي': 'حكومي',
        'مهتم بمشروع': 'مشروع النخيل'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'العملاء');
    XLSX.writeFile(wb, 'قالب_استيراد_العملاء.xlsx');
  }

  const getDisplayProjects = () => {
    return employee?.role === 'admin' ? allProjects : allowedProjects;
  };

  /* =====================
     UI
  ===================== */
  return (
    <RequireAuth>
      <div className="page">
        {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
          <Card title="استيراد وتصدير البيانات">
            <div className="form-row" style={{ gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <Button onClick={handleExportExcel} disabled={totalClients === 0 || loading}>
                {hasActiveFilters() ? 'تصدير العملاء المفلترة' : 'تصدير جميع العملاء'}
              </Button>

              <Button onClick={handleImportClick} disabled={importing}>
                {importing ? 'جاري الاستيراد...' : 'استيراد من Excel'}
              </Button>

              <Button onClick={downloadTemplate}>تحميل القالب</Button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
              />

              {importing && (
                <div style={{ width: '100%', marginTop: '10px' }}>
                  <div style={{ width: '100%', backgroundColor: '#e0e0e0', borderRadius: '4px', overflow: 'hidden', marginBottom: '5px' }}>
                    <div style={{ width: `${importProgress}%`, height: '20px', backgroundColor: '#4CAF50', transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '14px', color: '#666' }}>{importProgress}%</div>
                </div>
              )}

              {showImportErrors && importErrors.length > 0 && (
                <div style={{ width: '100%', marginTop: '10px', padding: '10px', backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#c62828' }}>أخطاء الاستيراد ({importErrors.length})</strong>
                    <button
                      onClick={() => setShowImportErrors(false)}
                      style={{ padding: '5px 10px', fontSize: '12px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      إغلاق
                    </button>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {importErrors.map((error, index) => (
                      <div key={index} style={{ padding: '5px 0', borderBottom: index < importErrors.length - 1 ? '1px solid #ffcdd2' : 'none', fontSize: '12px', color: '#c62828' }}>
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {(employee?.role === 'admin' || employee?.role === 'sales' || employee?.role === 'sales_manager') && (
          <Card title={editingId ? 'تعديل عميل' : 'إضافة عميل'}>
            <div className="form-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Input placeholder="اسم العميل" value={name} onChange={(e) => setName(e.target.value)} />
              <Input placeholder="رقم الجوال" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              <Input placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />

              <select value={identityType} onChange={(e) => setIdentityType(e.target.value)} style={{ minWidth: '150px' }}>
                {IDENTITY_TYPES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>

              <Input placeholder="رقم الهوية" value={identityNo} onChange={(e) => setIdentityNo(e.target.value)} />

              <select value={eligible ? 'yes' : 'no'} onChange={(e) => setEligible(e.target.value === 'yes')} style={{ minWidth: '120px' }}>
                <option value="yes">مستحق</option>
                <option value="no">غير مستحق</option>
              </select>

              <select value={nationality} onChange={(e) => setNationality(e.target.value as any)} style={{ minWidth: '120px' }}>
                <option value="saudi">سعودي</option>
                <option value="non_saudi">غير سعودي</option>
              </select>

              {nationality === 'non_saudi' && (
                <select value={residencyType} onChange={(e) => setResidencyType(e.target.value)} style={{ minWidth: '150px' }}>
                  <option value="">نوع الإقامة</option>
                  {RESIDENCY_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              )}

              <select value={salaryBankId} onChange={(e) => setSalaryBankId(e.target.value)} style={{ minWidth: '150px' }}>
                <option value="">بنك الراتب</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>

              <select value={financeBankId} onChange={(e) => setFinanceBankId(e.target.value)} style={{ minWidth: '150px' }}>
                <option value="">بنك التمويل</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>

              <select value={jobSectorId} onChange={(e) => setJobSectorId(e.target.value)} style={{ minWidth: '150px' }}>
                <option value="">القطاع الوظيفي</option>
                {jobSectors.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>

              <select value={interestedInProjectId} onChange={(e) => setInterestedInProjectId(e.target.value)} style={{ minWidth: '150px' }}>
                <option value="">مهتم بمشروع (اختياري)</option>
                {getDisplayProjects().map(project => (
                  <option key={project.id} value={project.id}>{getProjectText(project)}</option>
                ))}
              </select>

              <Button onClick={editingId ? handleSaveEdit : handleSubmit} disabled={saving}>
                {saving ? 'جاري الحفظ...' : editingId ? 'تحديث' : 'حفظ'}
              </Button>

              {editingId && (
                <Button onClick={resetForm} variant="danger">إلغاء</Button>
              )}
            </div>
          </Card>
        )}

        <Card title="فلترة العملاء">
          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '16px' }}>
                {isFiltered ? 'الفلاتر النشطة' : 'فلترة العملاء'}
                {isFiltered && (
                  <span style={{ marginRight: '10px', fontSize: '14px', color: '#666' }}>
                    ({totalClients.toLocaleString()} نتيجة)
                  </span>
                )}
              </h4>

              <div style={{ display: 'flex', gap: '10px' }}>
                <Button onClick={() => setShowFilters(!showFilters)} variant={showFilters ? 'danger' : 'primary'}>
                  {showFilters ? 'إخفاء الفلاتر' : 'إظهار الفلاتر'}
                </Button>

                {isFiltered && (
                  <Button onClick={resetFilters} variant="danger">إعادة تعيين الفلاتر</Button>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="ابحث بالاسم أو رقم الجوال..."
                  value={filters.search}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  style={{ width: '100%', padding: '8px 40px 8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                />
                <button
                  onClick={applyFilters}
                  style={{ position: 'absolute', left: '5px', top: '50%', transform: 'translateY(-50%)', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}
                >
                  بحث
                </button>
              </div>
            </div>

            {showFilters && (
              <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #e9ecef', marginBottom: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>الحالة:</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {STATUS_OPTIONS.map(option => (
                        <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={filters.status.includes(option.value)}
                            onChange={(e) => handleStatusFilter(option.value, e.target.checked)}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>الأهلية:</label>
                    <select
                      value={filters.eligible || ''}
                      onChange={(e) => updateFilter('eligible', e.target.value || null)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                    >
                      {ELIGIBLE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>الجنسية:</label>
                    <select
                      value={filters.nationality || ''}
                      onChange={(e) => updateFilter('nationality', e.target.value || null)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                    >
                      {NATIONALITY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>بنك الراتب:</label>
                    <select
                      value={filters.salary_bank_id || ''}
                      onChange={(e) => updateFilter('salary_bank_id', e.target.value || null)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                    >
                      <option value="">جميع البنوك</option>
                      {banks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>بنك التمويل:</label>
                    <select
                      value={filters.finance_bank_id || ''}
                      onChange={(e) => updateFilter('finance_bank_id', e.target.value || null)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                    >
                      <option value="">جميع البنوك</option>
                      {banks.map(bank => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>القطاع الوظيفي:</label>
                    <select
                      value={filters.job_sector_id || ''}
                      onChange={(e) => updateFilter('job_sector_id', e.target.value || null)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                    >
                      <option value="">جميع القطاعات</option>
                      {jobSectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>المشروع المهتم به:</label>
                    <select
                      value={filters.interested_in_project_id || ''}
                      onChange={(e) => updateFilter('interested_in_project_id', e.target.value || null)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                    >
                      <option value="">جميع المشاريع</option>
                      {getDisplayProjects().map(project => (
                        <option key={project.id} value={project.id}>{getProjectText(project)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>تاريخ الإضافة:</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>من:</label>
                        <input
                          type="date"
                          value={filters.from_date}
                          onChange={(e) => updateFilter('from_date', e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>إلى:</label>
                        <input
                          type="date"
                          value={filters.to_date}
                          onChange={(e) => updateFilter('to_date', e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dee2e6', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button onClick={applyFilters} disabled={loading}>
                    {loading ? 'جاري التطبيق...' : 'تطبيق الفلاتر'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card title={`قائمة العملاء (${totalClients.toLocaleString()})`}>
          {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 15px',
              backgroundColor: '#f5f5f5',
              borderBottom: '1px solid #e0e0e0',
              marginBottom: '15px',
              borderRadius: '4px 4px 0 0',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#2196F3', fontWeight: 'bold' }}>{clientStats.leads.toLocaleString()}</span> متابعة
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#FF9800', fontWeight: 'bold' }}>{clientStats.reserved.toLocaleString()}</span> محجوز
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{clientStats.visited.toLocaleString()}</span> تمت الزيارة
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#9C27B0', fontWeight: 'bold' }}>{clientStats.converted.toLocaleString()}</span> تم البيع
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{clientStats.eligible.toLocaleString()}</span> مستحق
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#F44336', fontWeight: 'bold' }}>{clientStats.nonEligible.toLocaleString()}</span> غير مستحق
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>عرض:</span>
                <select
                  value={itemsPerPage}
                  onChange={handleItemsPerPageChange}
                  style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>
          )}

          <Table headers={['الاسم', 'الجوال', 'مستحق', 'الحالة', 'مهتم بـ', 'إجراء']}>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>جاري تحميل العملاء...</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>لا يوجد عملاء</td></tr>
            ) : (
              clients.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.mobile || '-'}</td>
                  <td>
                    <span className={`badge ${c.eligible ? 'success' : 'danger'}`}>
                      {c.eligible ? 'مستحق' : 'غير مستحق'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge status-${c.status}`}>{translateStatus(c.status)}</span>
                  </td>
                  <td>
                    {c.interested_in_project_id ? (
                      <span className="badge" style={{ backgroundColor: '#e1f5fe', color: '#0288d1' }}>
                        {getProjectText(getDisplayProjects().find(p => p.id === c.interested_in_project_id))}
                      </span>
                    ) : (
                      <span style={{ color: '#999', fontSize: '12px' }}>-</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button onClick={() => router.push(`/dashboard/clients/${c.id}`)}>فتح</Button>

                      {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
                        <>
                          <Button onClick={() => handleEditClient(c.id)}>تعديل</Button>
                          <Button onClick={() => handleDeleteClient(c.id)} variant="danger">حذف</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </Table>

          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '15px',
              borderTop: '1px solid #e0e0e0',
              backgroundColor: '#f9f9f9',
              borderRadius: '0 0 4px 4px',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ fontSize: '14px', color: '#666' }}>
                عرض {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalClients)} من {totalClients.toLocaleString()} عميل
              </div>

              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '5px 10px',
                    minWidth: '40px',
                    backgroundColor: currentPage === 1 ? '#e5e7eb' : '#3b82f6',
                    color: currentPage === 1 ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 1 ? 0.6 : 1
                  }}
                >
                  ⟨⟨
                </button>

                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '5px 10px',
                    minWidth: '40px',
                    backgroundColor: currentPage === 1 ? '#e5e7eb' : '#3b82f6',
                    color: currentPage === 1 ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 1 ? 0.6 : 1
                  }}
                >
                  ⟨
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      style={{
                        padding: '5px 10px',
                        minWidth: '40px',
                        backgroundColor: currentPage === pageNum ? '#1d4ed8' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: currentPage === pageNum ? 'bold' : 'normal'
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '5px 10px',
                    minWidth: '40px',
                    backgroundColor: currentPage === totalPages ? '#e5e7eb' : '#3b82f6',
                    color: currentPage === totalPages ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages ? 0.6 : 1
                  }}
                >
                  ⟩
                </button>

                <button
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '5px 10px',
                    minWidth: '40px',
                    backgroundColor: currentPage === totalPages ? '#e5e7eb' : '#3b82f6',
                    color: currentPage === totalPages ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages ? 0.6 : 1
                  }}
                >
                  ⟩⟩
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>الصفحة:</span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= totalPages) setCurrentPage(page);
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) setCurrentPage(1);
                  }}
                  style={{ width: '60px', padding: '5px', border: '1px solid #ddd', borderRadius: '4px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '14px', color: '#666' }}>من {totalPages}</span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </RequireAuth>
  );
}
