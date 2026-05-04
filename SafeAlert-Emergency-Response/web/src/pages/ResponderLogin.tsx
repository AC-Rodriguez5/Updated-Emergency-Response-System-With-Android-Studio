import { useState } from 'react';
import { Shield, Mail, Lock, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';

import { API_URL } from '../config/api';

interface Props {
  onLogin: (email: string, token: string) => void;
}

export default function ResponderLogin({ onLogin }: Props) {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [badgeId, setBadgeId] = useState('');
  const [department, setDepartment] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !name || !badgeId || !department) {
      setError('Please fill all fields');
      return;
    }
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/auth/register/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, badgeId, department }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      
      setIsSignup(false);
      setSuccess('Account created successfully. Please log in.');
      setPassword('');
      setName('');
      setBadgeId('');
      setDepartment('');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill email and password');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/auth/login/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      
      // Store token and responder info
      localStorage.setItem('token', data.token);
      localStorage.setItem('responder', JSON.stringify(data.responder));
      onLogin(email, data.token);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo Card */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-lg mb-4">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              {isSignup ? 'Responder Registration' : 'Responder Portal'}
            </h1>
            <p className="text-blue-200">
              {isSignup ? 'Create your responder account' : 'Access emergency response dashboard'}
            </p>
          </div>

          {/* Alert Messages */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-400/30 rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-green-200 text-sm">{success}</span>
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-400/30 rounded-xl flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-red-200 text-sm">{error}</span>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {isSignup && (
              <>
                <div>
                  <label className="block text-blue-200 text-sm font-medium mb-2">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(null); setSuccess(null); }}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-blue-200 text-sm font-medium mb-2">Badge ID</label>
                    <input
                      type="text"
                      value={badgeId}
                      onChange={(e) => { setBadgeId(e.target.value); setError(null); setSuccess(null); }}
                      placeholder="R-12345"
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-blue-200 text-sm font-medium mb-2">Department</label>
                    <select
                      value={department}
                      onChange={(e) => { setDepartment(e.target.value); setError(null); setSuccess(null); }}
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                    >
                      <option value="" className="bg-slate-800">Select</option>
                      <option value="police" className="bg-slate-800">Police</option>
                      <option value="fire" className="bg-slate-800">Fire Dept</option>
                      <option value="medical" className="bg-slate-800">Medical</option>
                      <option value="rescue" className="bg-slate-800">Rescue</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-blue-200 text-sm font-medium mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(null); }}
                  placeholder="responder@agency.gov"
                  className="w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-blue-200 text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300/50" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); setSuccess(null); }}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-12 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-300/50 hover:text-white transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <button
              onClick={isSignup ? handleSignup : handleLogin}
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  {isSignup ? 'Create Account' : 'Sign In'}
                </>
              )}
            </button>

            {/* Toggle */}
            <div className="text-center pt-4 border-t border-white/10">
              <p className="text-blue-200 text-sm">
                {isSignup ? 'Already have an account?' : "Don't have an account?"}
                <button
                  onClick={() => { setIsSignup(!isSignup); setError(null); setSuccess(null); }}
                  className="ml-2 text-blue-400 hover:text-white font-medium transition"
                >
                  {isSignup ? 'Sign In' : 'Register'}
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-blue-300/60 text-sm">
          <p>SafeAlert Emergency Response System</p>
          <p className="mt-1">For authorized responders only</p>
        </div>
      </div>
    </div>
  );
}
