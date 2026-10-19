import { motion } from 'motion/react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, Ambulance, BarChart3, CheckSquare,
  ClipboardList, Cpu, LayoutDashboard, LogOut, Map, Radio, Settings, Shield,
  Users, X, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/useAuth';

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/responders', label: 'Responders', icon: Users },
  { to: '/dispatch', label: 'Dispatch', icon: Zap },
  { to: '/ambulance-requests', label: 'Ambulance', icon: Ambulance },
  { to: '/map', label: 'Map Center', icon: Map },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/approvals', label: 'Approvals', icon: CheckSquare },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/audit', label: 'Audit Logs', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}
export function Sidebar({ collapsed, mobileOpen, onClose, onToggle }: SidebarProps) {
  const { logout, admin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {mobileOpen && (
        <motion.button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
      )}
      <motion.aside
        initial={false}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-[286px] flex-col overflow-hidden bg-[#071526] text-white lg:sticky lg:top-0 lg:bottom-auto lg:z-20 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-20' : 'lg:w-[272px]',
          'transition-[width,transform] duration-200 ease-out',
        )}
      >
        <div className="flex h-[72px] items-center border-b border-white/10 px-4">
          {/*
            The brand is the collapse control: one obvious target, in the one
            place that is always visible whether the rail is open or shut. On a
            phone the sidebar is a drawer rather than a rail, so the same tap
            does the equivalent thing and closes it.
          */}
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                onClose();
                return;
              }
              onToggle();
            }}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[.06]"
          >
            <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-400 text-[#071526] shadow-[0_0_28px_rgba(34,211,238,.22)]">
              <Shield className="size-5" strokeWidth={2.4} />
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[#071526] bg-emerald-400" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold tracking-tight">TanzAlert</p>
                <p className="font-mono text-[9px] uppercase tracking-[.18em] text-cyan-200/65">
                  Command center
                </p>
              </div>
            )}
          </button>
          <button
            type="button"
            aria-label="Close navigation"
            className="grid size-11 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className={cn('px-4 pt-3', collapsed && 'lg:px-3')}>
          {!collapsed ? (
            <div className="flex items-center gap-2 rounded-xl border border-cyan-300/10 bg-cyan-300/[.06] px-3 py-2">
              <Radio className="size-4 text-cyan-300" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white/90">Operations live</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-white/35">Tanza MDRRMO</p>
              </div>
              <Activity className="size-4 text-emerald-400" />
            </div>
          ) : (
            <div className="mx-auto hidden size-9 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300 lg:grid" title="Operations live">
              <Radio className="size-4" />
            </div>
          )}
        </div>

        <nav
          aria-label="Primary navigation"
          className={cn(
            'ta-no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3 py-2',
            collapsed && 'lg:px-3',
          )}
        >
          {NAV.map(({ to, label, icon: Icon }, index) => (
            <motion.div
              key={to}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.025, 0.2) }}
            >
              <NavLink
                to={to}
                title={collapsed ? label : undefined}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'group relative flex min-h-[34px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-cyan-300/12 text-white'
                      : 'text-slate-400 hover:bg-white/[.06] hover:text-white',
                    collapsed && 'lg:justify-center lg:px-0',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-cyan-300" />}
                    <Icon className={cn('size-[18px] shrink-0', isActive && 'text-cyan-300')} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        <div className={cn('border-t border-white/10 px-3 py-2', collapsed && 'lg:px-3')}>
          {!collapsed && (
            <div className="mb-1.5 flex items-center gap-3 rounded-xl px-2 py-1.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-extrabold text-cyan-200">
                {(admin?.name ?? admin?.email ?? 'A').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{admin?.name ?? 'Administrator'}</p>
                <p className="truncate text-[10px] text-white/40">{admin?.email}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            title={collapsed ? 'Sign out' : undefined}
            className={cn(
              'flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-400 transition-colors hover:bg-red-400/10 hover:text-red-200',
              collapsed && 'lg:justify-center lg:px-0',
            )}
          >
            <LogOut className="size-[18px]" />
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
