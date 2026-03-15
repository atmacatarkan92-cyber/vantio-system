import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { login as apiLogin, getMe } from "../../api/auth";

const cardStyle = {
  maxWidth: "400px",
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

function TenantLoginPage() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    apiLogin(email, password)
      .then((data) => {
        const token = data.access_token;
        if (!token) {
          setError("Kein Token in der Antwort.");
          return;
        }
        login(token);
        return getMe();
      })
      .then((me) => {
        if (!me) {
          setError("Session konnte nicht geladen werden.");
          return;
        }
        if (me.role === "tenant") {
          navigate("/tenant", { replace: true });
        } else {
          setError("Nur für Mieter. Bitte nutzen Sie die Admin-Anmeldung für andere Rollen.");
          logout();
        }
      })
      .catch((err) => {
        setError(err.message || "Anmeldung fehlgeschlagen.");
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div style={{ padding: "24px" }}>
      <div style={cardStyle}>
        <h2 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 8px 0", color: "#0F172A" }}>
          Mieter-Portal
        </h2>
        <p style={{ color: "#64748B", margin: "0 0 24px 0", fontSize: "14px" }}>
          E-Mail und Passwort eingeben. Nur für Mieter mit Zugangsdaten.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label style={labelStyle}>E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="ihre@email.ch"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
          {error && (
            <p style={{ color: "#B91C1C", margin: 0, fontSize: "14px" }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "12px 20px",
              background: "#0F172A",
              color: "#FFF",
              border: "none",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "14px",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Wird angemeldet…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default TenantLoginPage;
