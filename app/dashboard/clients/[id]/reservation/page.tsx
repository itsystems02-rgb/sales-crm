'use client';

import { useEffect, useState, ChangeEvent, KeyboardEvent, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/* =====================
   Types
===================== */

type Unit = {
  id: string;
  unit_code: string;
  project_id: string;
  project_name?: string;
  project_code?: string;
  model_name?: string;
  unit_type: string;
  supported_price: number;
  land_area: number | null;
  build_area: number | null;
  status: string;
};

type Bank = {
  id: string;
  name: string;
};

type FollowUp = {
  employee_id: string | null;
  created_at: string | null;
  notes: string | null;
};

type ReservationStatus = 'active' | 'cancelled' | 'converted';

type Employee = {
  id: string;
  role: 'admin' | 'sales';
};

type UnitStats = {
  total: number;
  filtered: number;
};

/* =====================
   Page
===================== */

export default function ReservationPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [units, setUnits] = useState<Unit[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [lastFollowUp, setLastFollowUp] = useState<FollowUp | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalUnits, setTotalUnits] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [unitStats, setUnitStats] = useState<UnitStats>({ total: 0, filtered: 0 });
  
  // Form states
  const [unitId, setUnitId] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankEmployeeName, setBankEmployeeName] = useState('');
  const [bankEmployeeMobile, setBankEmployeeMobile] = useState('');
  const [status, setStatus] = useState<ReservationStatus | ''>('');
  const [notes, setNotes] = useState('');
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Search debounce state
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Note options states
  const [noteOptions, setNoteOptions] = useState<string[]>([
    'حجز قائم - المستفيد يرغب في الإلغاء',
    'جاري رفع الطلب',
    'لم يتم الرد',
    'تحويل راتب - تغيير الجهة التمويلية',
    'جديد - جاري المتابعة',
    'توفير دفعة أولى',
    'انتظار موافقة البنك',
    'البحث عن نسبة',
    'البحث عن جهة تمويلية',
    'تم التنفيذ',
    'تأخير من قبل الجهة التمويلية',
    'سداد التزامات',
    'العميل غير جاد',
    'فترة انتظار البنك',
    'في انتظار نزول الراتب',
    'تم الرفض من الجهة التمويلية',
    'لا يمكن تمويل العميل'
  ]);
  const [noteSearchTerm, setNoteSearchTerm] = useState('');
  const [filteredNoteOptions, setFilteredNoteOptions] = useState<string[]>([]);

  /* =====================
     INIT
  ===================== */
  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const emp = await getCurrentEmployee();
      setEmployee(emp);
      
      if (!emp) {
        setLoading(false);
        return;
      }

      await fetchBanksAndFollowUp();
      await fetchUnitStats(emp);
      await loadUnits(emp, currentPage);
      
      setLoading(false);
    } catch (err) {
      console.error('Error in init():', err);
      setLoading(false);
    }
  }

  /* =====================
     Fetch Functions
  ===================== */

  async function fetchBanksAndFollowUp() {
    // تحميل البنوك
    const { data: b } = await supabase
      .from('banks')
      .select('id, name')
      .order('name');
    setBanks(b || []);

    // تحميل آخر متابعة
    const { data: follow } = await supabase
      .from('client_followups')
      .select('employee_id, created_at, notes')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastFollowUp(follow || null);
  }

  async function fetchUnitStats(emp: Employee) {
    try {
      // إجمالي الوحدات المتاحة
      let countQuery = supabase
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'available');

      if (emp.role === 'sales') {
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        
        if (allowedProjectIds.length > 0) {
          countQuery = countQuery.in('project_id', allowedProjectIds);
        } else {
          countQuery = countQuery.eq('project_id', 'no-projects');
        }
      }

      const { count, error } = await countQuery;
      if (error) throw error;

      setUnitStats({
        total: count || 0,
        filtered: count || 0
      });
      
    } catch (err) {
      console.error('Error fetching unit stats:', err);
      setUnitStats({ total: 0, filtered: 0 });
    }
  }

  /* =====================
     Note Functions
  ===================== */

  // دالة لتصفية خيارات الملاحظات
  const filterNoteOptions = useCallback((search: string) => {
    if (!search.trim()) {
      setFilteredNoteOptions(noteOptions);
      return;
    }
    
    const filtered = noteOptions.filter(option =>
      option.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredNoteOptions(filtered);
  }, [noteOptions]);

  // دالة لإضافة ملاحظة مخصصة
  const handleAddCustomNote = () => {
    if (notes.trim() && !noteOptions.includes(notes.trim())) {
      setNoteOptions([notes.trim(), ...noteOptions]);
      setNotes('');
      setNoteSearchTerm('');
    }
  };

  // تهيئة خيارات الملاحظات عند التحميل
  useEffect(() => {
    setFilteredNoteOptions(noteOptions);
  }, [noteOptions]);

  // تصفية خيارات الملاحظات عند تغيير البحث
  useEffect(() => {
    filterNoteOptions(noteSearchTerm);
  }, [noteSearchTerm, filterNoteOptions]);

  /* =====================
     Search and Load Functions - محسّنة
  ===================== */

  // دالة البحث المحسنة مع دعم جميع الحقول
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    
    // إلغاء الوقت السابق إذا كان موجودًا
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // ضبط وقت جديد للبحث
    const timeout = setTimeout(() => {
      setCurrentPage(1);
      if (employee) {
        loadUnits(employee, 1);
      }
    }, 300); // انتظار 300 مللي ثانية بعد آخر كتابة
    
    setSearchTimeout(timeout);
  }, [employee, searchTimeout]);

  async function loadUnits(emp: Employee | null = null, page: number = currentPage) {
    if (!emp) return;
    
    setLoading(true);

    try {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('units')
        .select(`
          id,
          unit_code,
          project_id,
          unit_type,
          status,
          supported_price,
          land_area,
          build_area,
          block_no,
          unit_no,
          project:projects!units_project_id_fkey (name,code),
          model:project_models!units_model_id_fkey (name)
        `, { count: 'exact' })
        .eq('status', 'available')
        .order('unit_code')
        .range(from, to);

      // تطبيق الفلاتر
      if (emp.role === 'sales') {
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        
        if (allowedProjectIds.length > 0) {
          query = query.in('project_id', allowedProjectIds);
        } else {
          query = query.eq('project_id', 'no-projects');
        }
      }

      // فلتر المشروع
      if (selectedProject) {
        query = query.eq('project_id', selectedProject);
      }

      // فلتر النوع
      if (selectedType) {
        query = query.eq('unit_type', selectedType);
      }

      // فلتر السعر
      if (minPrice) {
        query = query.gte('supported_price', Number(minPrice));
      }
      if (maxPrice) {
        query = query.lte('supported_price', Number(maxPrice));
      }

      // فلتر البحث - محسّن بشكل كبير
      if (searchTerm.trim()) {
        const searchTermLower = searchTerm.trim().toLowerCase();
        
        // البحث في جميع الحقول المهمة
        query = query.or(
          `unit_code.ilike.%${searchTermLower}%,` +
          `projects.name.ilike.%${searchTermLower}%,` +
          `project_models.name.ilike.%${searchTermLower}%,` +
          `block_no.ilike.%${searchTermLower}%,` +
          `unit_no.ilike.%${searchTermLower}%`
        );
      }

      const { data, error, count } = await query;
      
      if (error) {
        console.error('Error loading units:', error);
        setUnits([]);
        return;
      }

      // Normalize data
      const normalized = (data || []).map((item: any) => ({
        id: item.id,
        unit_code: item.unit_code,
        project_id: item.project_id,
        project_name: item.project?.name || '',
        project_code: item.project?.code || '',
        model_name: item.model?.name || '',
        unit_type: item.unit_type,
        supported_price: Number(item.supported_price || 0),
        land_area: item.land_area ? Number(item.land_area) : null,
        build_area: item.build_area ? Number(item.build_area) : null,
        status: item.status
      }));

      setUnits(normalized);
      
      if (count !== null) {
        setTotalUnits(count);
        setTotalPages(Math.ceil(count / itemsPerPage));
        setUnitStats(prev => ({ ...prev, filtered: count }));
      }
      
    } catch (err) {
      console.error('Error in loadUnits():', err);
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }

  // دالة البحث السريع بالضغط على Enter
  const handleSearch = () => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    setCurrentPage(1);
    if (employee) {
      loadUnits(employee, 1);
    }
  };

  // دالة البحث الدقيق (اختياري)
  async function searchUnitsExact(searchTerm: string) {
    if (!employee) return;
    
    setLoading(true);
    
    try {
      // استعلام منفصل للبحث الدقيق
      const { data, error } = await supabase
        .from('units')
        .select(`
          id,
          unit_code,
          project_id,
          unit_type,
          status,
          supported_price,
          land_area,
          build_area,
          project:projects!units_project_id_fkey (name,code),
          model:project_models!units_model_id_fkey (name)
        `)
        .eq('status', 'available')
        .ilike('unit_code', `%${searchTerm}%`)
        .limit(100);

      if (error) {
        console.error('Search error:', error);
        return;
      }

      // تطبيق فلتر الصلاحية إذا كان sales
      let filteredData = data || [];
      if (employee.role === 'sales') {
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', employee.id);

        const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
        
        if (allowedProjectIds.length > 0) {
          filteredData = filteredData.filter(unit => 
            allowedProjectIds.includes(unit.project_id)
          );
        } else {
          filteredData = [];
        }
      }

      // تحديث الوحدات
      const normalized = filteredData.map((item: any) => ({
        id: item.id,
        unit_code: item.unit_code,
        project_id: item.project_id,
        project_name: item.project?.name || '',
        project_code: item.project?.code || '',
        model_name: item.model?.name || '',
        unit_type: item.unit_type,
        supported_price: Number(item.supported_price || 0),
        land_area: item.land_area ? Number(item.land_area) : null,
        build_area: item.build_area ? Number(item.build_area) : null,
        status: item.status
      }));

      setUnits(normalized);
      setTotalUnits(normalized.length);
      setTotalPages(Math.ceil(normalized.length / itemsPerPage));
      setUnitStats(prev => ({ ...prev, filtered: normalized.length }));
      
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }

  // دالة البحث المحسنة
  const handleSearchImproved = () => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    setCurrentPage(1);
    if (employee && searchTerm.trim()) {
      searchUnitsExact(searchTerm.trim());
    } else if (employee) {
      loadUnits(employee, 1);
    }
  };

  /* =====================
     Pagination Handlers
  ===================== */

  useEffect(() => {
    if (employee) {
      loadUnits(employee, currentPage);
    }
  }, [currentPage, itemsPerPage, selectedProject, selectedType, minPrice, maxPrice]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value);
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedProject('');
    setSelectedType('');
    setMinPrice('');
    setMaxPrice('');
    setCurrentPage(1);
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    if (employee) {
      loadUnits(employee, 1);
    }
  };

  /* =====================
     Submit Reservation
  ===================== */

  async function submit() {
    if (!unitId || !reservationDate) {
      alert('من فضلك اختر الوحدة وتاريخ الحجز');
      return;
    }

    if (!employee?.id) {
      alert('لم يتم تحديد الموظف الحالي');
      return;
    }

    // التحقق من أن الوحدة مازالت متاحة
    const selectedUnit = units.find(u => u.id === unitId);
    if (!selectedUnit) {
      alert('الوحدة غير موجودة أو غير متاحة');
      return;
    }

    if (selectedUnit.status !== 'available') {
      alert('عذراً، هذه الوحدة لم تعد متاحة للحجز');
      await loadUnits(employee, currentPage);
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from('reservations')
      .insert({
        client_id: clientId,
        unit_id: unitId,
        employee_id: employee.id,
        reservation_date: reservationDate,
        bank_name: bankName || null,
        bank_employee_name: bankEmployeeName || null,
        bank_employee_mobile: bankEmployeeMobile || null,
        status: status || 'active',
        notes: notes || null,
        follow_employee_id: lastFollowUp?.employee_id || null,
        last_follow_up_at: lastFollowUp?.created_at || null,
        follow_up_details: lastFollowUp?.notes || null,
      })
      .select('id')
      .single();

    if (error) {
      alert(error.message);
      setSaving(false);
      return;
    }

    // تحديث حالة العميل والوحدة
    await supabase.from('clients').update({ status: 'reserved' }).eq('id', clientId);
    await supabase.from('units').update({ status: 'reserved' }).eq('id', unitId);

    setReservationId(data.id);
    
    // تحديث قائمة الوحدات بعد الحجز
    await fetchUnitStats(employee);
    await loadUnits(employee, currentPage);
    resetForm();
    
    setSaving(false);
  }

  /* =====================
     Reset Form
  ===================== */
  function resetForm() {
    setUnitId('');
    setReservationDate('');
    setBankName('');
    setBankEmployeeName('');
    setBankEmployeeMobile('');
    setStatus('');
    setNotes('');
    setNoteSearchTerm('');
  }

  /* =====================
     UI Components
  ===================== */

  function renderPagination() {
    if (totalPages <= 1) return null;

    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center',
        alignItems: 'center',
        gap: '10px',
        marginTop: '20px',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          style={{ 
            padding: '8px 12px',
            backgroundColor: currentPage === 1 ? '#e5e7eb' : '#3b82f6',
            color: currentPage === 1 ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
          }}
        >
          ⟨⟨
        </button>
        
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={{ 
            padding: '8px 12px',
            backgroundColor: currentPage === 1 ? '#e5e7eb' : '#3b82f6',
            color: currentPage === 1 ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
          }}
        >
          ⟨
        </button>

        <span style={{ fontSize: '14px', color: '#666' }}>
          الصفحة {currentPage} من {totalPages}
        </span>

        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={{ 
            padding: '8px 12px',
            backgroundColor: currentPage === totalPages ? '#e5e7eb' : '#3b82f6',
            color: currentPage === totalPages ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
          }}
        >
          ⟩
        </button>

        <button
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
          style={{ 
            padding: '8px 12px',
            backgroundColor: currentPage === totalPages ? '#e5e7eb' : '#3b82f6',
            color: currentPage === totalPages ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
          }}
        >
          ⟩⟩
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>عرض:</span>
          <select 
            value={itemsPerPage} 
            onChange={handleItemsPerPageChange}
            style={{ 
              padding: '5px 10px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '14px'
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
    );
  }

  /* =====================
     Main Render
  ===================== */

  if (loading && units.length === 0) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <div>جاري تحميل الوحدات المتاحة...</div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: 10 }}>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}`)}>البيانات</Button>
        <Button onClick={() => router.push(`/dashboard/clients/${clientId}?tab=followups`)}>المتابعات</Button>
        <Button variant="primary">حجز</Button>
      </div>

      {/* معلومات الصلاحية */}
      {employee && (
        <div style={{ 
          padding: '12px 16px', 
          marginBottom: '20px', 
          backgroundColor: employee.role === 'admin' ? '#e6f4ea' : '#fef7e6',
          borderRadius: '8px',
          borderLeft: `5px solid ${employee.role === 'admin' ? '#34a853' : '#fbbc04'}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <strong>الصلاحية:</strong> {employee.role === 'admin' ? 'مدير' : 'مندوب مبيعات'}
              {employee.role === 'sales' && ' (في مشاريعك فقط)'}
            </div>
            <div>
              <strong>الوحدات المتاحة:</strong> {unitStats.filtered.toLocaleString()} من {unitStats.total.toLocaleString()} وحدة
            </div>
          </div>
        </div>
      )}

      <div className="details-layout">
        {/* Filters Card - محسّنة */}
        <Card title="تصفية الوحدات المتاحة">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
            <div>
              <label>بحث سريع</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="ابحث بكود الوحدة، المشروع، النموذج..."
                  value={searchTerm}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    handleSearchChange(e.target.value);
                  }}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearch()}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 35px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#666'
                }}>
                  🔍
                </div>
              </div>
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                {searchTerm && (
                  <span>البحث عن: "<strong>{searchTerm}</strong>"</span>
                )}
              </div>
            </div>

            <div>
              <label>النوع</label>
              <select 
                value={selectedType} 
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">كل الأنواع</option>
                <option value="villa">فيلا</option>
                <option value="duplex">دوبلكس</option>
                <option value="apartment">شقة</option>
                <option value="townhouse">تاون هاوس</option>
              </select>
            </div>

            <div>
              <label>السعر من</label>
              <input
                type="number"
                placeholder="الحد الأدنى"
                value={minPrice}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMinPrice(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label>السعر إلى</label>
              <input
                type="number"
                placeholder="الحد الأقصى"
                value={maxPrice}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxPrice(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
            <Button onClick={handleSearchImproved}>
              🔍 تطبيق البحث
            </Button>
            
            <Button variant="secondary" onClick={handleResetFilters}>
              🔄 إعادة تعيين الفلاتر
            </Button>
            
            {searchTerm && (
              <div style={{ 
                padding: '8px 12px', 
                backgroundColor: totalUnits > 0 ? '#f0f9ff' : '#fee2e2',
                borderRadius: '4px',
                fontSize: '13px',
                color: totalUnits > 0 ? '#0369a1' : '#dc2626',
                border: totalUnits > 0 ? '1px solid #bae6fd' : '1px solid #fecaca',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span>{totalUnits > 0 ? '✅' : '❌'}</span>
                <span>
                  {totalUnits > 0 
                    ? `تم العثور على ${totalUnits} نتيجة` 
                    : 'لم يتم العثور على نتائج'}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Unit Selection Card */}
        <Card title="اختيار الوحدة">
          {units.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
              {searchTerm || selectedType || minPrice || maxPrice
                ? 'لا توجد وحدات تطابق الفلاتر المحددة'
                : 'لا توجد وحدات متاحة حالياً'}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>الاختيار</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>كود الوحدة</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>النوع</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>المشروع</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>السعر</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>الأرض</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>البناء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(unit => (
                      <tr 
                        key={unit.id} 
                        style={{ 
                          backgroundColor: unitId === unit.id ? '#e6f4ff' : 'white',
                          cursor: 'pointer',
                          borderBottom: '1px solid #eee'
                        }}
                        onClick={() => setUnitId(unit.id)}
                      >
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <input 
                            type="radio" 
                            name="unitSelect"
                            checked={unitId === unit.id}
                            onChange={() => setUnitId(unit.id)}
                            style={{ width: '18px', height: '18px' }}
                          />
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                          {unit.unit_code}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.unit_type === 'villa' ? 'فيلا' :
                           unit.unit_type === 'duplex' ? 'دوبلكس' :
                           unit.unit_type === 'apartment' ? 'شقة' : 'تاون هاوس'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.project_name} {unit.project_code ? `(${unit.project_code})` : ''}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', direction: 'ltr' }}>
                          {unit.supported_price.toLocaleString()} جنيه
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.land_area ? `${unit.land_area} م²` : '-'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.build_area ? `${unit.build_area} م²` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {renderPagination()}

              {unitId && (
                <div style={{ 
                  marginTop: '20px', 
                  padding: '15px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '8px',
                  border: '1px solid #bae6fd'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <strong>الوحدة المحددة:</strong> {units.find(u => u.id === unitId)?.unit_code}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      تأكد من اختيار الوحدة الصحيحة قبل المتابعة
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Reservation Form Card */}
        <Card title="بيانات الحجز">
          <div className="details-grid">
            <div className="form-field">
              <label>تاريخ الحجز *</label>
              <input
                type="date"
                value={reservationDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setReservationDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div className="form-field">
              <label>اسم البنك</label>
              <select 
                value={bankName} 
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setBankName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">اختر البنك</option>
                {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label>اسم موظف البنك</label>
              <Input 
                value={bankEmployeeName} 
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBankEmployeeName(e.target.value)} 
              />
            </div>

            <div className="form-field">
              <label>رقم موظف البنك</label>
              <Input 
                value={bankEmployeeMobile} 
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBankEmployeeMobile(e.target.value)} 
              />
            </div>

            <div className="form-field">
              <label>حالة الحجز</label>
              <select 
                value={status} 
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as ReservationStatus)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">اختر الحالة</option>
                <option value="active">حجز نشط</option>
                <option value="converted">تم التحويل (بيع)</option>
                <option value="cancelled">تم الإلغاء</option>
              </select>
            </div>

            {/* Notes Section - UPDATED */}
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label>ملاحظات (اختياري)</label>
              
              {/* شريط البحث داخل الـ Select */}
              <div style={{ marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="🔍 ابحث في الملاحظات..."
                  value={noteSearchTerm}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNoteSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    marginBottom: '5px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#666', textAlign: 'right' }}>
                  {noteSearchTerm && filteredNoteOptions.length > 0 ? `تم العثور على ${filteredNoteOptions.length} خيار` : ''}
                </div>
              </div>
              
              {/* الـ Select مع البحث */}
              <select
                value={notes}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setNotes(e.target.value);
                  setNoteSearchTerm(''); // إعادة ضبط البحث بعد الاختيار
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  marginBottom: '10px',
                  backgroundColor: 'white'
                }}
              >
                <option value="">-- اختر ملاحظة من القائمة --</option>
                {filteredNoteOptions.map((option, index) => (
                  <option key={index} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              
              {/* إمكانية إضافة ملاحظة مخصصة */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <input
                  type="text"
                  placeholder="أو اكتب ملاحظة مخصصة..."
                  value={notes}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomNote}
                  disabled={!notes.trim() || noteOptions.includes(notes.trim())}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: notes.trim() && !noteOptions.includes(notes.trim()) ? '#3b82f6' : '#e5e7eb',
                    color: notes.trim() && !noteOptions.includes(notes.trim()) ? 'white' : '#9ca3af',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: notes.trim() && !noteOptions.includes(notes.trim()) ? 'pointer' : 'not-allowed',
                    fontSize: '14px'
                  }}
                >
                  + إضافة
                </button>
              </div>
              
              {/* عرض الخيارات المختارة حالياً */}
              {notes && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '6px',
                  border: '1px solid #bae6fd',
                  fontSize: '14px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>✅ <strong>الملاحظة المختارة:</strong> {notes}</span>
                    <button
                      type="button"
                      onClick={() => setNotes('')}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              )}
              
              {/* ملاحظة إرشادية */}
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px', textAlign: 'right' }}>
                يمكنك اختيار ملاحظة جاهزة أو كتابة ملاحظة مخصصة
              </div>
            </div>
          </div>
        </Card>

        {/* Last Follow Up Card */}
        <Card title="آخر متابعة تلقائية">
          {lastFollowUp ? (
            <div style={{ padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
              <div style={{ marginBottom: '10px' }}>
                <strong>تفاصيل المتابعة:</strong>
              </div>
              <div style={{ color: '#666', lineHeight: '1.6' }}>
                {lastFollowUp.notes || '-'}
              </div>
              {lastFollowUp.created_at && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#999' }}>
                  بتاريخ: {new Date(lastFollowUp.created_at).toLocaleDateString('ar-EG')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
              لا توجد متابعات سابقة
            </div>
          )}
        </Card>
      </div>

      {/* Action Buttons */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginTop: '30px', 
        justifyContent: 'center',
        flexWrap: 'wrap' 
      }}>
        {!reservationId && (
          <>
            <Button 
              variant="primary" 
              onClick={submit} 
              disabled={saving || !unitId || !reservationDate}
            >
              {saving ? 'جاري الحفظ...' : 'حفظ الحجز'}
            </Button>
            
            {/* زر عرض المزيد من الوحدات */}
            {totalUnits > units.length && (
              <div style={{ 
                padding: '12px 20px',
                backgroundColor: '#f3f4f6',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#666',
                border: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>📊</span>
                <span>عرض {units.length} من {totalUnits.toLocaleString()} وحدة متاحة</span>
              </div>
            )}
          </>
        )}
        
        {reservationId && (
          <>
            <Button 
              onClick={() => router.push(`/dashboard/reservations/${reservationId}`)}
            >
              عرض الحجز
            </Button>
            <Button 
              variant="secondary" 
              onClick={() => {
                setReservationId(null);
                resetForm();
              }}
            >
              حجز جديد
            </Button>
          </>
        )}
      </div>

      {/* معلومات إضافية في الأسفل */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        fontSize: '14px',
        color: '#666'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong>ملاحظات مهمة:</strong>
          </div>
          <div style={{ textAlign: 'right', maxWidth: '600px' }}>
            • يمكنك البحث بكود الوحدة، اسم المشروع، أو اسم النموذج
            <br />
            • استخدم الفلاتر للبحث الدقيق حسب النوع والسعر
            <br />
            • الصفحة تعرض {itemsPerPage} وحدة في كل مرة لتحسين الأداء
            <br />
            • تأكد من صحة البيانات واختيار الوحدة الصحيحة قبل الحفظ
            <br />
            • يمكنك اختيار ملاحظة جاهزة من القائمة أو كتابة ملاحظة مخصصة
          </div>
        </div>
      </div>
    </div>
  );
}