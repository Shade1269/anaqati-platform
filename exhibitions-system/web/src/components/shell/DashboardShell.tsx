import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, LogOut, Menu, X } from 'lucide-react';
import { Badge } from '../ui';

export interface NavLinkItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavLinkItem[];
}

interface Props {
  brand: string;
  brandSub?: string;
  accent?: 'gold' | 'emerald';
  sections: NavSection[];
  userName: string;
  roleLabel: string;
  roleTone?: 'gold' | 'success' | 'info';
  onLogout: () => void;
  notifications?: {
    unread: number;
    onClick: () => void;
  };
  topExtra?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}

export function DashboardShell({
  brand,
  brandSub,
  sections,
  userName,
  roleLabel,
  roleTone = 'gold',
  onLogout,
  notifications,
  topExtra,
  banner,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  const sidebar = (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-lg font-extrabold text-primary-hover">
          ⬩
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-wide text-text">{brand}</p>
          {brandSub && <p className="text-[11px] text-muted">{brandSub}</p>}
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {sections.map((sec, i) => (
          <div key={i}>
            {sec.title && (
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-muted/70">
                {sec.title}
              </p>
            )}
            <div className="space-y-1">
              {sec.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-primary/12 text-primary-hover'
                        : 'text-muted hover:bg-white/5 hover:text-text'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-primary" />
                      )}
                      <span className={isActive ? 'text-primary-hover' : ''}>
                        {item.icon}
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div className="min-h-screen">
      {/* Sidebar (right side for RTL) */}
      <aside className="fixed inset-y-0 right-0 z-40 hidden w-64 flex-col border-l border-white/10 bg-bg-2/80 backdrop-blur lg:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-64 flex-col border-l border-white/10 bg-bg-2">
            <button
              onClick={() => setOpen(false)}
              className="absolute left-3 top-4 rounded-lg p-1 text-muted hover:text-text"
            >
              <X size={20} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="lg:mr-64">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-bg/80 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen(true)}
                className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text lg:hidden"
              >
                <Menu size={20} />
              </button>
              {topExtra}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {notifications && (
                <button
                  onClick={notifications.onClick}
                  className="relative rounded-lg p-2 text-muted transition hover:bg-white/5 hover:text-text"
                  aria-label="الإشعارات"
                >
                  <Bell size={19} />
                  {notifications.unread > 0 && (
                    <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                      {notifications.unread > 9 ? '9+' : notifications.unread}
                    </span>
                  )}
                </button>
              )}
              <div className="hidden text-left sm:block">
                <p className="text-sm font-bold text-text">{userName}</p>
              </div>
              <Badge tone={roleTone}>{roleLabel}</Badge>
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-muted transition hover:bg-white/10 hover:text-text"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">خروج</span>
              </button>
            </div>
          </div>
        </header>

        <main className="animate-fade-up px-4 py-6 sm:px-6 lg:px-8">
          {banner}
          {children}
        </main>
      </div>
    </div>
  );
}
