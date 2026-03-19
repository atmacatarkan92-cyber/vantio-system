import React, { useEffect, useMemo, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { API_BASE_URL } from "../config";

const cardStyle = {
  maxWidth: "420px",
  margin: "0 auto",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "18px",
  padding: "32px",
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "8px",
  border: "1px solid #E5E7EB",
  fontSize: "14px",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  marginBottom: "6px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
};

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const genericSuccess = useMemo(
    () => "Wenn ein Konto existiert, wurde ein Link zum Zurücksetzen des Passworts gesendet.",
    []
  );

  useEffect(() => {
    setError("");
    setSuccess("");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setError("");
    setSuccess("");

    const emailTrim = email.trim();
    if (!emailTrim || !isValidEmail(emailTrim)) {
      setError("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailTrim }),
      });

      if (!res.ok) {
        setError("Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.");
        return;
      }

      // Always show generic message (no account enumeration).
      setSuccess(genericSuccess);
    } catch {
      setError("Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && !success;

  return (
    <div style={{ padding: "24px" }}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 8px 0", color: "#0F172A" }}>
          Passwort zurücksetzen
        </h2>
        <p style={{ color: "#64748B", margin: "0 0 24px 0", fontSize: "14px" }}>
          Geben Sie Ihre E-Mail-Adresse ein. Wenn ein Konto existiert, senden wir Ihnen einen Link
          zum Zurücksetzen des Passworts.
        </p>

        {error && <p style={{ color: "#B91C1C", margin: 0, fontSize: "14px" }}>{error}</p>}
        {success && (
          <div style={{ marginBottom: "14px" }}>
            <p style={{ color: "#166534", margin: 0, fontSize: "14px", fontWeight: 700 }}>
              {success}
            </p>
            <p style={{ color: "#64748B", marginTop: "10px", fontSize: "13px" }}>
              <Link
                to="/admin/login"
                style={{ color: "#2563EB", textDecoration: "none", fontWeight: 700 }}
              >
                Gehe zu Login
              </Link>
            </p>
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
            <div>
              <label style={labelStyle}>E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="name@example.com"
                style={inputStyle}
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: "12px 20px",
                background: "#0F172A",
                color: "#FFF",
                border: "none",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "14px",
                cursor: !canSubmit ? "not-allowed" : "pointer",
                opacity: !canSubmit ? 0.7 : 1,
              }}
            >
              {submitting ? "Wird gesendet…" : "Reset-Link senden"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

