import React, { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import { API_BASE_URL } from '../config';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';

const ACCENT = '#F97316';
const PAGE = 'max-w-7xl mx-auto px-6 lg:px-20';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const genericSuccess = useMemo(
    () => 'Wenn ein Konto existiert, wurde ein Link zum Zurücksetzen des Passworts gesendet.',
    []
  );

  useEffect(() => {
    setError('');
    setSuccess('');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setError('');
    setSuccess('');

    const emailTrim = email.trim();
    if (!emailTrim || !isValidEmail(emailTrim)) {
      setError('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrim }),
      });

      if (!res.ok) {
        setError('Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.');
        return;
      }

      setSuccess(genericSuccess);
    } catch {
      setError('Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && !success;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      <div className="pointer-events-none absolute right-0 top-20 h-72 w-72 rounded-full bg-orange-500/[0.1] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-32 left-0 h-64 w-64 rounded-full bg-slate-400/[0.1] blur-3xl" aria-hidden />
      <section className="relative z-10 border-b border-slate-100 bg-gradient-to-b from-slate-50 via-white to-slate-100/30 pt-28 pb-12 lg:pt-32 lg:pb-16">
        <div className={PAGE}>
          <div className="mx-auto max-w-lg text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Passwort zurücksetzen</h1>
            <p className="mt-4 text-lg text-slate-500">
              Geben Sie Ihre E-Mail-Adresse ein. Wenn ein Konto existiert, senden wir Ihnen einen Link zum Zurücksetzen.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-slate-100 bg-gradient-to-b from-white via-slate-50/40 to-white py-24 lg:py-32">
        <div className={PAGE}>
          <Card className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <CardContent className="p-8">
              {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
              {success && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-emerald-700">{success}</p>
                  <p className="mt-3 text-sm text-slate-500">
                    <Link to="/admin/login" className="font-semibold hover:underline" style={{ color: ACCENT }}>
                      Gehe zu Login
                    </Link>
                  </p>
                </div>
              )}

              {!success && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="forgot-email" className="mb-2 block text-sm font-medium text-slate-700">
                      E-Mail
                    </label>
                    <Input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="name@example.com"
                      className="border-slate-200"
                      disabled={submitting}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full rounded-full font-semibold text-white shadow-sm disabled:opacity-70"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {submitting ? 'Wird gesendet…' : 'Reset-Link senden'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
