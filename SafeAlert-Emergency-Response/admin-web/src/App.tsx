import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/store/AuthContext';
import { Loading, PageHeader } from '@/components/UI';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Users from '@/pages/Users';
import Responders from '@/pages/Responders';
import Alerts from '@/pages/Alerts';
import Stats from '@/pages/Stats';
import Login from '@/pages/Login';
import Approvals from '@/pages/Approvals';
import AuditLogs from '@/pages/AuditLogs';
import Settings from '@/pages/Settings';
function Protected({ children }: { children: ReactNode }) { const { account, loading } = useAuth(); const location = useLocation(); if (loading) return <Loading text="Checking your session…" />; if (!account) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />; return children; }
export default function App() { return <Routes><Route path="/login" element={<Login />} /><Route path="/" element={<Protected><Layout /></Protected>}><Route index element={<Dashboard />} /><Route path="dashboard" element={<Navigate to="/" replace />} /><Route path="users" element={<Users />} /><Route path="responders" element={<Responders />} /><Route path="alerts" element={<Alerts />} /><Route path="records" element={<Alerts records />} /><Route path="stats" element={<Stats />} /><Route path="approvals" element={<Approvals />} /><Route path="audit-logs" element={<AuditLogs />} /><Route path="settings" element={<Settings />} /><Route path="*" element={<><PageHeader title="Page not found" description="This page is unavailable or its address has changed." /><Link className="button" to="/">Return to overview</Link></>} /></Route></Routes>; }
