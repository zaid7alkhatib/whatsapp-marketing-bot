import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { canAccessPath, getDefaultPathForRole } from "../auth/access";
import { useAuth } from "../auth/AuthContext";
import InlineAlert from "../components/InlineAlert";
import LanguageToggle from "../components/LanguageToggle";
import { useClientLocale } from "../i18n/ClientLocaleContext";

interface LoginLocationState {
  from?: string;
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { t } = useClientLocale();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password) {
      setErrorMessage(t("login.required"));
      return;
    }

    setIsSubmitting(true);

    try {
      const loggedInUser = await login(username.trim(), password);
      const state = location.state as LoginLocationState | null;
      const requestedDestination = typeof state?.from === "string" ? state.from : "";
      const destination =
        requestedDestination && canAccessPath(loggedInUser.role, requestedDestination)
          ? requestedDestination
          : getDefaultPathForRole(loggedInUser.role);
      navigate(destination, { replace: true });
    } catch (error) {
      const nextMessage =
        error instanceof Error && error.message ? error.message : t("login.failed");
      setErrorMessage(
        nextMessage.startsWith("Cannot reach backend API")
          ? t("api.backendUnavailable")
          : nextMessage
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-tools">
          <LanguageToggle />
        </div>
        <div className="auth-card-copy">
          <p className="auth-kicker">{t("login.kicker")}</p>
          <h1 className="auth-title">{t("login.title")}</h1>
          <p className="auth-description">
            {t("login.description")}
          </p>
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field form-field-full">
              <span>{t("login.username")}</span>
              <input
                className="input-control"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder={t("login.usernamePlaceholder")}
              />
            </label>

            <label className="form-field form-field-full">
              <span>{t("login.password")}</span>
              <input
                className="input-control"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder={t("login.passwordPlaceholder")}
              />
            </label>
          </div>

          {errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

          <div className="form-actions auth-form-actions">
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? t("login.submitting") : t("login.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
