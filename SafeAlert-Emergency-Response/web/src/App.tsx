import { useState, useEffect } from 'react';
import ResponderLogin from './pages/ResponderLogin';
import ResponderDashboard from './pages/ResponderDashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [responderEmail, setResponderEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem('responderToken');
    const email = localStorage.getItem('responderEmail');
    
    if (token && email) {
      setIsAuthenticated(true);
      setResponderEmail(email);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (email: string, token: string) => {
    localStorage.setItem('responderToken', token);
    localStorage.setItem('responderEmail', email);
    setIsAuthenticated(true);
    setResponderEmail(email);
  };

  const handleLogout = () => {
    localStorage.removeItem('responderToken');
    localStorage.removeItem('responderEmail');
    setIsAuthenticated(false);
    setResponderEmail(null);
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {isAuthenticated ? (
        <ResponderDashboard email={responderEmail!} onLogout={handleLogout} />
      ) : (
        <ResponderLogin onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
