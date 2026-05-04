import { useEffect, useState } from 'react';
import { UserDashboard } from './components/UserDashboard';
import { ResponderDashboard } from './components/ResponderDashboard';
import { SystemArchitecture } from './components/SystemArchitecture';
import { Info, X } from 'lucide-react';
import UserAuth from './auth/UserAuth';
import ResponderAuth from './auth/ResponderAuth';

type Role = 'user' | 'responder' | null;

export default function App() {
  const [view, setView] = useState<'user' | 'responder'>('user');
  const [showArchitecture, setShowArchitecture] = useState(false);

  // auth state
  const [authRole, setAuthRole] = useState<Role>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  useEffect(() => {
    const role = localStorage.getItem('authRole') as Role | null;
    const email = localStorage.getItem('authEmail');
    if (role) setAuthRole(role);
    if (email) setAuthEmail(email);
  }, []);

  const login = (role: Exclude<Role, null>, email: string) => {
    localStorage.setItem('authRole', role);
    localStorage.setItem('authEmail', email);
    setAuthRole(role);
    setAuthEmail(email);
    setView(role);
  };

  const logout = () => {
    localStorage.removeItem('authRole');
    localStorage.removeItem('authEmail');
    setAuthRole(null);
    setAuthEmail(null);
    setView('user');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      {showArchitecture ? (
        <div className="w-full">
          <SystemArchitecture />
        </div>
      ) : (
          <div className="w-full">
          {authRole ? (
            view === 'user' ? (
              <UserDashboard onLogout={logout} />
            ) : (
              <ResponderDashboard onLogout={logout} />
            )
          ) : (
            // when not authenticated, show the appropriate auth card
            view === 'user' ? (
              <UserAuth onLogin={(email) => login('user', email)} onSwitchRole={(r) => setView(r)} />
            ) : (
              <ResponderAuth onLogin={(email) => login('responder', email)} onSwitchRole={(r) => setView(r)} />
            )
          )}
        </div>
      )}
    </div>
  );
}
   