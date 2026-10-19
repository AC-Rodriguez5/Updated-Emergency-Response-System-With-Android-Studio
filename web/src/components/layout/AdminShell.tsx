import { type ReactNode, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Menu, Radio } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NotificationCenterButton } from '@/features/notifications/NotificationCenterButton';
import { pageVariants } from '@/styles/motion';

interface AdminShellProps {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
}
export function AdminShell({ children, title = 'Command Center', actions }: AdminShellProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ta-sidebar') === 'collapsed');

  useEffect(() => {
    localStorage.setItem('ta-sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  return (
    <div className="flex min-h-dvh bg-canvas text-slate-950">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onToggle={() => setCollapsed((value) => !value)}
      />
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-slate-200/80 bg-canvas/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Open navigation"
            className="mr-3 grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="ta-kicker hidden sm:block">Tanza MDRRMO / live operations</p>
            <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl">{title}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 xl:flex">
              <Radio className="size-3.5" />
              System connected
            </div>
            {actions}
            <NotificationCenterButton />
          </div>
        </header>
        <motion.div
          key={location.pathname}
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          className="p-4 sm:p-6 lg:p-8"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
