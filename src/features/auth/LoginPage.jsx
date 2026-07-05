import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider.jsx";
import { BrandLogo } from "../../components/common/BrandLogo.jsx";
import { useTheme } from "../../app/providers/ThemeProvider.jsx";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div className="login-page min-vh-100 d-flex align-items-center justify-content-center p-3">
      <button
        type="button"
        className="btn btn-icon btn-outline-secondary login-page__theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
      >
        <span className="material-icons">{theme === "light" ? "dark_mode" : "light_mode"}</span>
      </button>

      <div className="login-page__card admin-card p-4 p-md-5 w-100">
        <div className="text-center mb-4">
          <BrandLogo size={72} className="justify-content-center mb-3" />
          <h1 className="h4 mb-2">Welcome back</h1>
          <p className="text-muted mb-0 small">
            Sign in to manage users, bookings, payments, and platform content.
          </p>
        </div>

        <form onSubmit={onSubmit} className="d-grid gap-3">
          <div>
            <label htmlFor="admin-email" className="form-label small fw-semibold">
              Email address
            </label>
            <input
              id="admin-email"
              className="form-control"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="form-label small fw-semibold">
              Password
            </label>
            <div className="input-group">
              <input
                id="admin-password"
                className="form-control"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <span className="material-icons" style={{ fontSize: 20 }}>
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </div>

          {error ? (
            <div className="alert alert-danger py-2 mb-0 d-flex align-items-center gap-2" role="alert">
              <span className="material-icons" style={{ fontSize: 20 }}>error_outline</span>
              <span>{error}</span>
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary btn-lg mt-1">
            Sign in to Admin
          </button>
        </form>

        <p className="text-center text-muted small mt-4 mb-0">
          Authorized personnel only. All actions are logged.
        </p>
      </div>
    </div>
  );
}
