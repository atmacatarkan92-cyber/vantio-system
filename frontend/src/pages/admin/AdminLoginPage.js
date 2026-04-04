import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import LoginEmailVerificationBlock from "../../components/auth/LoginEmailVerificationBlock";
import { LOGIN_DETAIL_EMAIL_NOT_VERIFIED, login as apiLogin, getMe } from "../../api/auth";

const cardClassName =
  "mx-auto w-full max-w-[400px] rounded-[18px] border border-[#E5E7EB] bg-white p-8 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-white/[0.1] dark:bg-[#141824] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)]";

/** Explicit light colors + dark variants so fields do not inherit shell `text-[#eef2ff]` in dark mode. */
const inputClassName =
  "box-border w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm text-[#0f172a] placeholder:text-slate-500 dark:border-white/[0.14] dark:bg-[#111520] dark:text-[#f1f5f9] dark:placeholder:text-slate-400";

const labelClassName =
  "mb-1.5 block text-[13px] font-semibold text-[#374151] dark:text-slate-200";

function AdminLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setEmailNotVerified(false);
    setSubmitting(true);

    apiLogin(email, password)
      .then(async (data) => {
        const token = data.access_token;
        if (!token) {
          setError("Kein Token in der Antwort.");
          return;
        }
        login(token);
        const me = await getMe();
        if (me?.role === "platform_admin") {
          navigate("/platform", { replace: true });
        } else {
          navigate("/admin/dashboard", { replace: true });
        }
      })
      .catch((err) => {
        if (err.message === LOGIN_DETAIL_EMAIL_NOT_VERIFIED) {
          setEmailNotVerified(true);
          setError("");
        } else {
          setEmailNotVerified(false);
          setError(err.message || "Anmeldung fehlgeschlagen.");
        }
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div style={{ padding: "24px" }}>
      <div className={cardClassName}>
        <h2 className="mb-2 text-[22px] font-extrabold text-[#0F172A] dark:text-[#f1f5f9]">
          Admin Anmeldung
        </h2>
        <p className="mb-6 text-[14px] text-[#64748B] dark:text-slate-400">
          E-Mail und Passwort eingeben. Zugang für Admin, Manager und Plattform-Admin.
        </p>
        <form data-testid="admin-login-form" onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label className={labelClassName}>E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailNotVerified(false);
              }}
              required
              autoComplete="email"
              placeholder="admin@example.com"
              className={inputClassName}
            />
          </div>
          <div>
            <label className={labelClassName}>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={inputClassName}
            />
          </div>
          {error && (
            <p className="m-0 text-[14px] text-[#B91C1C] dark:text-red-400">
              {error}
            </p>
          )}
          <LoginEmailVerificationBlock email={email} visible={emailNotVerified} />
          <button
            type="submit"
            disabled={submitting}
            className="cursor-pointer rounded-[10px] border-none bg-[#0F172A] px-5 py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Wird angemeldet…" : "Anmelden"}
          </button>

          <div style={{ marginTop: "6px" }}>
            <Link
              to="/forgot-password"
              className="inline-block text-[13px] font-bold text-[#2563EB] no-underline dark:text-blue-400"
            >
              Passwort vergessen?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminLoginPage;
