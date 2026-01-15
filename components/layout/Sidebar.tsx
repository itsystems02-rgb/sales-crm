'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <h2>Sales CRM</h2>

      <Link href="/dashboard/projects" className={pathname === '/dashboard/projects' ? 'active' : ''}>
        المشاريع
      </Link>

      <Link href="/dashboard/units" className={pathname === '/dashboard/units' ? 'active' : ''}>
        الوحدات
      </Link>

      {/* جاهزين نزوّد */}
      {/* <Link href="/clients">العملاء</Link> */}
    </aside>
  );
}