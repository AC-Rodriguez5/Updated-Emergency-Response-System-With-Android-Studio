import { useState } from 'react';

interface Props {
  onLogin: (email: string) => void;
  onSwitchRole?: (role: 'user' | 'responder') => void;
}

export default function UserAuth({ onLogin, onSwitchRole }: Props) {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSignup = () => {
    if (!email || !password || !name) {
      setError('Please fill all fields');
      return;
    }
    const key = `user:${email}`;
    if (localStorage.getItem(key)) {
      setError('User already exists. Please login.');
      return;
    }
    const user = { name, email, password };
    localStorage.setItem(key, JSON.stringify(user));
    // After signup, return to login view and show success message (do not auto-login)
    setIsSignup(false);
    setSuccess('Account created. Please log in.');
    setPassword('');
    setName('');
  };

  const handleLogin = () => {
    if (!email || !password) {
      setError('Please fill email and password');
      return;
    }
    const key = `user:${email}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      setError('User not found. Please sign up.');
      return;
    }
    const user = JSON.parse(raw);
    if (user.password !== password) {
      setError('Invalid credentials');
      return;
    }
    onLogin(email);
  };

  return (
    <div className="w-full max-w-[340px] mx-auto bg-white rounded-xl shadow-md p-8 mx-4">
      <div className="flex flex-col items-center">
        <div className="bg-red-600 rounded-full w-16 h-16 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 1l3 2 3 1 1 3v4l-1 3-3 2-3 1-3-1-3-2-1-3v-4l1-3 3-1 3-2z" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-2xl font-semibold mb-1">Welcome Back</h2>
        <p className="text-gray-500 mb-6">Log in to your SafeAlert account</p>
      </div>

      {success && <div className="mb-4 text-green-600">{success}</div>}
      {error && <div className="mb-4 text-red-600">{error}</div>}

      {isSignup ? (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input value={name} onChange={e => { setName(e.target.value); setError(null); setSuccess(null); }} placeholder="John Doe" className="w-full pr-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200" />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <input value={email} onChange={e => { setEmail(e.target.value); setError(null); setSuccess(null); }} placeholder="john@example.com" className="w-full pl-3 pr-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200" />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null); setSuccess(null); }} placeholder="••••••••" className="w-full pl-3 pr-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSignup} className="flex-1 bg-red-600 text-white py-3 rounded-lg font-medium">Create account</button>
            <button onClick={() => { setIsSignup(false); setError(null); setSuccess(null); }} className="flex-1 border rounded-lg py-3">Back to login</button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <input value={email} onChange={e => { setEmail(e.target.value); setError(null); }} placeholder="john@example.com" className="w-full pl-10 pr-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200" />
              <div className="absolute left-3 top-3 text-gray-400">✉️</div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null); }} placeholder="••••••••" className="w-full pl-10 pr-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-200" />
              <div className="absolute left-3 top-3 text-gray-400">🔒</div>
            </div>
          </div>

          <div>
            <button onClick={handleLogin} className="w-full bg-red-600 text-white py-3 rounded-lg font-medium">Log In</button>
          </div>

          <div className="mt-4 text-center">
            <span className="text-gray-600">Don't have an account? </span>
            <button onClick={() => { setIsSignup(true); setError(null); }} className="text-red-600 font-medium">Sign up</button>
          </div>
        </>
      )}

      <div className="mt-6 border-t pt-4 text-center text-sm text-gray-600">
        <div>Quick Access</div>
        <button onClick={() => onSwitchRole?.('responder')} className="text-blue-600 mt-2">Responder Login →</button>
      </div>
    </div>
  );
}
