import logo from '../Images/logo.png';
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MailX, CheckCircle, Loader2, Mail } from 'lucide-react';
import api from '../api/axios';

export default function Unsubscribe() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Auto-trigger unsubscribe if email is provided in the query string
  useEffect(() => {
    if (initialEmail && token) {
      const timer = setTimeout(() => {
        handleUnsubscribeDirectly(initialEmail);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [initialEmail, token]);

  const handleUnsubscribeDirectly = async (emailToUnsub: string) => {
    if (!emailToUnsub || !token) return;
    setStatus('loading');
    try {
      const res = await api.post(`/unsubscribe/${token}`, { email: emailToUnsub });
      setMessage(res.data.message);
      setStatus('success');
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to unsubscribe. Invalid link.');
      setStatus('error');
    }
  };

  const handleUnsubscribe = async () => {
    handleUnsubscribeDirectly(email);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F8FB] px-4 relative overflow-hidden">
      {/* Background glow divs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="glass-card p-8 text-center bg-white border border-gray-200 shadow-xl rounded-2xl">
          {status === 'success' ? (
            <>
              <CheckCircle className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Unsubscribed</h1>
              <p className="text-gray-600 text-sm font-medium">{message}</p>
              <p className="text-xs text-gray-400 mt-4">
                You will no longer receive marketing emails from desireinfoweb.com
              </p>
            </>
          ) : status === 'error' ? (
            <>
              <MailX className="w-16 h-16 text-red-655 text-red-600 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
              <p className="text-gray-600 text-sm font-medium">{message}</p>
              <button
                onClick={() => setStatus('idle')}
                className="btn-secondary mt-5 px-6 py-2 shadow-sm text-xs font-semibold"
              >
                Try Again
              </button>
            </>
          ) : (
            <>
              <img src={logo} alt="Desire Mail Logo" className="w-16 h-16 mx-auto object-contain rounded-2xl mb-5 shadow-md shadow-brand-500/5" />
              <h1 className="text-2xl font-bold text-gray-950 mb-2">Unsubscribe</h1>
              <p className="text-gray-500 text-sm mb-6 font-medium">
                Enter your email address to unsubscribe from desireinfoweb.com marketing emails.
              </p>

              <div className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="input-field text-center font-medium placeholder-gray-400 focus:outline-none"
                />
                <button
                  onClick={handleUnsubscribe}
                  disabled={!email || status === 'loading'}
                  className="btn-danger w-full flex items-center justify-center gap-2 py-3 rounded-xl shadow-sm text-sm font-semibold"
                >
                  {status === 'loading' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <MailX className="w-4 h-4" />
                      Unsubscribe
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} desireinfoweb.com — All rights reserved
        </p>
      </div>
    </div>
  );
}
