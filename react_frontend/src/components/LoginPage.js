import React, { useState } from "react";

// PUBLIC_INTERFACE
/**
 * LoginPage - initial username entry for Doodle Finder game.
 * Props:
 *   onLogin(username: string): Promise - called after passing validation; resolves if join is successful.
 *   accentColor: color string for accent.
 *   primaryColor: color string for branding.
 */
function LoginPage({ onLogin, accentColor, primaryColor }) {
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // PUBLIC_INTERFACE
  async function handleSubmit(e) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onLogin(name.trim());
    } catch (err) {
      setError(
        err && err.message
          ? err.message
          : "Failed to join game. Try another username."
      );
      setLoading(false);
    }
  }

  return (
    <div
      className="app-center"
      style={{ height: "100vh", justifyContent: "center" }}
    >
      <div
        className="card"
        style={{
          padding: 36,
          margin: "0 auto",
          borderRadius: 20,
          background: "#fcfdfd",
        }}
      >
        <h2 className="title" style={{ color: primaryColor, letterSpacing: 2 }}>
          Welcome to <span style={{ color: accentColor }}>Doodle Finder!</span>
        </h2>
        <div style={{ fontSize: 18, marginBottom: 36 }}>
          Enter a unique username to join the live game:
        </div>
        <form onSubmit={handleSubmit} autoComplete="off">
          <input
            className="modern-input"
            style={{
              fontSize: 22,
              padding: 10,
              borderRadius: 8,
              borderColor: primaryColor,
            }}
            placeholder="Username (no email, just a fun name!)"
            maxLength={15}
            autoFocus
            value={name}
            required
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // allow Enter to submit if enabled, block otherwise
                if (name.trim().length < 2) e.preventDefault();
              }
            }}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading}
          />
          <br />
          <button
            className="btn"
            style={{
              background: primaryColor,
              color: "#fff",
              padding: "12px 36px",
              fontSize: 22,
              marginTop: 16,
              borderRadius: 8,
              letterSpacing: 1,
              cursor: name.length >= 2 && !loading ? "pointer" : "not-allowed",
              opacity: name.length >= 2 && !loading ? 1 : 0.66,
            }}
            type="submit"
            disabled={name.length < 2 || loading}
            tabIndex={0}
          >
            {loading ? "Joining..." : "Enter Game"}
          </button>
          {error && (
            <div
              style={{
                color: "#d22",
                fontWeight: 500,
                marginTop: 16,
                fontSize: 15,
              }}
              aria-live="polite"
              role="alert"
            >
              {error}
            </div>
          )}
        </form>
      </div>
      <div style={{ marginTop: 44, opacity: 0.8 }}>
        <small>
          No signup required. Usernames must be unique during each session.
        </small>
      </div>
    </div>
  );
}

export default LoginPage;
