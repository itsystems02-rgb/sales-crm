import { supabase } from '@/lib/supabaseClient';

export async function getCurrentEmployee() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .single();

  if (error) {
    console.error('getCurrentEmployee error:', error);
    return null;
  }

  return data;
}