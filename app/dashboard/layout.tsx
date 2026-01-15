import RequireAuth from '@/components/auth/RequireAuth';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <div className="app-layout">
        <Sidebar />

        <div>
          <Header />
          <main className="content">{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}