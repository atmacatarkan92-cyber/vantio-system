import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { API_BASE_URL } from '../config';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';

const ACCENT = '#F97316';
const PAGE = 'max-w-7xl mx-auto px-6 lg:px-20';

function isValidPasswordLength(pw) {
  return String(pw || '').length >= 8;
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('token');
  }, [location.search]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setError('');
    setSuccess('');
  }, [token]);

  const canSubmit = Boolean(token) && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      setError('This reset link is invalid.');
      return;
    }

    setError('');
    setSuccess('');

    if (!newPassword || !isValidPasswordLength(newPassword)) {
      setError('Validation error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Validation error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          new_password: newPassword,
        }),
      });

      let payload = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        const detail = payload?.detail ? String(payload.detail) : '';

        if (detail.includes('Invalid or expired token')) {
          setError('This reset link is invalid or has expired.');
        } else if (detail.includes('Password does not meet requirements')) {
          setError('Password does not meet requirements');
        } else {
          setError('Something went wrong. Please try again.');
        }
        return;
      }

      setSuccess('Your password has been reset successfully.');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        try {
          navigate('/admin/login');
        } catch {
          // ignore
        }
      }, 1500);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      <div className="pointer-events-none absolute right-0 top-20 h-72 w-72 rounded-full bg-orange-500/[0.1] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-32 left-0 h-64 w-64 rounded-full bg-slate-400/[0.1] blur-3xl" aria-hidden />
      <section className="relative z-10 border-b border-slate-100 bg-gradient-to-b from-slate-50 via-white to-slate-100/30 pt-28 pb-12 lg:pt-32 lg:pb-16">
        <div className={PAGE}>
          <div className="mx-auto max-w-lg text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Reset Password</h1>
            <p className="mt-4 text-lg text-slate-500">
              {token ? 'Choose a new password for your account.' : 'This reset link is invalid.'}
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-slate-100 bg-gradient-to-b from-white via-slate-50/40 to-white py-24 lg:py-32">
        <div className={PAGE}>
          <Card className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <CardContent className="p-8">
              {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
              {success && <p className="mb-4 text-sm font-medium text-emerald-700">{success}</p>}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-700">
                    New password *
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={!token}
                    className="border-slate-200"
                  />
                </div>

                <div>
                  <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-700">
                    Confirm new password *
                  </label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    disabled={!token}
                    className="border-slate-200"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full rounded-full font-semibold text-white shadow-sm disabled:opacity-70"
                  style={{ backgroundColor: ACCENT }}
                >
                  {submitting ? 'Resetting …' : 'Reset Password'}
                </Button>
              </form>

              {success && (
                <p className="mt-6 text-sm text-slate-500">
                  <Link to="/admin/login" className="font-semibold hover:underline" style={{ color: ACCENT }}>
                    Go to Login
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
