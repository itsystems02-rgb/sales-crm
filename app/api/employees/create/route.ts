import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase env variables are missing');
}

const supabaseAdmin = createClient(
  supabaseUrl,
  serviceRoleKey
);

export async function POST(req: Request) {
  const body = await req.json();
  const { name, email, password, job_title, mobile } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: 'بيانات ناقصة' },
      { status: 400 }
    );
  }

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 400 }
    );
  }

  const { error: dbError } = await supabaseAdmin
    .from('employees')
    .insert({
      id: authUser.user.id,
      name,
      email,
      job_title: job_title || null,
      mobile: mobile || null,
      status: 'active',
      role: 'sales',
      password_hash: 'auth',
    });

  if (dbError) {
    return NextResponse.json(
      { error: dbError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}