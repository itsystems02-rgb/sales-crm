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
  reservation_data?: {
    reservation_id: string;
    reservation_date: string;
    reservation_status: string;
    reservation_notes: string | null;
    employee_name: string;
    employee_role: string;
    client_name: string;
    client_phone: string;
  };
  reservation_id?: string;
  reservation_employee_id?: string;
  is_my_reservation?: boolean;
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
  role: 'admin' | 'sales' | 'sales_manager';
};

type UnitStats = {
  total: number;
  filtered: number;
  my_reservations: number;
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
  const [unitStats, setUnitStats] = useState<UnitStats>({ total: 0, filtered: 0, my_reservations: 0 });
  
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
      
      // بناءً على الدور، نحدد ما يجب عرضه
      switch (emp.role) {
        case 'admin':
          await fetchAllReservations(emp);
          break;
        case 'sales_manager':
          await fetchManagerReservations(emp);
          break;
        case 'sales':
        default:
          await fetchSalesReservations(emp);
          break;
      }
      
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

  /* =====================
     دالة لجلب جميع الحجوزات للادمن
  ===================== */
  async function fetchAllReservations(emp: Employee) {
    try {
      // جلب جميع الحجوزات مع البيانات المرتبطة
      const { data: reservations, error } = await supabase
        .from('reservations')
        .select(`
          id,
          unit_id,
          reservation_date,
          status,
          notes,
          employee_id,
          units (
            id,
            unit_code,
            project_id,
            unit_type,
            supported_price,
            land_area,
            build_area,
            status,
            projects (
              name,
              code
            ),
            project_models (
              name
            )
          ),
          employees (
            id,
            name,
            role
          ),
          clients (
            id,
            name,
            phone
          )
        `)
        .order('reservation_date', { ascending: false });

      if (error) throw error;

      // جلب إحصائيات الوحدات المتاحة
      const { count } = await supabase
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'available');

      // تحويل البيانات
      const reservationUnits = (reservations || []).map(res => {
        const unit = Array.isArray(res.units) ? res.units[0] : res.units;
        if (!unit) return null;

        const projects = unit.projects;
        const project = Array.isArray(projects) ? projects[0] : projects;
        
        const projectModels = unit.project_models;
        const model = Array.isArray(projectModels) ? projectModels[0] : projectModels;
        
        const employees = res.employees;
        const employee = Array.isArray(employees) ? employees[0] : employees;
        
        const clients = res.clients;
        const client = Array.isArray(clients) ? clients[0] : clients;

        const isMyReservation = res.employee_id === emp.id;

        return {
          id: unit.id,
          unit_code: unit.unit_code,
          project_id: unit.project_id,
          project_name: project?.name || '',
          project_code: project?.code || '',
          model_name: model?.name || '',
          unit_type: unit.unit_type,
          supported_price: Number(unit.supported_price || 0),
          land_area: unit.land_area ? Number(unit.land_area) : null,
          build_area: unit.build_area ? Number(unit.build_area) : null,
          status: unit.status,
          reservation_id: res.id,
          reservation_employee_id: res.employee_id,
          is_my_reservation: isMyReservation,
          reservation_data: {
            reservation_id: res.id,
            reservation_date: res.reservation_date,
            reservation_status: res.status,
            reservation_notes: res.notes,
            employee_name: employee?.name || 'غير معروف',
            employee_role: employee?.role || 'غير معروف',
            client_name: client?.name || 'غير معروف',
            client_phone: client?.phone || 'غير معروف'
          }
        };
      }).filter(unit => unit !== null) as Unit[];

      const myReservationsCount = reservationUnits.filter(unit => unit.is_my_reservation).length;

      setUnits(reservationUnits);
      setUnitStats({
        total: count || 0,
        filtered: reservationUnits.length,
        my_reservations: myReservationsCount
      });
      setTotalUnits(reservationUnits.length);
      setTotalPages(Math.ceil(reservationUnits.length / itemsPerPage));

    } catch (err) {
      console.error('Error fetching all reservations:', err);
      setUnits([]);
      setUnitStats({ total: 0, filtered: 0, my_reservations: 0 });
    }
  }

  /* =====================
     دالة لجلب حجوزات مدير المبيعات في المشاريع التابعة له
  ===================== */
  async function fetchManagerReservations(emp: Employee) {
    try {
      // جلب المشاريع التي يديرها
      const { data: managerProjects, error: projectsError } = await supabase
        .from('employee_projects')
        .select('project_id')
        .eq('employee_id', emp.id);

      if (projectsError) throw projectsError;

      const managedProjectIds = (managerProjects || []).map(p => p.project_id);
      
      if (managedProjectIds.length === 0) {
        setUnits([]);
        setUnitStats({ total: 0, filtered: 0, my_reservations: 0 });
        return;
      }

      // جلب الحجوزات في المشاريع التابعة له
      const { data: reservations, error } = await supabase
        .from('reservations')
        .select(`
          id,
          unit_id,
          reservation_date,
          status,
          notes,
          employee_id,
          units (
            id,
            unit_code,
            project_id,
            unit_type,
            supported_price,
            land_area,
            build_area,
            status,
            projects (
              name,
              code
            ),
            project_models (
              name
            )
          ),
          employees (
            id,
            name,
            role
          ),
          clients (
            id,
            name,
            phone
          )
        `)
        .in('units.project_id', managedProjectIds)
        .order('reservation_date', { ascending: false });

      if (error) throw error;

      // جلب إحصائيات الوحدات المتاحة في مشاريعه
      const { count } = await supabase
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'available')
        .in('project_id', managedProjectIds);

      // تحويل البيانات
      const reservationUnits = (reservations || []).map(res => {
        const unit = Array.isArray(res.units) ? res.units[0] : res.units;
        if (!unit) return null;

        const projects = unit.projects;
        const project = Array.isArray(projects) ? projects[0] : projects;
        
        const projectModels = unit.project_models;
        const model = Array.isArray(projectModels) ? projectModels[0] : projectModels;
        
        const employees = res.employees;
        const employee = Array.isArray(employees) ? employees[0] : employees;
        
        const clients = res.clients;
        const client = Array.isArray(clients) ? clients[0] : clients;

        const isMyReservation = res.employee_id === emp.id;

        return {
          id: unit.id,
          unit_code: unit.unit_code,
          project_id: unit.project_id,
          project_name: project?.name || '',
          project_code: project?.code || '',
          model_name: model?.name || '',
          unit_type: unit.unit_type,
          supported_price: Number(unit.supported_price || 0),
          land_area: unit.land_area ? Number(unit.land_area) : null,
          build_area: unit.build_area ? Number(unit.build_area) : null,
          status: unit.status,
          reservation_id: res.id,
          reservation_employee_id: res.employee_id,
          is_my_reservation: isMyReservation,
          reservation_data: {
            reservation_id: res.id,
            reservation_date: res.reservation_date,
            reservation_status: res.status,
            reservation_notes: res.notes,
            employee_name: employee?.name || 'غير معروف',
            employee_role: employee?.role || 'غير معروف',
            client_name: client?.name || 'غير معروف',
            client_phone: client?.phone || 'غير معروف'
          }
        };
      }).filter(unit => unit !== null) as Unit[];

      const myReservationsCount = reservationUnits.filter(unit => unit.is_my_reservation).length;

      setUnits(reservationUnits);
      setUnitStats({
        total: count || 0,
        filtered: reservationUnits.length,
        my_reservations: myReservationsCount
      });
      setTotalUnits(reservationUnits.length);
      setTotalPages(Math.ceil(reservationUnits.length / itemsPerPage));

    } catch (err) {
      console.error('Error fetching manager reservations:', err);
      setUnits([]);
      setUnitStats({ total: 0, filtered: 0, my_reservations: 0 });
    }
  }

  /* =====================
     دالة لجلب حجوزات السيلز الخاصة به فقط
  ===================== */
  async function fetchSalesReservations(emp: Employee) {
    try {
      // جلب الحجوزات الخاصة بالسيلز فقط
      const { data: reservations, error } = await supabase
        .from('reservations')
        .select(`
          id,
          unit_id,
          reservation_date,
          status,
          notes,
          employee_id,
          units (
            id,
            unit_code,
            project_id,
            unit_type,
            supported_price,
            land_area,
            build_area,
            status,
            projects (
              name,
              code
            ),
            project_models (
              name
            )
          ),
          employees (
            id,
            name,
            role
          ),
          clients (
            id,
            name,
            phone
          )
        `)
        .eq('employee_id', emp.id)
        .order('reservation_date', { ascending: false });

      if (error) throw error;

      // جلب إحصائيات الوحدات المتاحة في مشاريعه
      const { data: employeeProjects } = await supabase
        .from('employee_projects')
        .select('project_id')
        .eq('employee_id', emp.id);

      const allowedProjectIds = (employeeProjects || []).map(p => p.project_id);
      
      let count = 0;
      if (allowedProjectIds.length > 0) {
        const { count: availableCount } = await supabase
          .from('units')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'available')
          .in('project_id', allowedProjectIds);
        count = availableCount || 0;
      }

      // تحويل البيانات
      const reservationUnits = (reservations || []).map(res => {
        const unit = Array.isArray(res.units) ? res.units[0] : res.units;
        if (!unit) return null;

        const projects = unit.projects;
        const project = Array.isArray(projects) ? projects[0] : projects;
        
        const projectModels = unit.project_models;
        const model = Array.isArray(projectModels) ? projectModels[0] : projectModels;
        
        const employees = res.employees;
        const employee = Array.isArray(employees) ? employees[0] : employees;
        
        const clients = res.clients;
        const client = Array.isArray(clients) ? clients[0] : clients;

        return {
          id: unit.id,
          unit_code: unit.unit_code,
          project_id: unit.project_id,
          project_name: project?.name || '',
          project_code: project?.code || '',
          model_name: model?.name || '',
          unit_type: unit.unit_type,
          supported_price: Number(unit.supported_price || 0),
          land_area: unit.land_area ? Number(unit.land_area) : null,
          build_area: unit.build_area ? Number(unit.build_area) : null,
          status: unit.status,
          reservation_id: res.id,
          reservation_employee_id: res.employee_id,
          is_my_reservation: true, // كلها خاصة به
          reservation_data: {
            reservation_id: res.id,
            reservation_date: res.reservation_date,
            reservation_status: res.status,
            reservation_notes: res.notes,
            employee_name: employee?.name || 'غير معروف',
            employee_role: employee?.role || 'غير معروف',
            client_name: client?.name || 'غير معروف',
            client_phone: client?.phone || 'غير معروف'
          }
        };
      }).filter(unit => unit !== null) as Unit[];

      setUnits(reservationUnits);
      setUnitStats({
        total: count,
        filtered: reservationUnits.length,
        my_reservations: reservationUnits.length
      });
      setTotalUnits(reservationUnits.length);
      setTotalPages(Math.ceil(reservationUnits.length / itemsPerPage));

    } catch (err) {
      console.error('Error fetching sales reservations:', err);
      setUnits([]);
      setUnitStats({ total: 0, filtered: 0, my_reservations: 0 });
    }
  }

  /* =====================
     دالة لتحميل الوحدات المتاحة للادمن والسيلز (عند إضافة حجوزات جديدة)
  ===================== */
  async function loadAvailableUnits(emp: Employee, page: number = currentPage) {
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
          projects!inner (
            name,
            code
          ),
          project_models!inner (
            name
          )
        `, { count: 'exact' })
        .eq('status', 'available')
        .order('unit_code')
        .range(from, to);

      // للـ Sales، نطبق فلتر المشاريع المسموحة
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

      // تطبيق الفلاتر
      if (selectedProject) {
        query = query.eq('project_id', selectedProject);
      }
      if (selectedType) {
        query = query.eq('unit_type', selectedType);
      }
      if (minPrice) {
        query = query.gte('supported_price', Number(minPrice));
      }
      if (maxPrice) {
        query = query.lte('supported_price', Number(maxPrice));
      }
      if (searchTerm.trim()) {
        const searchTermLower = searchTerm.trim().toLowerCase();
        query = query.or(
          `unit_code.ilike.%${searchTermLower}%,` +
          `projects.name.ilike.%${searchTermLower}%,` +
          `project_models.name.ilike.%${searchTermLower}%`
        );
      }

      const { data, error, count } = await query;
      
      if (error) throw error;

      const normalized = (data || []).map((item: any) => ({
        id: item.id,
        unit_code: item.unit_code,
        project_id: item.project_id,
        project_name: Array.isArray(item.projects) ? item.projects[0]?.name : item.projects?.name || '',
        project_code: Array.isArray(item.projects) ? item.projects[0]?.code : item.projects?.code || '',
        model_name: Array.isArray(item.project_models) ? item.project_models[0]?.name : item.project_models?.name || '',
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
      }

    } catch (err) {
      console.error('Error loading available units:', err);
      setUnits([]);
    }
  }

  /* =====================
     Note Functions
  ===================== */

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

  const handleAddCustomNote = () => {
    if (notes.trim() && !noteOptions.includes(notes.trim())) {
      setNoteOptions([notes.trim(), ...noteOptions]);
      setNotes('');
      setNoteSearchTerm('');
    }
  };

  useEffect(() => {
    setFilteredNoteOptions(noteOptions);
  }, [noteOptions]);

  useEffect(() => {
    filterNoteOptions(noteSearchTerm);
  }, [noteSearchTerm, filterNoteOptions]);

  /* =====================
     Search and Load Functions
  ===================== */

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeout = setTimeout(() => {
      setCurrentPage(1);
      if (employee) {
        loadAvailableUnits(employee, 1);
      }
    }, 300);
    
    setSearchTimeout(timeout);
  }, [employee, searchTimeout]);

  const handleSearch = () => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    setCurrentPage(1);
    if (employee) {
      loadAvailableUnits(employee, 1);
    }
  };

  /* =====================
     Pagination Handlers
  ===================== */

  useEffect(() => {
    if (employee && (employee.role === 'admin' || employee.role === 'sales')) {
      loadAvailableUnits(employee, currentPage);
    }
  }, [currentPage, itemsPerPage, selectedProject, selectedType, minPrice, maxPrice, employee]);

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
    
    if (employee && (employee.role === 'admin' || employee.role === 'sales')) {
      loadAvailableUnits(employee, 1);
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

    // التحقق من أن الموظف يمكنه إضافة حجوزات
    if (employee.role === 'sales_manager') {
      alert('مدير المبيعات لا يستطيع إضافة حجوزات جديدة');
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
      if (employee.role === 'sales') {
        await loadAvailableUnits(employee, currentPage);
      }
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
    
    // إعادة تحميل البيانات
    if (employee.role === 'admin') {
      await fetchAllReservations(employee);
    } else if (employee.role === 'sales') {
      await fetchSalesReservations(employee);
      // أيضا نحتاج تحميل الوحدات المتاحة للتحديث
      await loadAvailableUnits(employee, currentPage);
    }
    
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
     دالة للحصول على عنوان البطاقة بناءً على الصلاحية
  ===================== */
  function getCardTitleBasedOnRole() {
    if (!employee) return "قائمة الحجوزات";
    
    switch (employee.role) {
      case 'admin':
        return "جميع الحجوزات في النظام";
      case 'sales_manager':
        return "الحجوزات في المشاريع التابعة لي";
      case 'sales':
      default:
        return "الحجوزات الخاصة بي";
    }
  }

  /* =====================
     دالة لمعرفة ما إذا كان يجب عرض نموذج إضافة حجوزات جديدة
  ===================== */
  function shouldShowAddReservationForm() {
    if (!employee) return false;
    return employee.role === 'admin' || employee.role === 'sales';
  }

  /* =====================
     دالة لمعرفة ما إذا كان يجب عرض جدول الوحدات المتاحة
  ===================== */
  function shouldShowAvailableUnitsTable() {
    if (!employee) return false;
    return (employee.role === 'admin' || employee.role === 'sales') && !reservationId;
  }

  /* =====================
     Main Render
  ===================== */

  if (loading && units.length === 0) {
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <div>جاري تحميل البيانات...</div>
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
          backgroundColor: 
            employee.role === 'admin' ? '#e6f4ea' : 
            employee.role === 'sales_manager' ? '#e8f4fd' : 
            '#fef7e6',
          borderRadius: '8px',
          borderLeft: `5px solid ${
            employee.role === 'admin' ? '#34a853' : 
            employee.role === 'sales_manager' ? '#4285f4' : 
            '#fbbc04'
          }`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <strong>الصلاحية:</strong> 
              {employee.role === 'admin' ? 'مدير' : 
               employee.role === 'sales_manager' ? 'مدير مبيعات' : 
               'مندوب مبيعات'}
              
              {employee.role === 'sales_manager' && ' (جميع الحجوزات في مشاريعك)'}
              {employee.role === 'sales' && ' (الحجوزات الخاصة بك فقط)'}
            </div>
            <div>
              <strong>عدد الحجوزات:</strong> {' '}
              {unitStats.filtered.toLocaleString()} حجز
              {employee.role !== 'sales' && unitStats.my_reservations > 0 && (
                <span style={{ marginRight: '15px' }}>
                  | <strong>حجوزاتي:</strong> {unitStats.my_reservations.toLocaleString()}
                </span>
              )}
              {shouldShowAvailableUnitsTable() && (
                <span style={{ marginRight: '15px' }}>
                  | <strong>الوحدات المتاحة:</strong> {unitStats.total.toLocaleString()} وحدة
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="details-layout">
        {/* Filters Card - تظهر فقط للادمن والسيلز عند إضافة حجوزات جديدة */}
        {shouldShowAvailableUnitsTable() && (
          <Card title="تصفية الوحدات المتاحة لإضافة حجوزات جديدة">
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
              <Button onClick={handleSearch}>
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
        )}

        {/* الوحدات أو الحجوزات Card */}
        <Card title={getCardTitleBasedOnRole()}>
          {units.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
              {employee?.role === 'sales_manager'
                ? 'لا توجد حجوزات في المشاريع التابعة لك'
                : employee?.role === 'sales'
                ? 'لا توجد حجوزات خاصة بك'
                : employee?.role === 'admin'
                ? 'لا توجد حجوزات في النظام'
                : 'لا توجد بيانات'}
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      {/* عمود الاختيار يظهر فقط عند إضافة حجوزات جديدة */}
                      {shouldShowAvailableUnitsTable() && (
                        <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>الاختيار</th>
                      )}
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>كود الوحدة</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>النوع</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>المشروع</th>
                      
                      {/* أعمدة معلومات الحجز - تظهر للجميع عندما تكون هناك حجوزات */}
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>الموظف المضيف</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>العميل</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>حالة الحجز</th>
                      
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>السعر</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>الأرض</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>البناء</th>
                      <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #ddd' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(unit => (
                      <tr 
                        key={unit.id} 
                        style={{ 
                          backgroundColor: unitId === unit.id && shouldShowAvailableUnitsTable() ? '#e6f4ff' : 
                                         unit.is_my_reservation ? '#f0fff4' : 'white',
                          cursor: shouldShowAvailableUnitsTable() ? 'pointer' : 'default',
                          borderBottom: '1px solid #eee'
                        }}
                        onClick={() => shouldShowAvailableUnitsTable() && setUnitId(unit.id)}
                      >
                        {/* خلية الاختيار تظهر فقط عند إضافة حجوزات جديدة */}
                        {shouldShowAvailableUnitsTable() && (
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <input 
                              type="radio" 
                              name="unitSelect"
                              checked={unitId === unit.id}
                              onChange={() => setUnitId(unit.id)}
                              style={{ width: '18px', height: '18px' }}
                            />
                          </td>
                        )}
                        
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                          {unit.unit_code}
                          {unit.reservation_data && (
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                              📅 {new Date(unit.reservation_data.reservation_date).toLocaleDateString('ar-EG')}
                            </div>
                          )}
                        </td>
                        
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.unit_type === 'villa' ? 'فيلا' :
                           unit.unit_type === 'duplex' ? 'دوبلكس' :
                           unit.unit_type === 'apartment' ? 'شقة' : 'تاون هاوس'}
                        </td>
                        
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.project_name} {unit.project_code ? `(${unit.project_code})` : ''}
                        </td>
                        
                        {/* معلومات الحجز */}
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.reservation_data ? (
                            <>
                              <div style={{ fontSize: '13px' }}>
                                👤 {unit.reservation_data.employee_name}
                                {unit.is_my_reservation && ' ⭐'}
                              </div>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                {unit.reservation_data.employee_role === 'sales' ? 'مندوب مبيعات' : 
                                 unit.reservation_data.employee_role === 'sales_manager' ? 'مدير مبيعات' : 
                                 unit.reservation_data.employee_role === 'admin' ? 'مدير' : 'غير معروف'}
                              </div>
                            </>
                          ) : '-'}
                        </td>
                        
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.reservation_data ? (
                            <>
                              <div style={{ fontSize: '13px' }}>
                                🤵 {unit.reservation_data.client_name}
                              </div>
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                {unit.reservation_data.client_phone}
                              </div>
                            </>
                          ) : '-'}
                        </td>
                        
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {unit.reservation_data ? (
                            <div style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              backgroundColor: 
                                unit.reservation_data.reservation_status === 'active' ? '#dcfce7' :
                                unit.reservation_data.reservation_status === 'converted' ? '#fef7cd' :
                                '#fee2e2',
                              color: 
                                unit.reservation_data.reservation_status === 'active' ? '#166534' :
                                unit.reservation_data.reservation_status === 'converted' ? '#92400e' :
                                '#991b1b'
                            }}>
                              {unit.reservation_data.reservation_status === 'active' ? 'نشط' :
                               unit.reservation_data.reservation_status === 'converted' ? 'تم التحويل' :
                               'ملغي'}
                            </div>
                          ) : (
                            <div style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af'
                            }}>
                              متاحة
                            </div>
                          )}
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
                        
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '5px', flexDirection: 'column' }}>
                            {unit.reservation_id && (
                              <Button 
                                variant="secondary"
                                onClick={() => router.push(`/dashboard/reservations/${unit.reservation_id}`)}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                عرض الحجز
                              </Button>
                            )}
                            {employee?.role === 'admin' && unit.reservation_id && (
                              <Button 
                                variant="danger"
                                onClick={() => {
                                  if (confirm('هل أنت متأكد من حذف هذا الحجز؟')) {
                                    // TODO: تنفيذ حذف الحجز
                                  }
                                }}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                حذف
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {renderPagination()}

              {unitId && shouldShowAvailableUnitsTable() && (
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

        {/* نموذج إضافة حجوزات جديدة - يظهر فقط للادمن والسيلز */}
        {shouldShowAddReservationForm() && !reservationId && (
          <Card title="إضافة حجز جديد">
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

              {/* Notes Section */}
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label>ملاحظات (اختياري)</label>
                
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
                </div>
                
                <select
                  value={notes}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setNotes(e.target.value);
                    setNoteSearchTerm('');
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
              </div>
            </div>
          </Card>
        )}

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
        {/* زر حفظ الحجز - يظهر فقط عند إضافة حجوزات جديدة */}
        {shouldShowAddReservationForm() && !reservationId && (
          <>
            <Button 
              variant="primary" 
              onClick={submit} 
              disabled={saving || !unitId || !reservationDate}
            >
              {saving ? 'جاري الحفظ...' : 'حفظ الحجز'}
            </Button>
            
            {unitStats.total > 0 && employee?.role === 'sales' && (
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
                <span>عرض {units.length} من {unitStats.total.toLocaleString()} وحدة متاحة</span>
              </div>
            )}
          </>
        )}
        
        {/* بعد إضافة الحجز بنجاح */}
        {reservationId && shouldShowAddReservationForm() && (
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
              إضافة حجز جديد
            </Button>
          </>
        )}

        {/* معلومات خاصة بمدير المبيعات */}
        {employee?.role === 'sales_manager' && (
          <div style={{ 
            padding: '15px 20px',
            backgroundColor: '#f0f9ff',
            borderRadius: '8px',
            border: '2px solid #bae6fd',
            maxWidth: '600px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0369a1', marginBottom: '8px' }}>
              👨‍💼 وضع مدير المبيعات
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              أنت في وضع العرض فقط. يمكنك رؤية جميع الحجوزات في المشاريع التابعة لك، 
              لكن لا يمكنك إضافة حجوزات جديدة.
            </div>
          </div>
        )}
      </div>

      {/* معلومات إضافية */}
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
            {employee?.role === 'admin' ? (
              <>
                • يمكنك رؤية جميع الحجوزات في النظام
                <br />
                • يمكنك إضافة حجوزات جديدة وتعديلها وحذفها
                <br />
                • الحجوزات التي أضفتها تظهر بمؤشر ⭐
                <br />
                • الحجوزات مرتبة حسب تاريخ الحجز (الأحدث أولاً)
                <br />
                • يمكنك الانتقال لتفاصيل الحجز بالضغط على "عرض الحجز"
              </>
            ) : employee?.role === 'sales_manager' ? (
              <>
                • يمكنك رؤية جميع الحجوزات في المشاريع التي تديرها
                <br />
                • يمكنك رؤية تفاصيل كل حجز والموظف الذي أضافه
                <br />
                • الحجوزات التي أضفتها تظهر بمؤشر ⭐ وبلون أخضر فاتح
                <br />
                • يمكنك رؤية بيانات العملاء المرتبطين بالحجوزات
                <br />
                • الحجوزات مرتبة حسب تاريخ الحجز (الأحدث أولاً)
              </>
            ) : (
              <>
                • يمكنك رؤية الحجوزات التي أضفتها فقط
                <br />
                • يمكنك إضافة حجوزات جديدة من الوحدات المتاحة في مشاريعك
                <br />
                • جميع حجوزاتك تظهر بمؤشر ⭐ وبلون أخضر فاتح
                <br />
                • يمكنك البحث في الوحدات المتاحة باستخدام الفلاتر
                <br />
                • تأكد من صحة البيانات واختيار الوحدة الصحيحة قبل الحفظ
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}