import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Server, FolderGit2, LayoutDashboard, LogOut } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/servers', icon: Server, label: 'Servers' },
  { to: '/projects', icon: FolderGit2, label: 'Projects' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-[240px] min-w-[240px] bg-bg-sidebar flex flex-col border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 h-16 px-5 border-b border-border">
          <div className="w-2 h-2 rounded-none bg-accent-green" />
          <span className="font-['JetBrains_Mono'] text-sm font-bold tracking-[1px] text-white">
            SRV_DASH
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col py-2">
          <p className="px-5 py-2 text-[10px] font-['JetBrains_Mono'] font-semibold tracking-[1.5px] text-text-dark uppercase">
            Overview
          </p>
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-5 py-3 text-xs font-['JetBrains_Mono'] font-medium tracking-[0.5px] transition-colors ${
                  active
                    ? 'bg-accent-green/6 text-accent-green font-bold'
                    : 'text-text-muted hover:text-text-light hover:bg-white/[0.02]'
                }`}
              >
                <Icon size={16} />
                <span className="uppercase">{label}</span>
              </Link>
            );
          })}

          {/* Spacer */}
          <div className="flex-1" />

          {/* User */}
          <div className="flex items-center gap-3 h-16 px-4 border-t border-border">
            <div className="w-8 h-8 bg-bg-alt border border-border" />
            <div className="flex-1 min-w-0">
              <p className="font-['JetBrains_Mono'] text-xs font-bold text-white truncate uppercase">
                {user?.username}
              </p>
              <p className="font-['JetBrains_Mono'] text-[11px] font-medium text-text-muted">
                // ADMIN
              </p>
            </div>
            <button
              onClick={logout}
              className="text-text-dim hover:text-accent-red transition-colors p-1"
            >
              <LogOut size={14} />
            </button>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
