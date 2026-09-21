import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { itemVariants } from '@/styles/motion';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: string;
  urgent?: boolean;
}
export function StatCard({ label, value, icon, trend, urgent }: StatCardProps) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2 }}
      className={cn(
        'group relative min-w-0 overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_8px_24px_rgba(7,21,38,.055)]',
        urgent ? 'border-red-200' : 'border-slate-200/90',
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-0.5', urgent ? 'bg-emergency' : 'bg-cyan-400')} />
      <div className="flex items-start justify-between gap-3">
        <div className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          urgent ? 'bg-red-50 text-emergency' : 'bg-slate-950 text-cyan-300',
        )}>
          {icon}
        </div>
        <ArrowUpRight className="size-4 text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <p className="mt-5 text-xs font-semibold text-slate-500">{label}</p>
      <p className={cn('mt-1 text-3xl font-extrabold tracking-[-.035em]', urgent ? 'text-emergency' : 'text-slate-950')}>
        {value}
      </p>
      {trend && <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-400">{trend}</p>}
    </motion.div>
  );
}
