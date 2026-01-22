'use client';

import { useEffect, useRef, useState } from 'react';
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

type ProjectRef = { name: string; code: string | null };
type ModelRef = { name: string };

type Employee = {
  id: string;
  role: 'admin' | 'sales';
};

type Unit = {
  id: string;
  project_id: string;
  model_id: string | null;
  unit_code: string;
  block_no: string | null;
  unit_no: string | null;
  unit_type: 'villa' | 'duplex' | 'apartment'| 'townhouse';
  status: 'available' | 'reserved' | 'sold';
  supported_price: number;
  land_area: number | null;
  build_area: number | null;
  project: ProjectRef | null;
  model: ModelRef | null;
};

type ProjectOption = { id: string; name: string; code: string | null };
type ModelOption = { id: string; name: string };

type UnitStats = {
  available: number;
  reserved: number;
  sold: number;
  total: number;
};

const UNIT_TYPES = [
  { value: 'villa', label: 'فيلا' },
  { value: 'duplex', label: 'دوبلكس' },
  { value: 'apartment', label: 'شقة' },
  { value: 'townhouse', label: 'تاون هاوس' },
] as const;

/* =====================
   Helpers
===================== */

function statusLabel(s: Unit['status']) {
  if (s === 'available') return 'متاحة';
  if (s === 'reserved') return 'محجوزة';
  return 'مباعة';
}

function typeLabel(t: Unit['unit_type']) {
  if (t === 'villa') return 'فيلا';
  if (t === 'duplex') return 'دوبلكس';
  if (t === 'townhouse') return 'تاون هاوس';
  return 'شقة';
}

function normalizeRel<T>(val: unknown): T | null {
  if (!val) return null;
  if (Array.isArray(val)) return (val[0] ?? null) as T | null;
  if (typeof val === 'object') return val as T;
  return null;
}

function projectText(p: ProjectRef | null) {
  if (!p) return '-';
  return p.code ? `${p.name} (${p.code})` : p.name;
}

/* =====================
   Excel Import/Export Functions
===================== */

// تصدير البيانات إلى Excel
function exportToExcel(units: Unit[], fileName: string = 'وحدات.xlsx') {
  try {
    // تحويل البيانات إلى تنسيق مناسب لـ Excel
    const excelData = units.map(unit => ({
      'كود الوحدة': unit.unit_code,
      'رقم البلوك': unit.block_no || '-',
      'رقم الوحدة': unit.unit_no || '-',
      'النوع': typeLabel(unit.unit_type),
      'الحالة': statusLabel(unit.status),
      'مساحة الأرض': unit.land_area || '-',
      'مسطح البناء': unit.build_area || '-',
      'السعر المعتمد': unit.supported_price,
      'المشروع': projectText(unit.project),
      'النموذج': unit.model?.name || '-',
      'معرف الوحدة': unit.id,
    }));

    // إنشاء ورقة عمل
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // إنشاء مصنف
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الوحدات');
    
    // تنزيل الملف
    XLSX.writeFile(wb, fileName);
    
    return true;
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    alert('حدث خطأ أثناء تصدير البيانات إلى Excel');
    return false;
  }
}

// استيراد البيانات من Excel
async function importFromExcel(file: File, onSuccess?: (data: any[]) => void, onError?: (error: string) => void) {
  try {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // الحصول على أول ورقة
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // تحويل الورقة إلى JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        console.log('Imported data:', jsonData);
        
        if (onSuccess) {
          onSuccess(jsonData);
        }
      } catch (parseError) {
        console.error('Error parsing Excel file:', parseError);
        if (onError) {
          onError('حدث خطأ في تحليل ملف Excel');
        }
      }
    };
    
    reader.onerror = () => {
      if (onError) {
        onError('حدث خطأ في قراءة الملف');
      }
    };
    
    reader.readAsBinaryString(file);
  } catch (error) {
    console.error('Error importing from Excel:', error);
    if (onError) {
      onError('حدث خطأ في استيراد البيانات');
    }
  }
}

// معالجة البيانات المستوردة
async function processImportedUnits(data: any[], projects: ProjectOption[], models: ModelOption[]) {
  const processedUnits = [];
  const errors = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNumber = i + 2; // +2 لأن الصف الأول هو العناوين
    
    try {
      // البحث عن المشروع بواسطة الاسم أو الكود
      let project = null;
      const projectName = row['المشروع'] || row['project'] || row['Project'];
      
      if (projectName) {
        project = projects.find(p => 
          p.name === projectName || 
          p.code === projectName ||
          p.name.includes(projectName) ||
          projectName.includes(p.name)
        );
        
        if (!project) {
          errors.push(`الصف ${rowNumber}: المشروع "${projectName}" غير موجود في النظام`);
          continue;
        }
      } else {
        errors.push(`الصف ${rowNumber}: اسم المشروع مطلوب`);
        continue;
      }
      
      // البحث عن النموذج
      let model = null;
      const modelName = row['النموذج'] || row['model'] || row['Model'];
      
      if (modelName && project) {
        // جلب نماذج المشروع
        const projectModels = await supabase
          .from('project_models')
          .select('id,name')
          .eq('project_id', project.id);
          
        if (projectModels.data) {
          model = projectModels.data.find(m => 
            m.name === modelName || 
            m.name.includes(modelName) ||
            modelName.includes(m.name)
          );
          
          if (!model) {
            errors.push(`الصف ${rowNumber}: النموذج "${modelName}" غير موجود في المشروع "${project.name}"`);
            continue;
          }
        }
      }
      
      // تحويل النوع
      const unitTypeMap: Record<string, Unit['unit_type']> = {
        'فيلا': 'villa',
        'دوبلكس': 'duplex',
        'شقة': 'apartment',
        'تاون هاوس': 'townhouse',
        'villa': 'villa',
        'duplex': 'duplex',
        'apartment': 'apartment',
        'townhouse': 'townhouse',
      };
      
      const typeText = row['النوع'] || row['type'] || row['Type'] || 'apartment';
      const unitType = unitTypeMap[typeText] || 'apartment';
      
      // تحويل الحالة
      const statusMap: Record<string, Unit['status']> = {
        'متاحة': 'available',
        'محجوزة': 'reserved',
        'مباعة': 'sold',
        'available': 'available',
        'reserved': 'reserved',
        'sold': 'sold'
      };
      
      const statusText = row['الحالة'] || row['status'] || row['Status'] || 'available';
      const unitStatus = statusMap[statusText] || 'available';
      
      // إنشاء كائن الوحدة
      const unit = {
        unit_code: row['كود الوحدة'] || row['unit_code'] || row['Unit Code'] || '',
        block_no: row['رقم البلوك'] || row['block_no'] || row['Block No'] || null,
        unit_no: row['رقم الوحدة'] || row['unit_no'] || row['Unit No'] || null,
        unit_type: unitType,
        status: unitStatus,
        supported_price: Number(row['السعر المعتمد'] || row['supported_price'] || row['Price'] || 0),
        land_area: row['مساحة الأرض'] || row['land_area'] || row['Land Area'] ? Number(row['مساحة الأرض'] || row['land_area'] || row['Land Area']) : null,
        build_area: row['مسطح البناء'] || row['build_area'] || row['Build Area'] ? Number(row['مسطح البناء'] || row['build_area'] || row['Build Area']) : null,
        project_id: project.id,
        model_id: model?.id || null,
      };
      
      // التحقق من البيانات المطلوبة
      if (!unit.unit_code.trim()) {
        errors.push(`الصف ${rowNumber}: كود الوحدة مطلوب`);
        continue;
      }
      
      if (unit.supported_price <= 0) {
        errors.push(`الصف ${rowNumber}: السعر يجب أن يكون أكبر من صفر`);
        continue;
      }
      
      processedUnits.push(unit);
    } catch (error) {
      errors.push(`الصف ${rowNumber}: خطأ في معالجة البيانات - ${error}`);
    }
  }
  
  return { processedUnits, errors };
}

/* =====================
   Page
===================== */

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalUnits, setTotalUnits] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Statistics states
  const [unitStats, setUnitStats] = useState<UnitStats>({
    available: 0,
    reserved: 0,
    sold: 0,
    total: 0
  });
  
  // Excel import states
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showImportErrors, setShowImportErrors] = useState(false);

  // form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [unitCode, setUnitCode] = useState('');
  const [blockNo, setBlockNo] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [unitType, setUnitType] = useState<Unit['unit_type']>('apartment');
  const [status, setStatus] = useState<Unit['status']>('available');
  const [price, setPrice] = useState('');
  const [landArea, setLandArea] = useState('');
  const [buildArea, setBuildArea] = useState('');
  const [projectId, setProjectId] = useState('');
  const [modelId, setModelId] = useState('');

  const prefillingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      await loadProjects();
      await loadUnits(emp);
      await fetchTotalCount(emp);
      await fetchUnitStats(emp);
    } catch (err) {
      console.error('Error in init():', err);
    }
  }

  /* =====================
     LOAD
  ===================== */
  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,code')
      .order('name');

    if (error) {
      console.error(error);
      setProjects([]);
      return;
    }

    setProjects(data || []);
  }

  async function loadModels(pid: string) {
    const { data, error } = await supabase
      .from('project_models')
      .select('id,name')
      .eq('project_id', pid)
      .order('name');

    if (error) {
      console.error(error);
      setModels([]);
      return;
    }

    setModels(data || []);
  }

  async function fetchTotalCount(emp: Employee | null = null) {
    try {
      let query = supabase
        .from('units')
        .select('id', { count: 'exact', head: true });

      if (emp && emp.role === 'sales') {
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        const allowedProjectIds = (employeeProjects || []).map((p: any) => p.project_id);
        query = query.in('project_id', allowedProjectIds.length > 0 ? allowedProjectIds : ['']);
      }

      const { count, error } = await query;
      if (error) throw error;

      setTotalUnits(count || 0);
      setTotalPages(Math.ceil((count || 0) / itemsPerPage));
    } catch (err) {
      console.error('Error fetching total count:', err);
      setTotalUnits(0);
    }
  }

  // دالة جديدة لجلب إحصائيات الوحدات
  async function fetchUnitStats(emp: Employee | null = null) {
    try {
      let query = supabase
        .from('units')
        .select('status', { count: 'exact' });

      if (emp && emp.role === 'sales') {
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        const allowedProjectIds = (employeeProjects || []).map((p: any) => p.project_id);
        query = query.in('project_id', allowedProjectIds.length > 0 ? allowedProjectIds : ['']);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      // حساب الإحصائيات
      const stats: UnitStats = {
        available: 0,
        reserved: 0,
        sold: 0,
        total: count || 0
      };

      (data || []).forEach((unit: any) => {
        if (unit.status === 'available') {
          stats.available += 1;
        } else if (unit.status === 'reserved') {
          stats.reserved += 1;
        } else if (unit.status === 'sold') {
          stats.sold += 1;
        }
      });

      setUnitStats(stats);
    } catch (err) {
      console.error('Error fetching unit stats:', err);
      setUnitStats({
        available: 0,
        reserved: 0,
        sold: 0,
        total: 0
      });
    }
  }

  async function loadUnits(emp: Employee | null = null, page: number = currentPage) {
    setLoading(true);

    try {
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('units')
        .select(`
          id,
          project_id,
          model_id,
          unit_code,
          block_no,
          unit_no,
          unit_type,
          status,
          supported_price,
          land_area,
          build_area,
          project:projects!units_project_id_fkey (name,code),
          model:project_models!units_model_id_fkey (name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (emp && emp.role === 'sales') {
        const { data: employeeProjects } = await supabase
          .from('employee_projects')
          .select('project_id')
          .eq('employee_id', emp.id);

        const allowedProjectIds = (employeeProjects || []).map((p: any) => p.project_id);
        query = query.in('project_id', allowedProjectIds.length > 0 ? allowedProjectIds : ['']);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const normalized: Unit[] = (data || []).map((r: any) => ({
        id: r.id,
        project_id: r.project_id,
        model_id: r.model_id,
        unit_code: r.unit_code,
        block_no: r.block_no,
        unit_no: r.unit_no,
        unit_type: r.unit_type,
        status: r.status,
        supported_price: Number(r.supported_price || 0),
        land_area: r.land_area === null ? null : Number(r.land_area),
        build_area: r.build_area === null ? null : Number(r.build_area),
        project: normalizeRel<ProjectRef>(r.project),
        model: normalizeRel<ModelRef>(r.model),
      }));

      setUnits(normalized);
      if (count !== null) {
        setTotalUnits(count);
        setTotalPages(Math.ceil(count / itemsPerPage));
      }
    } catch (err) {
      console.error('Error loading units:', err);
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }

  // لما projectId يتغير: هات نماذج المشروع
  useEffect(() => {
    if (!projectId) {
      setModels([]);
      setModelId('');
      return;
    }
    (async () => {
      await loadModels(projectId);
      if (!prefillingRef.current) setModelId('');
    })();
  }, [projectId]);

  /* =====================
     Pagination Handlers
  ===================== */
  useEffect(() => {
    if (employee) {
      loadUnits(employee, currentPage);
    }
  }, [currentPage, itemsPerPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(e.target.value);
    setItemsPerPage(value);
    setCurrentPage(1); // العودة إلى الصفحة الأولى عند تغيير عدد العناصر
  };

  /* =====================
     FORM
  ===================== */
  function resetForm() {
    setEditingId(null);
    setUnitCode('');
    setBlockNo('');
    setUnitNo('');
    setUnitType('apartment');
    setStatus('available');
    setPrice('');
    setLandArea('');
    setBuildArea('');
    setProjectId('');
    setModelId('');
    setModels([]);
  }

  async function handleSubmit() {
    if (!unitCode.trim() || !projectId) {
      alert('كود الوحدة والمشروع مطلوبين');
      return;
    }
    if (!modelId) {
      alert('من فضلك اختر النموذج');
      return;
    }
    if (!price.trim() || Number(price) <= 0) {
      alert('من فضلك أدخل سعر صحيح');
      return;
    }

    setSaving(true);

    const payload = {
      unit_code: unitCode.trim(),
      block_no: blockNo.trim() || null,
      unit_no: unitNo.trim() || null,
      unit_type: unitType,
      status,
      supported_price: Number(price),
      land_area: landArea.trim() ? Number(landArea) : null,
      build_area: buildArea.trim() ? Number(buildArea) : null,
      project_id: projectId,
      model_id: modelId,
    };

    const res = editingId
      ? await supabase.from('units').update(payload).eq('id', editingId)
      : await supabase.from('units').insert(payload);

    setSaving(false);

    if (res.error) {
      alert(res.error.message);
      return;
    }

    resetForm();
    await loadUnits(employee, currentPage);
    await fetchTotalCount(employee);
    await fetchUnitStats(employee);
  }

  async function startEdit(u: Unit) {
    prefillingRef.current = true;

    setEditingId(u.id);
    setUnitCode(u.unit_code);
    setBlockNo(u.block_no || '');
    setUnitNo(u.unit_no || '');
    setUnitType(u.unit_type);
    setStatus(u.status);
    setPrice(String(u.supported_price));
    setLandArea(u.land_area !== null ? String(u.land_area) : '');
    setBuildArea(u.build_area !== null ? String(u.build_area) : '');
    setProjectId(u.project_id);
    await loadModels(u.project_id);
    setModelId(u.model_id || '');

    prefillingRef.current = false;
  }

  async function deleteUnit(u: Unit) {
    if (u.status !== 'available') {
      alert('لا يمكن حذف وحدة محجوزة أو مباعة');
      return;
    }

    const ok = confirm('هل أنت متأكد من حذف الوحدة؟');
    if (!ok) return;

    setDeletingId(u.id);
    const res = await supabase.from('units').delete().eq('id', u.id);
    setDeletingId(null);

    if (res.error) {
      alert(res.error.message);
      return;
    }

    await loadUnits(employee, currentPage);
    await fetchTotalCount(employee);
    await fetchUnitStats(employee);
  }

  /* =====================
     Excel Import/Export Handlers
  ===================== */

  function handleExportExcel() {
    if (totalUnits === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    
    const confirmExport = window.confirm(`هل تريد تصدير جميع الوحدات (${totalUnits.toLocaleString()}) إلى ملف Excel؟`);
    
    if (!confirmExport) return;

    setLoading(true);
    
    // جلب جميع الوحدات للتصدير
    const fetchAllUnits = async () => {
      try {
        let query = supabase
          .from('units')
          .select(`
            id,
            project_id,
            model_id,
            unit_code,
            block_no,
            unit_no,
            unit_type,
            status,
            supported_price,
            land_area,
            build_area,
            project:projects!units_project_id_fkey (name,code),
            model:project_models!units_model_id_fkey (name)
          `)
          .order('created_at', { ascending: false });

        if (employee && employee.role === 'sales') {
          const { data: employeeProjects } = await supabase
            .from('employee_projects')
            .select('project_id')
            .eq('employee_id', employee.id);

          const allowedProjectIds = (employeeProjects || []).map((p: any) => p.project_id);
          query = query.in('project_id', allowedProjectIds.length > 0 ? allowedProjectIds : ['']);
        }

        const { data, error } = await query;
        if (error) throw error;

        const normalized: Unit[] = (data || []).map((r: any) => ({
          id: r.id,
          project_id: r.project_id,
          model_id: r.model_id,
          unit_code: r.unit_code,
          block_no: r.block_no,
          unit_no: r.unit_no,
          unit_type: r.unit_type,
          status: r.status,
          supported_price: Number(r.supported_price || 0),
          land_area: r.land_area === null ? null : Number(r.land_area),
          build_area: r.build_area === null ? null : Number(r.build_area),
          project: normalizeRel<ProjectRef>(r.project),
          model: normalizeRel<ModelRef>(r.model),
        }));

        const fileName = `وحدات_${new Date().toISOString().split('T')[0]}.xlsx`;
        exportToExcel(normalized, fileName);
        
      } catch (err) {
        console.error('Error fetching all units for export:', err);
        alert('حدث خطأ في تحميل البيانات للتصدير');
      } finally {
        setLoading(false);
      }
    };

    fetchAllUnits();
  }

  function handleImportClick() {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // التحقق من نوع الملف
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      alert('الرجاء اختيار ملف Excel بصيغة .xlsx أو .xls أو .csv');
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setImportErrors([]);
    setShowImportErrors(false);

    try {
      // تحميل الملف ومعالجته
      await importFromExcel(
        file,
        async (data) => {
          // معالجة البيانات المستوردة
          const { processedUnits, errors } = await processImportedUnits(data, projects, models);
          
          if (errors.length > 0) {
            setImportErrors(errors);
            setShowImportErrors(true);
            
            if (processedUnits.length === 0) {
              alert('لا توجد وحدات صالحة للإضافة بسبب الأخطاء');
              setImporting(false);
              return;
            }
          }

          setImportProgress(30);

          // إضافة الوحدات إلى قاعدة البيانات
          let successCount = 0;
          let errorCount = 0;
          
          for (let i = 0; i < processedUnits.length; i++) {
            const unit = processedUnits[i];
            
            try {
              const { error } = await supabase.from('units').insert(unit);
              
              if (error) {
                errorCount = errorCount + 1;
                console.error(`Error importing unit ${i + 1}:`, error);
              } else {
                successCount = successCount + 1;
              }
              
              // تحديث التقدم
              const progress = 30 + Math.floor((i + 1) / processedUnits.length * 70);
              setImportProgress(progress);
              
            } catch (unitError) {
              errorCount = errorCount + 1;
              console.error(`Error importing unit ${i + 1}:`, unitError);
            }
          }
          
          setImportProgress(100);
          
          // عرض النتائج
          let message = `تم استيراد ${successCount} وحدة بنجاح.`;
          if (errorCount > 0) {
            message += ` فشل استيراد ${errorCount} وحدة.`;
          }
          if (errors.length > 0) {
            message += ` يوجد ${errors.length} خطأ في تنسيق البيانات.`;
          }
          
          alert(message);
          
          // إعادة تحميل البيانات والإحصائيات
          await loadUnits(employee, currentPage);
          await fetchTotalCount(employee);
          await fetchUnitStats(employee);
          
          // إعادة تعيين حقل الملف
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
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
    // إنشاء قالب Excel
    const templateData = [
      {
        'كود الوحدة': 'UNIT001',
        'رقم البلوك': 'B1',
        'رقم الوحدة': '101',
        'النوع': 'فيلا',
        'الحالة': 'متاحة',
        'مساحة الأرض': '300',
        'مسطح البناء': '250',
        'السعر المعتمد': '1500000',
        'المشروع': 'اسم المشروع',
        'النموذج': 'اسم النموذج'
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الوحدات');
    XLSX.writeFile(wb, 'قالب_استيراد_الوحدات.xlsx');
  }

  /* =====================
     UI
  ===================== */
  return (
    <RequireAuth>
      <div className="page units-page">
        {/* Excel Import/Export Section - للادمن فقط */}
        {employee?.role === 'admin' && (
          <Card title="استيراد وتصدير البيانات">
            <div className="form-row" style={{ gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <Button onClick={handleExportExcel} disabled={totalUnits === 0 || loading}>
                {loading ? 'جاري التصدير...' : 'تصدير إلى Excel'}
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
              
              {importing && (
                <div style={{ width: '100%', marginTop: '10px' }}>
                  <div style={{ 
                    width: '100%', 
                    backgroundColor: '#e0e0e0', 
                    borderRadius: '4px', 
                    overflow: 'hidden',
                    marginBottom: '5px'
                  }}>
                    <div 
                      style={{ 
                        width: `${importProgress}%`, 
                        height: '20px', 
                        backgroundColor: '#4CAF50',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '14px', color: '#666' }}>
                    {importProgress}%
                  </div>
                </div>
              )}
              
              {showImportErrors && importErrors.length > 0 && (
                <div style={{ 
                  width: '100%', 
                  marginTop: '10px',
                  padding: '10px',
                  backgroundColor: '#ffebee',
                  border: '1px solid #ffcdd2',
                  borderRadius: '4px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '10px'
                  }}>
                    <strong style={{ color: '#c62828' }}>أخطاء الاستيراد ({importErrors.length})</strong>
                    <button
                      onClick={() => setShowImportErrors(false)}
                      style={{ 
                        padding: '5px 10px',
                        fontSize: '12px',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      إغلاق
                    </button>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {importErrors.map((error, index) => (
                      <div 
                        key={index} 
                        style={{ 
                          padding: '5px 0', 
                          borderBottom: index < importErrors.length - 1 ? '1px solid #ffcdd2' : 'none',
                          fontSize: '12px',
                          color: '#c62828'
                        }}
                      >
                        {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* FORM */}
        {employee?.role === 'admin' && (
          <Card title={editingId ? 'تعديل وحدة' : 'إضافة وحدة'}>
            <div className="form-row">
              <Input placeholder="كود الوحدة" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} />
              <Input placeholder="رقم البلوك" value={blockNo} onChange={(e) => setBlockNo(e.target.value)} />
              <Input placeholder="رقم الوحدة" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} />
              <select value={unitType} onChange={(e) => setUnitType(e.target.value as any)}>
                {UNIT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <Input type="number" placeholder="مساحة الأرض" value={landArea} onChange={(e) => setLandArea(e.target.value)} />
              <Input type="number" placeholder="مسطح البناء" value={buildArea} onChange={(e) => setBuildArea(e.target.value)} />
              <Input type="number" placeholder="السعر المعتمد" value={price} onChange={(e) => setPrice(e.target.value)} />
              <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="available">متاحة</option>
                <option value="reserved">محجوزة</option>
                <option value="sold">مباعة</option>
              </select>

              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">اختر المشروع</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
                ))}
              </select>

              <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={!projectId}>
                <option value="">{projectId ? 'اختر النموذج' : 'اختر المشروع أولاً'}</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>

              <Button onClick={handleSubmit} disabled={saving}>{saving ? 'جاري الحفظ...' : editingId ? 'تعديل الوحدة' : 'إضافة وحدة'}</Button>
              {editingId && <Button variant="danger" onClick={resetForm}>إلغاء</Button>}
            </div>
          </Card>
        )}

        {/* TABLE */}
        <Card title={`قائمة الوحدات (${totalUnits.toLocaleString()})`}>
          {/* Statistics Section - للادمن فقط */}
          {employee?.role === 'admin' && (
            <div style={{ 
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
                  <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                    {unitStats.available.toLocaleString()}
                  </span> متاحة
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#FF9800', fontWeight: 'bold' }}>
                    {unitStats.reserved.toLocaleString()}
                  </span> محجوزة
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#F44336', fontWeight: 'bold' }}>
                    {unitStats.sold.toLocaleString()}
                  </span> مباعة
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                    {unitStats.total.toLocaleString()}
                  </span> إجمالي
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  عرض:
                </span>
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
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>
            </div>
          )}
          
          <div className="units-scroll">
            <Table headers={['الكود','النوع','الحالة','الأرض','البناء','السعر','المشروع','النموذج','إجراء']}>
              {loading ? (
                <tr><td colSpan={9} style={{textAlign:'center'}}>جاري التحميل...</td></tr>
              ) : units.length === 0 ? (
                <tr><td colSpan={9} style={{textAlign:'center'}}>لا توجد وحدات</td></tr>
              ) : (
                units.map(u => (
                  <tr key={u.id}>
                    <td className="sticky-left" data-label="الكود">{u.unit_code}</td>
                    <td data-label="النوع">{typeLabel(u.unit_type)}</td>
                    <td data-label="الحالة"><span className={`badge ${u.status}`}>{statusLabel(u.status)}</span></td>
                    <td data-label="الأرض">{u.land_area ?? '-'}</td>
                    <td data-label="البناء">{u.build_area ?? '-'}</td>
                    <td data-label="السعر" className="price">{u.supported_price.toLocaleString()}</td>
                    <td data-label="المشروع">{projectText(u.project)}</td>
                    <td data-label="النموذج">{u.model?.name || '-'}</td>
                    <td className="sticky-right" data-label="إجراء">
                      <div className="actions">
                        {employee?.role === 'admin' && (
                          <>
                            <Button onClick={() => startEdit(u)}>تعديل</Button>
                            <Button variant="danger" disabled={deletingId === u.id} onClick={() => deleteUnit(u)}>
                              {deletingId === u.id ? '...' : 'حذف'}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </Table>
          </div>

          {/* Pagination Footer */}
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
                عرض {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalUnits)} من {totalUnits.toLocaleString()} وحدة
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
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
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
                    if (page >= 1 && page <= totalPages) {
                      setCurrentPage(page);
                    }
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      setCurrentPage(1);
                    }
                  }}
                  style={{
                    width: '60px',
                    padding: '5px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    textAlign: 'center'
                  }}
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