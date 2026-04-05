import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.handleTryAgain = this.handleTryAgain.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Centralized render-error logging (swap with Sentry later if desired).
    console.error("Render error caught by ErrorBoundary:", error, errorInfo);
  }

  handleTryAgain() {
    this.setState({ hasError: false });
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 520, width: "100%", border: "1px solid #E5E7EB", borderRadius: 16, background: "#FFFFFF", padding: 24, boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)", color: "#111827" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
            Etwas ist schief gelaufen
          </div>
          <div style={{ fontSize: 14, color: "#374151", marginBottom: 16, lineHeight: 1.5 }}>
            Die Seite ist auf ein unerwartetes Problem gestossen. Bitte versuchen Sie es erneut oder laden Sie die Seite neu.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={this.handleTryAgain}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#111827", fontWeight: 600, cursor: "pointer" }}
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #EA580C", background: "#EA580C", color: "#FFFFFF", fontWeight: 700, cursor: "pointer" }}
            >
              Seite neu laden
            </button>
          </div>
        </div>
      </div>
    );
  }
}

