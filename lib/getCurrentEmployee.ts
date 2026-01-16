import { supabase } from '@/lib/supabaseClient';

export async function getCurrentEmployee() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.email) return null;

  const { data } = await supabase
    .from('employees')
    .select('*')
    .eq('email', session.user.email)
    .single();

  return data;
}