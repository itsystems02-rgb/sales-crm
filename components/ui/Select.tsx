'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Home() {
  useEffect(() => {
    supabase.from('projects').select('*').then(console.log);
  }, []);

  return <h1>Sales CRM 🚀</h1>;
}