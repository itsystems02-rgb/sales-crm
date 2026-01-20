'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Button from '@/components/ui/Button';
import { FiBell, FiSettings, FiChevronDown, FiLogOut } from 'react-icons/fi';
import { HiOutlineMenuAlt2, HiOutlineSearch } from 'react-icons/hi';

const TITLES: Record<string, string> = {
  '/dashboard': 'لوحة التحكم',
  '/dashboard/projects': 'المشاريع',
  '/dashboard/units': 'الوحدات',
  '/dashboard/clients': 'العملاء',
  '/dashboard/reservations': 'الحجوزات',
  '/dashboard/sales': 'التنفيذات',
  '/dashboard/employees': 'الموظفين',
};

type UserProfile = {
  name: string;
  role: string;
  email?: string;
};

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState(3); // عدد الإشعارات

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('employees')
      .select('name, role, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (data) {
      setUser({
        name: data.name,
        role: data.role || 'موظف',
        email: data.email,
      });
    } else {
      setUser({
        name: user.email?.split('@')[0] || 'مستخدم',
        role: 'مستخدم',
        email: user.email,
      });
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const titleKey = Object.keys(TITLES).find((key) => pathname.startsWith(key));
  const title = titleKey ? TITLES[titleKey] : 'لوحة التحكم';

  const getBreadcrumbs = () => {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 1 && parts[0] === 'dashboard') return ['Dashboard'];
    
    const breadcrumbs = ['Dashboard'];
    parts.slice(1).forEach(part => {
      const formatted = part.charAt(0).toUpperCase() + part.slice(1);
      breadcrumbs.push(formatted);
    });
    
    return breadcrumbs;
  };

  return (
    <header className="header pro-header">
      {/* Left Section */}
      <div className="header-left">
        <button className="menu-toggle">
          <HiOutlineMenuAlt2 size={24} />
        </button>
        
        <div className="header-text">
          <h1 className="header-title">{title}</h1>
          <div className="header-breadcrumb">
            {getBreadcrumbs().map((crumb, index) => (
              <span key={index}>
                {crumb}
                {index < getBreadcrumbs().length - 1 && (
                  <span className="separator">/</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Section */}
      <div className="header-right">
        {/* Search Bar */}
        <div className="search-container">
          <HiOutlineSearch className="search-icon" />
          <input 
            type="text" 
            placeholder="بحث..." 
            className="search-input"
          />
        </div>

        {/* Notifications */}
        <div className="notification-badge">
          <FiBell size={22} />
          {notifications > 0 && (
            <span className="notification-count">{notifications}</span>
          )}
        </div>

        {/* Settings */}
        <button className="settings-btn">
          <FiSettings size={22} />
        </button>

        {/* User Profile */}
        {user && (
          <div 
            className={`user-profile-container ${dropdownOpen ? 'active' : ''}`}
            onMouseEnter={() => setDropdownOpen(true)}
            onMouseLeave={() => setDropdownOpen(false)}
          >
            <div className="user-profile">
              <div className="avatar">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="user-info">
                <div className="user-name">{user.name}</div>
                <div className="user-role">{user.role}</div>
              </div>
              <FiChevronDown className="dropdown-icon" />
            </div>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="dropdown-menu">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="dropdown-name">{user.name}</div>
                    <div className="dropdown-email">{user.email}</div>
                  </div>
                </div>
                <div className="dropdown-divider"></div>
                <button className="dropdown-item">
                  <FiSettings size={18} />
                  <span>الإعدادات</span>
                </button>
                <button className="dropdown-item" onClick={logout}>
                  <FiLogOut size={18} />
                  <span>تسجيل خروج</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}