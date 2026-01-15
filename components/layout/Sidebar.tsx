'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <h2>Sales CRM</h2>

      <Link href="/projects" className={pathname === '/projects' ? 'active' : ''}>
        المشاريع
      </Link>

      <Link href="/units" className={pathname === '/units' ? 'active' : ''}>
        الوحدات
      </Link>

      {/* جاهزين نزوّد */}
      {/* <Link href="/clients">العملاء</Link> */}
    </aside>
  );
}