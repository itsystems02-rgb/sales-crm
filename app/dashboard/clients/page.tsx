'use client';

import { useEffect, useState, useRef } from 'react';
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

/* =====================
   Excel Import/Export Functions
===================== */

// تصدير البيانات إلى Excel
function exportToExcel(clients: ClientListItem[], fileName: string = 'العملاء.xlsx') {
  try {
    // تحويل البيانات إلى تنسيق مناسب لـ Excel
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
      'تاريخ الإنشاء': new Date(client.created_at).toLocaleDateString('ar-SA'),
    }));

    // إنشاء ورقة عمل
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // إنشاء مصنف
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'العملاء');
    
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
async function processImportedClients(
  data: any[], 
  banks: Option[], 
  jobSectors: Option[]
) {
  const processedClients = [];
  const errors = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNumber = i + 2; // +2 لأن الصف الأول هو العناوين
    
    try {
      // جمع البيانات الأساسية
      const name = row['اسم العميل'] || row['name'] || row['Name'];
      const mobile = row['رقم الجوال'] || row['mobile'] || row['Mobile'];
      const email = row['البريد الإلكتروني'] || row['email'] || row['Email'];
      
      // التحقق من البيانات المطلوبة
      if (!name) {
        errors.push(`الصف ${rowNumber}: اسم العميل مطلوب`);
        continue;
      }
      
      if (!mobile) {
        errors.push(`الصف ${rowNumber}: رقم الجوال مطلوب`);
        continue;
      }
      
      // تحويل نوع الهوية
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
      
      // تحويل الجنسية
      const nationalityMap: Record<string, 'saudi' | 'non_saudi'> = {
        'سعودي': 'saudi',
        'غير سعودي': 'non_saudi',
        'saudi': 'saudi',
        'non_saudi': 'non_saudi'
      };
      
      const nationalityText = row['الجنسية'] || row['nationality'] || row['Nationality'] || 'saudi';
      const nationality = nationalityMap[nationalityText] || 'saudi';
      
      // تحويل نوع الإقامة
      const residencyTypeText = row['نوع الإقامة'] || row['residency_type'] || row['Residency Type'] || '';
      const residencyType = nationality === 'non_saudi' ? (residencyTypeText || null) : null;
      
      // تحويل الحالة
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
      
      // تحويل الأهلية
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
      
      // البحث عن البنوك
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
      
      // البحث عن القطاع الوظيفي
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
      
      // إنشاء كائن العميل
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
        status,
      };
      
      processedClients.push(client);
    } catch (error) {
      errors.push(`الصف ${rowNumber}: خطأ في معالجة البيانات - ${error}`);
    }
  }
  
  return { processedClients, errors };
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Excel import states
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showImportErrors, setShowImportErrors] = useState(false);

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
        await fetchClients();
        await fetchBanks();
        await fetchJobSectors();
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
     LOAD DATA
  ===================== */
  async function fetchClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) { 
        console.error('Error fetching clients:', error);
        alert('حدث خطأ في تحميل العملاء: ' + error.message); 
        return; 
      }
      
      setClients(data || []);
    } catch (error) {
      console.error('Error in fetchClients:', error);
      setClients([]);
    }
  }

  async function fetchBanks() {
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
  }

  async function fetchJobSectors() {
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
  }

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
  }

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
        status: 'lead',
      };

      const res = await supabase.from('clients').insert(payload);
      if (res.error) { 
        alert(res.error.message); 
        return; 
      }

      alert('تم إضافة العميل بنجاح');
      resetForm();
      await fetchClients();
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      alert('حدث خطأ في حفظ البيانات');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClient(clientId: string) {
    // التحقق من الصلاحية
    if (employee?.role !== 'admin') {
      alert('لا تملك صلاحية حذف العملاء');
      return;
    }

    const confirmDelete = window.confirm('هل أنت متأكد من حذف العميل؟');
    if (!confirmDelete) return;

    try {
      // التحقق إذا كان العميل مرتبط بحجوزات
      const { count: reservationsCount } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId);

      if ((reservationsCount || 0) > 0) {
        alert('لا يمكن حذف عميل مرتبط بحجوزات');
        return;
      }

      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId);

      if (error) {
        alert(error.message);
        return;
      }

      alert('تم حذف العميل بنجاح');
      await fetchClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('حدث خطأ في حذف العميل');
    }
  }

  async function handleEditClient(clientId: string) {
    // التحقق من الصلاحية
    if (employee?.role !== 'admin') {
      alert('لا تملك صلاحية تعديل العملاء');
      return;
    }

    try {
      // جلب بيانات العميل
      const { data: client, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (error) {
        alert('خطأ في جلب بيانات العميل: ' + error.message);
        return;
      }

      if (!client) {
        alert('العميل غير موجود');
        return;
      }

      // تعبئة النموذج للتحرير
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
      
      // نقل التركيز للنموذج
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
      };

      const { error } = await supabase
        .from('clients')
        .update(payload)
        .eq('id', editingId);

      if (error) { 
        alert(error.message); 
        return; 
      }

      alert('تم تحديث بيانات العميل بنجاح');
      resetForm();
      await fetchClients();
    } catch (error) {
      console.error('Error in handleSaveEdit:', error);
      alert('حدث خطأ في حفظ البيانات');
    } finally {
      setSaving(false);
    }
  }

  /* =====================
     Excel Import/Export Handlers
  ===================== */

  function handleExportExcel() {
    if (clients.length === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }
    
    const fileName = `العملاء_${new Date().toISOString().split('T')[0]}.xlsx`;
    exportToExcel(clients, fileName);
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
          const { processedClients, errors } = await processImportedClients(data, banks, jobSectors);
          
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

          // إضافة العملاء إلى قاعدة البيانات
          let successCount = 0;
          let errorCount = 0;
          
          for (let i = 0; i < processedClients.length; i++) {
            const client = processedClients[i];
            
            try {
              const { error } = await supabase.from('clients').insert(client);
              
              if (error) {
                errorCount = errorCount + 1;
                console.error(`Error importing client ${i + 1}:`, error);
              } else {
                successCount = successCount + 1;
              }
              
              // تحديث التقدم
              const progress = 30 + Math.floor((i + 1) / processedClients.length * 70);
              setImportProgress(progress);
              
            } catch (clientError) {
              errorCount = errorCount + 1;
              console.error(`Error importing client ${i + 1}:`, clientError);
            }
          }
          
          setImportProgress(100);
          
          // عرض النتائج
          let message = `تم استيراد ${successCount} عميل بنجاح.`;
          if (errorCount > 0) {
            message += ` فشل استيراد ${errorCount} عميل.`;
          }
          if (errors.length > 0) {
            message += ` يوجد ${errors.length} خطأ في تنسيق البيانات.`;
          }
          
          alert(message);
          
          // إعادة تحميل البيانات
          await fetchClients();
          
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
        'القطاع الوظيفي': 'حكومي'
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'العملاء');
    XLSX.writeFile(wb, 'قالب_استيراد_العملاء.xlsx');
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
              <Button onClick={handleExportExcel} disabled={clients.length === 0}>
                تصدير إلى Excel
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
                    <Button 
                      variant="danger"
                      onClick={() => setShowImportErrors(false)}
                    >
                      إغلاق
                    </Button>
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
        {(employee?.role === 'admin' || employee?.role === 'sales') && (
          <Card title={editingId ? 'تعديل عميل' : 'إضافة عميل'}>
            <div className="form-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Input 
                placeholder="اسم العميل" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
              />
              <Input 
                placeholder="رقم الجوال" 
                value={mobile} 
                onChange={(e) => setMobile(e.target.value)} 
              />
              <Input 
                placeholder="الإيميل" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
              />
              <select 
                value={identityType} 
                onChange={(e) => setIdentityType(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                {IDENTITY_TYPES.map(i => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
              <Input 
                placeholder="رقم الهوية" 
                value={identityNo} 
                onChange={(e) => setIdentityNo(e.target.value)} 
              />
              <select 
                value={eligible ? 'yes' : 'no'} 
                onChange={(e) => setEligible(e.target.value === 'yes')}
                style={{ minWidth: '120px' }}
              >
                <option value="yes">مستحق</option>
                <option value="no">غير مستحق</option>
              </select>
              <select 
                value={nationality} 
                onChange={(e) => setNationality(e.target.value as any)}
                style={{ minWidth: '120px' }}
              >
                <option value="saudi">سعودي</option>
                <option value="non_saudi">غير سعودي</option>
              </select>
              {nationality === 'non_saudi' && (
                <select 
                  value={residencyType} 
                  onChange={(e) => setResidencyType(e.target.value)}
                  style={{ minWidth: '150px' }}
                >
                  <option value="">نوع الإقامة</option>
                  {RESIDENCY_TYPES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              )}
              <select 
                value={salaryBankId} 
                onChange={(e) => setSalaryBankId(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="">بنك الراتب</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select 
                value={financeBankId} 
                onChange={(e) => setFinanceBankId(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="">بنك التمويل</option>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select 
                value={jobSectorId} 
                onChange={(e) => setJobSectorId(e.target.value)}
                style={{ minWidth: '150px' }}
              >
                <option value="">القطاع الوظيفي</option>
                {jobSectors.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
              
              <Button 
                onClick={editingId ? handleSaveEdit : handleSubmit} 
                disabled={saving}
              >
                {saving ? 'جاري الحفظ...' : editingId ? 'تحديث' : 'حفظ'}
              </Button>
              
              {editingId && (
                <Button 
                  onClick={resetForm}
                  variant="danger"
                >
                  إلغاء
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* جدول العملاء */}
        <Card title={`قائمة العملاء (${clients.length})`}>
          {/* Statistics Section - للادمن فقط */}
          {employee?.role === 'admin' && (
            <div style={{ 
              padding: '10px 15px', 
              backgroundColor: '#f5f5f5', 
              borderBottom: '1px solid #e0e0e0',
              marginBottom: '15px',
              borderRadius: '4px 4px 0 0'
            }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#2196F3', fontWeight: 'bold' }}>
                    {clients.filter(c => c.status === 'lead').length}
                  </span> متابعة
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#FF9800', fontWeight: 'bold' }}>
                    {clients.filter(c => c.status === 'reserved').length}
                  </span> محجوز
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                    {clients.filter(c => c.status === 'visited').length}
                  </span> تمت الزيارة
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#9C27B0', fontWeight: 'bold' }}>
                    {clients.filter(c => c.status === 'converted').length}
                  </span> تم البيع
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
                    {clients.filter(c => c.eligible).length}
                  </span> مستحق
                </span>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  <span style={{ color: '#F44336', fontWeight: 'bold' }}>
                    {clients.filter(c => !c.eligible).length}
                  </span> غير مستحق
                </span>
              </div>
            </div>
          )}
          
          <Table headers={['الاسم','الجوال','مستحق','الحالة','إجراء']}>
            {loading ? (
              <tr><td colSpan={5} style={{textAlign:'center', padding: '2rem'}}>جاري تحميل العملاء...</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={5} style={{textAlign:'center', padding: '2rem'}}>لا يوجد عملاء</td></tr>
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
                    <span className={`badge status-${c.status}`}>
                      {translateStatus(c.status)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Button 
                        onClick={() => router.push(`/dashboard/clients/${c.id}`)}
                      >
                        فتح
                      </Button>
                      {employee?.role === 'admin' && (
                        <>
                          <Button 
                            onClick={() => handleEditClient(c.id)}
                          >
                            تعديل
                          </Button>
                          <Button 
                            onClick={() => handleDeleteClient(c.id)}
                            variant="danger"
                          >
                            حذف
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </Table>
        </Card>
      </div>
    </RequireAuth>
  );
}