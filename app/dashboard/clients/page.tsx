'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
  created_at: string;
};

type Option = {
  id: string;
  name: string;
};

type Employee = {
  id: string;
  role: 'admin' | 'sales';
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

// نوع جديد لفلتر العملاء
type ClientFilters = {
  search: string;
  status: string[];
  eligible: string | null;
  nationality: string | null;
  salary_bank_id: string | null;
  finance_bank_id: string | null;
  job_sector_id: string | null;
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

// ... باقي الدوال الموجودة (exportToExcel, importFromExcel, processImportedClients) ...

/* =====================
   Page
===================== */
export default function ClientsPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [banks, setBanks] = useState<Option[]>([]);
  const [jobSectors, setJobSectors] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Statistics states
  const [clientStats, setClientStats] = useState<ClientStats>({
    leads: 0,
    reserved: 0,
    visited: 0,
    converted: 0,
    eligible: 0,
    nonEligible: 0,
    total: 0
  });
  
  // Excel import states
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showImportErrors, setShowImportErrors] = useState(false);

  // Filter states
  const [filters, setFilters] = useState<ClientFilters>({
    search: '',
    status: [],
    eligible: null,
    nationality: null,
    salary_bank_id: null,
    finance_bank_id: null,
    job_sector_id: null,
    from_date: '',
    to_date: '',
  });

  const [showFilters, setShowFilters] = useState(false);
  const [isFiltered, setIsFiltered] = useState(false);

  // form
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const emp = await getCurrentEmployee();
        setEmployee(emp);
        await fetchBanks();
        await fetchJobSectors();
        await loadClients(emp);
        await fetchClientStats(emp);
      } catch (error) {
        console.error('Error initializing page:', error);
        alert('حدث خطأ في تحميل البيانات');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (nationality !== 'non_saudi') {
      setResidencyType('');
    }
  }, [nationality]);

  /* =====================
     FILTER FUNCTIONS
  ===================== */
  
  // تحديث الفلاتر
  const updateFilter = (key: keyof ClientFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // تحديث فلاتر الحالة
  const handleStatusFilter = (status: string, checked: boolean) => {
    const newStatus = checked 
      ? [...filters.status, status]
      : filters.filter(s => s !== status);
    
    updateFilter('status', newStatus);
  };

  // تطبيق الفلاتر
  const applyFilters = () => {
    setCurrentPage(1); // العودة للصفحة الأولى عند التصفية
    loadClients(employee, 1);
    setIsFiltered(true);
  };

  // إعادة تعيين الفلاتر
  const resetFilters = () => {
    setFilters({
      search: '',
      status: [],
      eligible: null,
      nationality: null,
      salary_bank_id: null,
      finance_bank_id: null,
      job_sector_id: null,
      from_date: '',
      to_date: '',
    });
    setCurrentPage(1);
    loadClients(employee, 1);
    setIsFiltered(false);
  };

  // التحقق إذا كانت هناك فلاتر نشطة
  const hasActiveFilters = () => {
    return filters.search || 
           filters.status.length > 0 || 
           filters.eligible !== null ||
           filters.nationality !== null ||
           filters.salary_bank_id !== null ||
           filters.finance_bank_id !== null ||
           filters.job_sector_id !== null ||
           filters.from_date ||
           filters.to_date;
  };

  /* =====================
     LOAD DATA WITH FILTERS
  ===================== */
  async function loadClients(emp: Employee | null = null, page: number = currentPage) {
    try {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('clients')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      // تطبيق فلاتر البحث
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,mobile.ilike.%${filters.search}%`);
      }

      // تطبيق فلاتر الحالة
      if (filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      // تطبيق فلتر الأهلية
      if (filters.eligible !== null) {
        query = query.eq('eligible', filters.eligible === 'true');
      }

      // تطبيق فلتر الجنسية
      if (filters.nationality !== null) {
        query = query.eq('nationality', filters.nationality);
      }

      // تطبيق فلتر بنك الراتب
      if (filters.salary_bank_id !== null) {
        query = query.eq('salary_bank_id', filters.salary_bank_id);
      }

      // تطبيق فلتر بنك التمويل
      if (filters.finance_bank_id !== null) {
        query = query.eq('finance_bank_id', filters.finance_bank_id);
      }

      // تطبيق فلتر القطاع الوظيفي
      if (filters.job_sector_id !== null) {
        query = query.eq('job_sector_id', filters.job_sector_id);
      }

      // تطبيق فلاتر التاريخ
      if (filters.from_date) {
        query = query.gte('created_at', filters.from_date);
      }

      if (filters.to_date) {
        // إضافة يوم كامل للنهاية
        const nextDay = new Date(filters.to_date);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('created_at', nextDay.toISOString().split('T')[0]);
      }

      // ملاحظة: إذا كان هناك تصفية للمبيعات بناءً على المشاريع، أضفها هنا

      const { data, error, count } = await query;
      
      if (error) { 
        console.error('Error fetching clients:', error);
        alert('حدث خطأ في تحميل العملاء: ' + error.message); 
        return; 
      }
      
      setClients(data || []);
      if (count !== null) {
        setTotalClients(count);
        setTotalPages(Math.ceil(count / itemsPerPage));
      }
    } catch (error) {
      console.error('Error in loadClients:', error);
      setClients([]);
    }
  }

  // ... باقي الدوال (fetchBanks, fetchJobSectors, fetchClientStats, handleSubmit, etc) ...

  /* =====================
     Pagination Handlers
  ===================== */
  useEffect(() => {
    if (employee) {
      loadClients(employee, currentPage);
    }
  }, [currentPage, itemsPerPage]);

  // ... باقي دوال ال Pagination ...

  /* =====================
     Excel Export with Filters
  ===================== */
  function handleExportExcel() {
    if (totalClients === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    
    let message = 'هل تريد تصدير العملاء إلى ملف Excel؟';
    if (hasActiveFilters()) {
      message = 'هل تريد تصدير العملاء المفلترة إلى ملف Excel؟';
    }
    
    const confirmExport = window.confirm(message);
    
    if (!confirmExport) return;

    setLoading(true);
    
    // جلب العملاء حسب الفلاتر
    const fetchFilteredClients = async () => {
      try {
        let query = supabase
          .from('clients')
          .select('*')
          .order('created_at', { ascending: false });

        // تطبيق نفس الفلاتر
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

        if (filters.from_date) {
          query = query.gte('created_at', filters.from_date);
        }

        if (filters.to_date) {
          const nextDay = new Date(filters.to_date);
          nextDay.setDate(nextDay.getDate() + 1);
          query = query.lt('created_at', nextDay.toISOString().split('T')[0]);
        }

        // ملاحظة: إذا كان هناك تصفية للمبيعات بناءً على المشاريع، أضفها هنا

        const { data, error } = await query;
        if (error) throw error;

        const fileName = `العملاء_${new Date().toISOString().split('T')[0]}.xlsx`;
        if (hasActiveFilters()) {
          exportToExcel(data || [], `العملاء_المفلترة_${new Date().toISOString().split('T')[0]}.xlsx`);
        } else {
          exportToExcel(data || [], fileName);
        }
        
      } catch (err) {
        console.error('Error fetching clients for export:', err);
        alert('حدث خطأ في تحميل البيانات للتصدير');
      } finally {
        setLoading(false);
      }
    };

    fetchFilteredClients();
  }

  /* =====================
     UI
  ===================== */
  return (
    <RequireAuth>
      <div className="page">
        {/* Excel Import/Export Section - للادمن فقط */}
        {employee?.role === 'admin' && (
          <Card title="استيراد وتصدير البيانات">
            <div className="form-row" style={{ gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <Button onClick={handleExportExcel} disabled={totalClients === 0 || loading}>
                {hasActiveFilters() ? 'تصدير العملاء المفلترة' : 'تصدير جميع العملاء'}
              </Button>
              
              <Button onClick={handleImportClick} disabled={importing}>
                {importing ? 'جاري الاستيراد...' : 'استيراد من Excel'}
              </Button>
              
              <Button onClick={downloadTemplate}>
                تحميل القالب
              </Button>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
              />
              
              {/* ... rest of import section ... */}
            </div>
          </Card>
        )}

        {/* FORM */}
        {(employee?.role === 'admin' || employee?.role === 'sales') && (
          <Card title={editingId ? 'تعديل عميل' : 'إضافة عميل'}>
            {/* ... form fields ... */}
          </Card>
        )}

        {/* FILTERS SECTION */}
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
                <Button 
                  onClick={() => setShowFilters(!showFilters)}
                  variant={showFilters ? 'danger' : 'primary'}
                  style={{ padding: '8px 15px' }}
                >
                  {showFilters ? 'إخفاء الفلاتر' : 'إظهار الفلاتر'}
                </Button>
                
                {isFiltered && (
                  <Button 
                    onClick={resetFilters}
                    variant="danger"
                    style={{ padding: '8px 15px' }}
                  >
                    إعادة تعيين الفلاتر
                  </Button>
                )}
              </div>
            </div>
            
            {/* Search Bar */}
            <div style={{ marginBottom: '15px' }}>
              <Input 
                placeholder="ابحث بالاسم أو رقم الجوال..." 
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') applyFilters();
                }}
                style={{ width: '100%' }}
              />
            </div>
            
            {/* Advanced Filters */}
            {showFilters && (
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '20px', 
                borderRadius: '8px',
                border: '1px solid #e9ecef',
                marginBottom: '15px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                  
                  {/* Status Filters */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
                      الحالة:
                    </label>
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
                  
                  {/* Eligibility Filter */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
                      الأهلية:
                    </label>
                    <select 
                      value={filters.eligible || ''}
                      onChange={(e) => updateFilter('eligible', e.target.value || null)}
                      style={{ 
                        width: '100%', 
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #dee2e6',
                        fontSize: '14px'
                      }}
                    >
                      {ELIGIBLE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Nationality Filter */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
                      الجنسية:
                    </label>
                    <select 
                      value={filters.nationality || ''}
                      onChange={(e) => updateFilter('nationality', e.target.value || null)}
                      style={{ 
                        width: '100%', 
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #dee2e6',
                        fontSize: '14px'
                      }}
                    >
                      {NATIONALITY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Salary Bank Filter */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
                      بنك الراتب:
                    </label>
                    <select 
                      value={filters.salary_bank_id || ''}
                      onChange={(e) => updateFilter('salary_bank_id', e.target.value || null)}
                      style={{ 
                        width: '100%', 
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #dee2e6',
                        fontSize: '14px'
                      }}
                    >
                      <option value="">جميع البنوك</option>
                      {banks.map(bank => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Finance Bank Filter */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
                      بنك التمويل:
                    </label>
                    <select 
                      value={filters.finance_bank_id || ''}
                      onChange={(e) => updateFilter('finance_bank_id', e.target.value || null)}
                      style={{ 
                        width: '100%', 
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #dee2e6',
                        fontSize: '14px'
                      }}
                    >
                      <option value="">جميع البنوك</option>
                      {banks.map(bank => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Job Sector Filter */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
                      القطاع الوظيفي:
                    </label>
                    <select 
                      value={filters.job_sector_id || ''}
                      onChange={(e) => updateFilter('job_sector_id', e.target.value || null)}
                      style={{ 
                        width: '100%', 
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #dee2e6',
                        fontSize: '14px'
                      }}
                    >
                      <option value="">جميع القطاعات</option>
                      {jobSectors.map(sector => (
                        <option key={sector.id} value={sector.id}>
                          {sector.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Date Range Filters */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
                      تاريخ الإضافة:
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>
                          من:
                        </label>
                        <input
                          type="date"
                          value={filters.from_date}
                          onChange={(e) => updateFilter('from_date', e.target.value)}
                          style={{ 
                            width: '100%', 
                            padding: '8px 12px',
                            borderRadius: '4px',
                            border: '1px solid #dee2e6',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>
                          إلى:
                        </label>
                        <input
                          type="date"
                          value={filters.to_date}
                          onChange={(e) => updateFilter('to_date', e.target.value)}
                          style={{ 
                            width: '100%', 
                            padding: '8px 12px',
                            borderRadius: '4px',
                            border: '1px solid #dee2e6',
                            fontSize: '14px'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  
                </div>
                
                {/* Active Filters Badges */}
                {hasActiveFilters() && (
                  <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #dee2e6' }}>
                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '14px' }}>
                      الفلاتر النشطة:
                    </label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {filters.search && (
                        <span style={{ 
                          backgroundColor: '#e3f2fd', 
                          color: '#1976d2',
                          padding: '5px 10px',
                          borderRadius: '15px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          بحث: {filters.search}
                          <button 
                            onClick={() => updateFilter('search', '')}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: '#1976d2',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: 0
                            }}
                          >
                            ×
                          </button>
                        </span>
                      )}
                      
                      {filters.status.map(status => (
                        <span key={status} style={{ 
                          backgroundColor: '#e8f5e9', 
                          color: '#2e7d32',
                          padding: '5px 10px',
                          borderRadius: '15px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          {translateStatus(status)}
                          <button 
                            onClick={() => handleStatusFilter(status, false)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: '#2e7d32',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: 0
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      
                      {filters.eligible && (
                        <span style={{ 
                          backgroundColor: '#fff3e0', 
                          color: '#f57c00',
                          padding: '5px 10px',
                          borderRadius: '15px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          أهلية: {filters.eligible === 'true' ? 'مستحق' : 'غير مستحق'}
                          <button 
                            onClick={() => updateFilter('eligible', null)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: '#f57c00',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: 0
                            }}
                          >
                            ×
                          </button>
                        </span>
                      )}
                      
                      {filters.nationality && (
                        <span style={{ 
                          backgroundColor: '#f3e5f5', 
                          color: '#7b1fa2',
                          padding: '5px 10px',
                          borderRadius: '15px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          جنسية: {translateNationality(filters.nationality)}
                          <button 
                            onClick={() => updateFilter('nationality', null)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: '#7b1fa2',
                              cursor: 'pointer',
                              fontSize: '14px',
                              padding: 0
                            }}
                          >
                            ×
                          </button>
                        </span>
                      )}
                      
                      {/* Add similar badges for other filters */}
                    </div>
                  </div>
                )}
                
                {/* Apply Filters Button */}
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button 
                    onClick={applyFilters}
                    disabled={loading}
                    style={{ padding: '10px 25px', fontSize: '14px' }}
                  >
                    {loading ? 'جاري التطبيق...' : 'تطبيق الفلاتر'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* جدول العملاء */}
        <Card title={`قائمة العملاء (${totalClients.toLocaleString()})`}>
          {/* ... Statistics Section (same as before) ... */}
          
          <Table headers={['الاسم','الجوال','مستحق','الحالة','إجراء']}>
            {/* ... Table rows (same as before) ... */}
          </Table>

          {/* Pagination Footer (same as before) */}
        </Card>
      </div>
    </RequireAuth>
  );
}