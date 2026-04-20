import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import InlineAlert from "../components/InlineAlert";

interface LoginLocationState {
  from?: string;
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password) {
      setErrorMessage("Username and password are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      await login(username.trim(), password);
      const state = location.state as LoginLocationState | null;
      const destination = typeof state?.from === "string" ? state.from : "/dashboard";
      navigate(destination, { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message ? error.message : "Login failed."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-copy">
          <p className="auth-kicker">Conversational Bot Platform</p>
          <h1 className="auth-title">Dashboard Login</h1>
          <p className="auth-description">
            Admin keeps full access. Client login is limited to dashboard, the scoped clinic
            flow steps, the scoped WhatsApp pairing page, and the related service requests.
          </p>
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-full">
              <span>Username</span>
              <input
                className="input-control"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="Enter your dashboard username"
              />
            </label>

            <label className="form-field form-field-full">
              <span>Password</span>
              <input
                className="input-control"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </label>
          </div>

          {errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

          <div className="form-actions auth-form-actions">
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
