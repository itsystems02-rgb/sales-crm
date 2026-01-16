import { supabase } from '@/lib/supabaseClient';

export async function getCurrentEmployee() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data } = await supabase
    .from('employees')
    .select('*')
    .eq('email', user.email)
    .single();

  return data;
}