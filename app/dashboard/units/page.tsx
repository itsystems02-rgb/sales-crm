'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentEmployee } from '@/lib/getCurrentEmployee';
import * as XLSX from 'xlsx';

/* =====================
   Types
===================== */

type ProjectRef = { name: string; code: string | null };
type ModelRef = { name: string };

type Employee = {
  id: string;
  role: 'admin' | 'sales' | 'sales_manager';
};

type Unit = {
  id: string;
  project_id: string;
  model_id: string | null;
  unit_code: string;
  block_no: string | null;
  unit_no: string | null;
  unit_type: 'villa' | 'duplex' | 'apartment' | 'townhouse';
  status: 'available' | 'reserved' | 'sold';
  supported_price: number;
  land_area: number | null;
  build_area: number | null;
  project: ProjectRef | null;
  model: ModelRef | null;
  created_at: string;
};

type ProjectOption = { id: string; name: string; code: string | null };
type ModelOption = { id: string; name: string };

type UnitStats = {
  available: number;
  reserved: number;
  sold: number;
  total: number;
  totalPrice: number;
};

type FilterState = {
  project: string;
  model: string;
  unitType: string;
  status: string;
  priceFrom: string;
  priceTo: string;
  areaFrom: string;
  areaTo: string;
  search: string;
  sortBy: 'created_at' | 'unit_code' | 'supported_price' | 'land_area';
  sortOrder: 'asc' | 'desc';
};

const UNIT_TYPES = [
  { value: 'villa', label: 'فيلا' },
  { value: 'duplex', label: 'دوبلكس' },
  { value: 'apartment', label: 'شقة' },
  { value: 'townhouse', label: 'تاون هاوس' },
] as const;

const UNIT_STATUSES = [
  { value: 'available', label: 'متاحة', color: '#10b981' },
  { value: 'reserved', label: 'محجوزة', color: '#f59e0b' },
  { value: 'sold', label: 'مباعة', color: '#ef4444' },
] as const;

/* =====================
   Helpers
===================== */

function projectText(p: ProjectRef | null) {
  if (!p) return '-';
  return p.code ? `${p.name} (${p.code})` : p.name;
}

function formatCurrency(amount: number) {
  return amount.toLocaleString('ar-SA') + ' ريال';
}

function formatArea(area: number | null) {
  return area ? `${Number(area).toLocaleString('ar-SA')} م²` : '-';
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'admin': return 'مدير نظام';
    case 'sales_manager': return 'مدير مبيعات';
    case 'sales': return 'مندوب مبيعات';
    default: return role;
  }
}

function StatusBadge({
  status,
  label
}: {
  status: 'available' | 'reserved' | 'sold';
  label: string;
}) {
  const colors = {
    available: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
    reserved: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7' },
    sold: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' }
  };

  const color = colors[status];

  return (
    <span
      style={{
        backgroundColor: color.bg,
        color: color.color,
        border: `1px solid ${color.border}`,
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600',
        display: 'inline-block'
      }}
    >
      {label}
    </span>
  );
}

function StatCard({
  title,
  value,
  color,
  icon,
  isCurrency = false
}: {
  title: string;
  value: number | string;
  color: string;
  icon: string;
  isCurrency?: boolean;
}) {
  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '20px',
      border: `1px solid ${color}20`,
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'transform 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '15px'
    }}
      onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{
        width: '50px',
        height: '50px',
        borderRadius: '10px',
        backgroundColor: `${color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        color: color
      }}>
        {icon}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: isCurrency ? '16px' : '24px',
          fontWeight: '700',
          color: color,
          lineHeight: 1.2
        }}>
          {isCurrency ? value : typeof value === 'number' ? value.toLocaleString('ar-SA') : value}
        </div>
        <div style={{
          fontSize: '14px',
          color: '#666',
          marginTop: '5px'
        }}>
          {title}
        </div>
      </div>
    </div>
  );
}

/* =====================
   Page
===================== */

export default function UnitsPage() {
  const [employee, setEmployee] = useState<Employee | null>(null);

  // Data
  const [rows, setRows] = useState<Unit[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // Dropdowns
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Stats
  const [stats, setStats] = useState<UnitStats>({
    available: 0,
    reserved: 0,
    sold: 0,
    total: 0,
    totalPrice: 0
  });

  // Form States
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

  // Filters
  const [filters, setFilters] = useState<FilterState>({
    project: 'all',
    model: 'all',
    unitType: 'all',
    status: 'all',
    priceFrom: '',
    priceTo: '',
    areaFrom: '',
    areaTo: '',
    search: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });

  // Pagination (server-side)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const totalPages = Math.max(1, Math.ceil(totalRows / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + rows.length, totalRows);

  // Prepare payload for RPC
  const filtersPayload = useMemo(() => ({
    project: filters.project,
    model: filters.model,
    unitType: filters.unitType,
    status: filters.status,
    priceFrom: filters.priceFrom,
    priceTo: filters.priceTo,
    areaFrom: filters.areaFrom,
    areaTo: filters.areaTo,
    search: filters.search,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder
  }), [filters]);

  /* =====================
     Init
  ===================== */

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    setError(null);
    setLoading(true);
    setStatsLoading(true);

    try {
      const emp = await getCurrentEmployee();
      setEmployee(emp);

      await Promise.all([
        loadProjects(emp),
        loadStats(),
      ]);

      await loadUnits(1, itemsPerPage, filtersPayload);
      setCurrentPage(1);
    } catch (e) {
      console.error(e);
      setError('حدث خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
      setStatsLoading(false);
    }
  }

  /* =====================
     Load Projects (أسرع: Join employee_projects -> projects)
  ===================== */

  async function loadProjects(emp: Employee | null) {
    try {
      // admin يشوف الكل
      if (emp?.role === 'admin') {
        const { data, error } = await supabase
          .from('projects')
          .select('id,name,code')
          .order('name');

        if (error) throw error;
        setProjects(data || []);
        return;
      }

      // sales / sales_manager: المشاريع المسموح بيها فقط
      const { data, error } = await supabase
        .from('employee_projects')
        .select('project_id, projects:projects(id,name,code)')
        .eq('employee_id', emp?.id || '');

      if (error) throw error;

      const mapped: ProjectOption[] = (data || [])
        .map((r: any) => r.projects)
        .filter(Boolean)
        .map((p: any) => ({ id: p.id, name: p.name, code: p.code }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

      setProjects(mapped);
    } catch (e) {
      console.error('Error loading projects:', e);
      setProjects([]);
    }
  }

  /* =====================
     Load Models
  ===================== */

  const loadModels = useCallback(async (projId: string) => {
    if (!projId) {
      setModels([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('project_models')
        .select('id,name')
        .eq('project_id', projId)
        .order('name');
      if (error) throw error;
      setModels(data || []);
    } catch (e) {
      console.error('Error loading models:', e);
      setModels([]);
    }
  }, []);

  const loadModelsForFilter = useCallback(async (projId: string) => {
    if (!projId || projId === 'all') {
      setModels([]);
      return;
    }
    await loadModels(projId);
  }, [loadModels]);

  // Models for form
  useEffect(() => {
    if (projectId) loadModels(projectId);
    else setModels([]);
  }, [projectId, loadModels]);

  // Models for filter
  useEffect(() => {
    loadModelsForFilter(filters.project);
  }, [filters.project, loadModelsForFilter]);

  /* =====================
     RPC Calls
  ===================== */

  async function loadStats() {
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.rpc('units_stats');
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;

      setStats({
        available: Number(row?.available || 0),
        reserved: Number(row?.reserved || 0),
        sold: Number(row?.sold || 0),
        total: Number(row?.total || 0),
        totalPrice: Number(row?.total_price || 0),
      });
    } catch (e) {
      console.error('Error loading stats:', e);
      setStats({
        available: 0, reserved: 0, sold: 0, total: 0, totalPrice: 0
      });
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadUnits(page: number, pageSize: number, fPayload: any) {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc('units_list', {
        filters: fPayload,
        page,
        page_size: pageSize,
      });

      if (error) throw error;

      const total = Number(data?.total || 0);
      const list = (data?.rows || []) as Unit[];

      setTotalRows(total);
      setRows(list);
    } catch (e) {
      console.error('Error loading units:', e);
      setError('حدث خطأ في تحميل البيانات من قاعدة البيانات');
      setTotalRows(0);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Debounce للبحث/الفلاتر
  useEffect(() => {
    const t = setTimeout(() => {
      const safePage = Math.min(currentPage, totalPages);
      loadUnits(safePage, itemsPerPage, filtersPayload);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersPayload, currentPage, itemsPerPage]);

  // لو الفلاتر اتغيرت (غير الصفحة)، رجّع للصفحة 1
  useEffect(() => {
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.project, filters.model, filters.unitType, filters.status,
    filters.priceFrom, filters.priceTo, filters.areaFrom, filters.areaTo,
    filters.sortBy, filters.sortOrder, filters.search
  ]);

  /* =====================
     Actions
  ===================== */

  function resetFilters() {
    setFilters({
      project: 'all',
      model: 'all',
      unitType: 'all',
      status: 'all',
      priceFrom: '',
      priceTo: '',
      areaFrom: '',
      areaTo: '',
      search: '',
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
  }

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
    if (!unitCode.trim() || !projectId || !price.trim() || Number(price) <= 0) {
      alert('يرجى ملء جميع الحقول المطلوبة بشكل صحيح');
      return;
    }

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
      model_id: modelId || null,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from('units')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        alert('تم تحديث الوحدة بنجاح');
      } else {
        const { error } = await supabase
          .from('units')
          .insert(payload);
        if (error) throw error;
        alert('تم إضافة الوحدة بنجاح');
      }

      resetForm();
      await Promise.all([
        loadStats(),
        loadUnits(currentPage, itemsPerPage, filtersPayload),
      ]);
    } catch (e) {
      console.error('Error saving unit:', e);
      alert('حدث خطأ في حفظ البيانات');
    }
  }

  async function startEdit(unit: Unit) {
    setEditingId(unit.id);
    setUnitCode(unit.unit_code);
    setBlockNo(unit.block_no || '');
    setUnitNo(unit.unit_no || '');
    setUnitType(unit.unit_type);
    setStatus(unit.status);
    setPrice(String(unit.supported_price));
    setLandArea(unit.land_area ? String(unit.land_area) : '');
    setBuildArea(unit.build_area ? String(unit.build_area) : '');
    setProjectId(unit.project_id);

    await loadModels(unit.project_id);
    setModelId(unit.model_id || '');
  }

  async function deleteUnit(unit: Unit) {
    if (unit.status !== 'available') {
      alert('لا يمكن حذف وحدة محجوزة أو مباعة');
      return;
    }

    if (!confirm('هل أنت متأكد من حذف هذه الوحدة؟')) return;

    try {
      const { error } = await supabase
        .from('units')
        .delete()
        .eq('id', unit.id);

      if (error) throw error;

      alert('تم حذف الوحدة بنجاح');
      await Promise.all([
        loadStats(),
        loadUnits(currentPage, itemsPerPage, filtersPayload),
      ]);
    } catch (e) {
      console.error('Error deleting unit:', e);
      alert('حدث خطأ في حذف الوحدة');
    }
  }

  async function exportToExcel() {
    setExporting(true);

    try {
      // هنجيب كل النتائج (حسب الفلاتر) في مرة واحدة لو العدد معقول
      // لو كبير جداً، هات جزء أو زوّد حد أقصى حسب احتياجك
      const maxExport = 50000;
      const pageSize = Math.min(Math.max(totalRows, 1), maxExport);

      const { data, error } = await supabase.rpc('units_list', {
        filters: filtersPayload,
        page: 1,
        page_size: pageSize,
      });

      if (error) throw error;

      const all = (data?.rows || []) as Unit[];

      if (totalRows > maxExport) {
        alert(`⚠️ عدد النتائج ${totalRows} كبير. تم تصدير أول ${maxExport} فقط.`);
      }

      const excelData = all.map(unit => ({
        'كود الوحدة': unit.unit_code,
        'رقم البلوك': unit.block_no || '-',
        'رقم الوحدة': unit.unit_no || '-',
        'النوع': UNIT_TYPES.find(t => t.value === unit.unit_type)?.label || unit.unit_type,
        'الحالة': UNIT_STATUSES.find(s => s.value === unit.status)?.label || unit.status,
        'مساحة الأرض': unit.land_area || '-',
        'مسطح البناء': unit.build_area || '-',
        'السعر المعتمد': unit.supported_price,
        'المشروع': projectText(unit.project),
        'النموذج': unit.model?.name || '-',
        'تاريخ الإنشاء': new Date(unit.created_at).toLocaleDateString('ar-SA')
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'الوحدات');

      const fileName = `وحدات_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e) {
      console.error('Error exporting:', e);
      alert('حدث خطأ في تصدير البيانات');
    } finally {
      setExporting(false);
    }
  }

  /* =====================
     Render states
  ===================== */

  if (loading && rows.length === 0 && !error) {
    return (
      <div style={{
        padding: '40px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        flexDirection: 'column'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }}></div>
        <div style={{ color: '#666' }}>جاري تحميل الوحدات...</div>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '40px',
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <h2 style={{ marginTop: 0 }}>⚠️ حدث خطأ</h2>
          <p>{error}</p>
        </div>
        <button
          onClick={init}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          🔄 حاول مرة أخرى
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>

      {/* ===== HEADER ===== */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <div>
          <h1 style={{
            margin: '0 0 10px 0',
            color: '#2c3e50',
            fontSize: '28px'
          }}>
            🏠 إدارة الوحدات
          </h1>
          <p style={{ color: '#666', margin: 0 }}>
            إجمالي الوحدات: <strong>{Number(stats.total).toLocaleString('ar-SA')}</strong> وحدة
            {employee && (
              <span style={{ marginRight: '15px', color: '#0d8a3e' }}>
                • {getRoleLabel(employee.role)}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            {showFilters ? '✖ إخفاء الفلاتر' : '🔍 عرض الفلاتر'}
          </button>

          <button
            onClick={exportToExcel}
            disabled={exporting || totalRows === 0}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              opacity: (exporting || totalRows === 0) ? 0.6 : 1
            }}
          >
            {exporting ? '⏳ جاري التصدير...' : '📊 تصدير Excel'}
          </button>

          <button
            onClick={async () => {
              await Promise.all([loadStats(), loadUnits(currentPage, itemsPerPage, filtersPayload)]);
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            🔄 تحديث البيانات
          </button>
        </div>
      </div>

      {/* ===== STATISTICS ===== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid #e0e0e0',
                height: 90
              }} />
            ))}
          </>
        ) : (
          <>
            <StatCard title="المتاحة" value={stats.available} color="#10b981" icon="✅" />
            <StatCard title="المحجوزة" value={stats.reserved} color="#f59e0b" icon="⏳" />
            <StatCard title="المباعة" value={stats.sold} color="#ef4444" icon="💰" />
            <StatCard title="القيمة الإجمالية" value={formatCurrency(stats.totalPrice)} color="#8b5cf6" icon="💎" isCurrency />
          </>
        )}
      </div>

      {/* ===== FILTERS PANEL ===== */}
      {showFilters && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px',
          border: '1px solid #dee2e6',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#2c3e50' }}>🔍 فلاتر البحث المتقدمة</h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
            marginBottom: '20px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                بحث سريع
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                placeholder="ابحث بكود الوحدة، البلوك، المشروع..."
                style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                المشروع
              </label>
              <select
                value={filters.project}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, project: e.target.value, model: 'all' }));
                }}
                style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
              >
                <option value="all">جميع المشاريع</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}{project.code ? ` (${project.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                النموذج
              </label>
              <select
                value={filters.model}
                onChange={(e) => setFilters(prev => ({ ...prev, model: e.target.value }))}
                disabled={!filters.project || filters.project === 'all'}
                style={{
                  width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd',
                  fontSize: '14px', backgroundColor: 'white',
                  opacity: (!filters.project || filters.project === 'all') ? 0.6 : 1
                }}
              >
                <option value="all">{(!filters.project || filters.project === 'all') ? 'اختر المشروع أولاً' : 'جميع النماذج'}</option>
                {models.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                نوع الوحدة
              </label>
              <select
                value={filters.unitType}
                onChange={(e) => setFilters(prev => ({ ...prev, unitType: e.target.value }))}
                style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
              >
                <option value="all">جميع الأنواع</option>
                {UNIT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                حالة الوحدة
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
              >
                <option value="all">جميع الحالات</option>
                {UNIT_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                من سعر
              </label>
              <input
                type="number"
                value={filters.priceFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, priceFrom: e.target.value }))}
                placeholder="الحد الأدنى"
                style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                إلى سعر
              </label>
              <input
                type="number"
                value={filters.priceTo}
                onChange={(e) => setFilters(prev => ({ ...prev, priceTo: e.target.value }))}
                placeholder="الحد الأقصى"
                style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                المساحة (م²)
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="number"
                  value={filters.areaFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, areaFrom: e.target.value }))}
                  placeholder="من"
                  style={{ flex: 1, padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' }}
                />
                <input
                  type="number"
                  value={filters.areaTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, areaTo: e.target.value }))}
                  placeholder="إلى"
                  style={{ flex: 1, padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#2c3e50' }}>
                ترتيب حسب
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as FilterState['sortBy'] }))}
                  style={{ flex: 1, padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
                >
                  <option value="created_at">تاريخ الإنشاء</option>
                  <option value="unit_code">كود الوحدة</option>
                  <option value="supported_price">السعر</option>
                  <option value="land_area">المساحة</option>
                </select>

                <select
                  value={filters.sortOrder}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortOrder: e.target.value as 'asc' | 'desc' }))}
                  style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
                >
                  <option value="desc">تنازلي</option>
                  <option value="asc">تصاعدي</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            paddingTop: '20px',
            borderTop: '1px solid #eee'
          }}>
            <button
              onClick={resetFilters}
              style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              🔄 إعادة الضبط
            </button>
            <button
              onClick={() => setShowFilters(false)}
              style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              تطبيق الفلاتر
            </button>
          </div>
        </div>
      )}

      {/* ===== RESULTS SUMMARY ===== */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ color: '#495057', fontWeight: '500' }}>نتائج البحث:</span>
          <span style={{ color: '#2c3e50', fontWeight: '600' }}>{Number(totalRows).toLocaleString('ar-SA')} وحدة</span>
          {filters.search && (
            <span style={{ backgroundColor: '#e3f2fd', padding: '5px 15px', borderRadius: '20px', fontSize: '14px', color: '#1565c0' }}>
              🔍 البحث: "{filters.search}"
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>عرض:</span>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>

      {/* ===== ADD/EDIT FORM (Admin & Sales Manager فقط) ===== */}
      {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '30px',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#2c3e50' }}>
            {editingId ? '✏️ تعديل وحدة' : '➕ إضافة وحدة جديدة'}
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            marginBottom: '20px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>كود الوحدة *</label>
              <input
                type="text"
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                placeholder="أدخل كود الوحدة"
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>رقم البلوك</label>
              <input
                type="text"
                value={blockNo}
                onChange={(e) => setBlockNo(e.target.value)}
                placeholder="رقم البلوك"
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>رقم الوحدة</label>
              <input
                type="text"
                value={unitNo}
                onChange={(e) => setUnitNo(e.target.value)}
                placeholder="رقم الوحدة"
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>نوع الوحدة</label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as Unit['unit_type'])}
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
              >
                {UNIT_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>الحالة</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Unit['status'])}
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
              >
                {UNIT_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>السعر المعتمد *</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="السعر المعتمد"
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>مساحة الأرض (م²)</label>
              <input
                type="number"
                value={landArea}
                onChange={(e) => setLandArea(e.target.value)}
                placeholder="مساحة الأرض"
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>مسطح البناء (م²)</label>
              <input
                type="number"
                value={buildArea}
                onChange={(e) => setBuildArea(e.target.value)}
                placeholder="مسطح البناء"
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>المشروع *</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white' }}
              >
                <option value="">اختر المشروع</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}{project.code ? ` (${project.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>النموذج</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={!projectId}
                style={{ width: '100%', padding: '10px 15px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', backgroundColor: 'white', opacity: !projectId ? 0.6 : 1 }}
              >
                <option value="">{projectId ? 'اختر النموذج' : 'اختر المشروع أولاً'}</option>
                {models.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            {editingId && (
              <button
                onClick={resetForm}
                style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                إلغاء التعديل
              </button>
            )}
            <button
              onClick={handleSubmit}
              style={{ padding: '10px 30px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
            >
              {editingId ? '💾 حفظ التعديلات' : '➕ إضافة وحدة'}
            </button>
          </div>
        </div>
      )}

      {/* ===== TABLE ===== */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
        overflow: 'hidden',
        marginBottom: '30px'
      }}>
        {totalRows === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🏠</div>
            <h3 style={{ marginBottom: '10px', color: '#495057' }}>
              لا توجد وحدات تطابق معايير البحث
            </h3>
            <p style={{ marginBottom: '30px', maxWidth: '500px', margin: '0 auto' }}>
              حاول تغيير الفلاتر أو البحث.
            </p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                    <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>كود الوحدة</th>
                    <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>البلوك / الوحدة</th>
                    <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>النوع</th>
                    <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>الحالة</th>
                    <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>المساحة</th>
                    <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>السعر</th>
                    <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>المشروع</th>
                    <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>النموذج</th>
                    {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
                      <th style={{ padding: '15px', textAlign: 'right', fontWeight: '600', color: '#495057', fontSize: '14px' }}>الإجراءات</th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((unit, index) => (
                    <tr
                      key={unit.id}
                      style={{
                        backgroundColor: index % 2 === 0 ? '#fff' : '#f8f9fa',
                        borderBottom: '1px solid #e9ecef',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e9ecef'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#fff' : '#f8f9fa'}
                    >
                      <td style={{ padding: '15px' }}>
                        <div style={{ fontWeight: '600', color: '#2c3e50', fontFamily: 'monospace', fontSize: '13px' }}>
                          {unit.unit_code}
                        </div>
                        <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                          {new Date(unit.created_at).toLocaleDateString('ar-SA')}
                        </div>
                      </td>

                      <td style={{ padding: '15px' }}>
                        <div style={{ color: '#495057' }}>{unit.block_no || '-'}</div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>{unit.unit_no || '-'}</div>
                      </td>

                      <td style={{ padding: '15px' }}>
                        <div style={{ color: '#495057' }}>
                          {UNIT_TYPES.find(t => t.value === unit.unit_type)?.label || unit.unit_type}
                        </div>
                      </td>

                      <td style={{ padding: '15px' }}>
                        <StatusBadge
                          status={unit.status}
                          label={UNIT_STATUSES.find(s => s.value === unit.status)?.label || unit.status}
                        />
                      </td>

                      <td style={{ padding: '15px' }}>
                        <div style={{ color: '#495057' }}>{formatArea(unit.land_area)}</div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>{formatArea(unit.build_area)}</div>
                      </td>

                      <td style={{ padding: '15px' }}>
                        <div style={{ color: '#495057', fontWeight: '600' }}>
                          {formatCurrency(Number(unit.supported_price || 0))}
                        </div>
                      </td>

                      <td style={{ padding: '15px' }}>
                        <div style={{ color: '#495057' }}>{projectText(unit.project)}</div>
                      </td>

                      <td style={{ padding: '15px' }}>
                        <div style={{ color: '#495057' }}>{unit.model?.name || '-'}</div>
                      </td>

                      {(employee?.role === 'admin' || employee?.role === 'sales_manager') && (
                        <td style={{ padding: '15px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => startEdit(unit)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#e3f2fd',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#1565c0',
                                cursor: 'pointer',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px'
                              }}
                            >
                              ✏️ تعديل
                            </button>

                            <button
                              onClick={() => deleteUnit(unit)}
                              disabled={unit.status !== 'available'}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: unit.status === 'available' ? '#f8d7da' : '#e9ecef',
                                border: 'none',
                                borderRadius: '4px',
                                color: unit.status === 'available' ? '#721c24' : '#6c757d',
                                cursor: unit.status === 'available' ? 'pointer' : 'not-allowed',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                opacity: unit.status === 'available' ? 1 : 0.6
                              }}
                            >
                              🗑️ حذف
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ===== PAGINATION ===== */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '15px',
                borderTop: '1px solid #e9ecef',
                backgroundColor: '#f8f9fa',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  عرض <strong>{(startIndex + 1).toLocaleString('ar-SA')} - {endIndex.toLocaleString('ar-SA')}</strong> من <strong>{totalRows.toLocaleString('ar-SA')}</strong> وحدة
                </div>

                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setCurrentPage(1)}
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
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) pageNum = i + 1;
                    else if (currentPage <= 3) pageNum = i + 1;
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                    else pageNum = currentPage - 2 + i;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        style={{
                          padding: '8px 12px',
                          minWidth: '40px',
                          backgroundColor: currentPage === pageNum ? '#1d4ed8' : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: currentPage === pageNum ? 'bold' : 'normal'
                        }}
                      >
                        {pageNum.toLocaleString('ar-SA')}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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
                    onClick={() => setCurrentPage(totalPages)}
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
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '14px', color: '#666' }}>الصفحة:</span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={currentPage}
                    onChange={(e) => {
                      const p = parseInt(e.target.value);
                      if (!Number.isNaN(p) && p >= 1 && p <= totalPages) setCurrentPage(p);
                    }}
                    style={{
                      width: '60px',
                      padding: '5px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      textAlign: 'center'
                    }}
                  />
                  <span style={{ fontSize: '14px', color: '#666' }}>من {totalPages.toLocaleString('ar-SA')}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#6c757d',
        textAlign: 'center',
        border: '1px dashed #dee2e6'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span>آخر تحديث: {new Date().toLocaleString('ar-SA')}</span>
          <span>نتائج: {totalRows.toLocaleString('ar-SA')}</span>
          <span>القيمة الإجمالية: {formatCurrency(stats.totalPrice)}</span>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
