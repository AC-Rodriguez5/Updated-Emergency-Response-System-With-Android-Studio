import { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, Eye, EyeOff, Radio, Shield, Wifi } from 'lucide-react';
import { useAuth } from './useAuth';
import { getApiError } from '@/services/apiClient';
import { itemVariants, listVariants } from '@/styles/motion';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      navigate('/dashboard');
    } catch (reason) {
      setError(getApiError(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(420px,0.9fr)_1.1fr]">
      <section className="relative hidden overflow-hidden bg-[#071526] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(34,211,238,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.055)_1px,transparent_1px)] [background-size:34px_34px]" />
        <div className="absolute -right-28 top-10 size-80 rounded-full border border-cyan-300/10" />
        <div className="absolute -right-16 top-24 size-56 rounded-full border border-cyan-300/10" />

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-cyan-300 text-[#071526]">
            <Shield className="size-6" strokeWidth={2.4} />
          </div>
          <div>
            <p className="text-lg font-extrabold">TanzAlert</p>
            <p className="font-mono text-[9px] uppercase tracking-[.2em] text-cyan-100/55">Municipal response network</p>
          </div>
        </motion.div>

        <motion.div variants={listVariants} initial="hidden" animate="visible" className="relative max-w-xl">
          <motion.p variants={itemVariants} className="font-mono text-xs uppercase tracking-[.22em] text-cyan-300">Command center</motion.p>
          <motion.h1 variants={itemVariants} className="mt-5 text-5xl font-extrabold leading-[1.04] tracking-[-.045em] xl:text-6xl">
            Every signal.<br />One clear response.
          </motion.h1>
          <motion.p variants={itemVariants} className="mt-6 max-w-md text-base leading-7 text-slate-300">
            Live incident coordination for Tanza MDRRMO, designed for fast decisions when every second matters.
          </motion.p>
          <motion.div variants={itemVariants} className="mt-10 grid grid-cols-3 gap-3">
            {[
              [Radio, 'Realtime', 'Incident feed'],
              [Wifi, 'Connected', 'Field units'],
              [Activity, 'Monitored', 'System health'],
            ].map(([Icon, value, label]) => {
              const TileIcon = Icon as typeof Radio;
              return (
                <div key={String(value)} className="rounded-2xl border border-white/10 bg-white/[.055] p-4 backdrop-blur-sm">
                  <TileIcon className="size-4 text-cyan-300" />
                  <p className="mt-4 text-sm font-bold">{String(value)}</p>
                  <p className="mt-1 text-[10px] text-white/40">{String(label)}</p>
                </div>
              );
            })}
          </motion.div>
        </motion.div>

        <p className="relative font-mono text-[10px] uppercase tracking-[.16em] text-white/30">
          Tanza, Cavite · MDRRMO operations
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-[440px]"
        >
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid size-11 place-items-center rounded-xl bg-[#071526] text-cyan-300">
              <Shield className="size-5" />
            </div>
            <div>
              <p className="font-extrabold text-slate-950">TanzAlert</p>
              <p className="ta-kicker">Admin console</p>
            </div>
          </div>

          <p className="ta-kicker">Secure operator access</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-.035em] text-slate-950">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Sign in with your authorized MDRRMO administrator account.</p>

          <form noValidate onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                {error}
              </motion.div>
            )}
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-700">Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="username"
                placeholder="admin@tanzalert.local"
                className="ta-control w-full"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-slate-700">Password</span>
              <span className="relative block">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  className="ta-control w-full pr-12"
                />
                <button
                  type="button"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPwd((value) => !value)}
                  className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>
            <motion.button
              whileTap={{ scale: 0.985 }}
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#071526] px-4 text-sm font-extrabold text-white shadow-command transition-colors hover:bg-[#0B1B31] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Enter command center'}
              {!loading && <ArrowRight className="size-4" />}
            </motion.button>
          </form>
          <p className="mt-8 text-center font-mono text-[9px] uppercase tracking-[.15em] text-slate-400">
            Protected municipal operations system
          </p>
        </motion.div>
      </section>
    </main>
  );
}
