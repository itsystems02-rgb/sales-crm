'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  FiHome, 
  FiFolder, 
  FiLayers, 
  FiUsers, 
  FiCalendar, 
  FiTrendingUp, 
  FiUser,
  FiChevronLeft,
  FiChevronRight
} from 'react-icons/fi';

const LINKS = [
  { href: '/dashboard', label: 'الصفحة الرئيسية', icon: <FiHome size={20} /> },
  { href: '/dashboard/projects', label: 'المشاريع', icon: <FiFolder size={20} /> },
  { href: '/dashboard/units', label: 'الوحدات', icon: <FiLayers size={20} /> },
  { href: '/dashboard/clients', label: 'العملاء', icon: <FiUsers size={20} /> },
  { href: '/dashboard/reservations', label: 'الحجوزات', icon: <FiCalendar size={20} /> },
  { href: '/dashboard/sales', label: 'التنفيذات', icon: <FiTrendingUp size={20} /> },
  { href: '/dashboard/employees', label: 'الموظفين', icon: <FiUser size={20} /> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const toggleDropdown = (href: string) => {
    setActiveDropdown(activeDropdown === href ? null : href);
  };

  return (
    <aside className={`sidebar pro-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Header/Brand */}
      <div className="sidebar-header">
        <div className="brand">
          <div className="logo">
            <div className="logo-icon">CRM</div>
          </div>
          {!collapsed && (
            <div className="brand-text">
              <div className="brand-title">CRM System</div>
              <div className="brand-subtitle">Management Panel</div>
            </div>
          )}
        </div>
        
        <button 
          className="collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <FiChevronRight size={20} /> : <FiChevronLeft size={20} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="section-title">القائمة الرئيسية</div>
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            const hasSubmenu = link.href === '/dashboard/clients';
            
            return (
              <div key={link.href} className="nav-item-wrapper">
                <Link
                  href={link.href}
                  className={`nav-item ${active ? 'active' : ''}`}
                  onClick={(e) => {
                    if (hasSubmenu) {
                      e.preventDefault();
                      toggleDropdown(link.href);
                    }
                  }}
                >
                  <div className="nav-icon">{link.icon}</div>
                  {!collapsed && (
                    <>
                      <span className="nav-text">{link.label}</span>
                      {hasSubmenu && (
                        <FiChevronRight 
                          className={`dropdown-arrow ${activeDropdown === link.href ? 'rotated' : ''}`} 
                          size={16} 
                        />
                      )}
                    </>
                  )}
                </Link>
                
                {/* Submenu for Clients */}
                {hasSubmenu && activeDropdown === link.href && !collapsed && (
                  <div className="submenu">
                    <Link 
                      href="/dashboard/clients" 
                      className={`submenu-item ${pathname === '/dashboard/clients' ? 'active' : ''}`}
                    >
                      قائمة العملاء
                    </Link>
                    <Link 
                      href="/dashboard/clients/new" 
                      className={`submenu-item ${pathname === '/dashboard/clients/new' ? 'active' : ''}`}
                    >
                      إضافة عميل جديد
                    </Link>
                    <Link 
                      href="/dashboard/clients/reports" 
                      className={`submenu-item ${pathname === '/dashboard/clients/reports' ? 'active' : ''}`}
                    >
                      تقارير العملاء
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Additional Sections */}
        <div className="nav-section">
          <div className="section-title">التقارير</div>
          <Link href="/dashboard/reports" className="nav-item">
            <div className="nav-icon">📊</div>
            {!collapsed && <span className="nav-text">التقارير</span>}
          </Link>
          <Link href="/dashboard/analytics" className="nav-item">
            <div className="nav-icon">📈</div>
            {!collapsed && <span className="nav-text">التحليلات</span>}
          </Link>
        </div>
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        {!collapsed && (
          <div className="footer-content">
            <div className="help-section">
              <div className="help-title">تحتاج مساعدة؟</div>
              <Link href="/help" className="help-link">الدعم الفني</Link>
            </div>
            <div className="copyright">
              <small>© 2026 CRM System v2.0</small>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="copyright-collapsed">
            <small>CRM</small>
          </div>
        )}
      </div>
    </aside>
  );
}