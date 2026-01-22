async function loadUnits(emp: Employee | null = null) {
  setLoading(true);

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
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(10000); // زيادة الحد إلى 10000

    // ... بقية الكود كما هو
  }
}