import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { PasswordVisibilityButton } from "../../components/ui/PasswordVisibilityButton";
import { TextField } from "../../components/ui/TextField";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { validateAdminEmail, validateLoginPassword } from "../../lib/validation";

interface FieldErrors {
  email?: string | null;
  password?: string | null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const state = location.state as { reset?: boolean; signedUp?: boolean; verified?: boolean } | null;
  const justReset = state?.reset;
  const justSignedUp = state?.signedUp;
  const justVerified = state?.verified;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errors: FieldErrors = {
      email: validateAdminEmail(email),
      password: validateLoginPassword(password),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/admin");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect email or password.");
      } else if (err instanceof ApiError && err.status === 403 && err.code === "email_not_verified") {
        navigate("/admin/signup", { state: { verifyEmail: email.trim() } });
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Divine Vision Infra Admin"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/admin/signup" className="font-semibold text-gold-dark hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        {justReset && (
          <div className="rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
            Password reset successful. Please sign in with your new password.
          </div>
        )}
        {justSignedUp && (
          <div className="rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
            Account created. Please sign in with your new credentials.
          </div>
        )}
        {justVerified && (
          <div className="rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
            Email verified. Please sign in with your credentials.
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <TextField
          label="Email address"
          type="email"
          placeholder="admin@divinevisioninfra.com"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
          }}
          error={fieldErrors.email}
          required
        />
        <div>
          <TextField
            label="Password"
            type={passwordVisible ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: null }));
            }}
            error={fieldErrors.password}
            trailingAction={
              <PasswordVisibilityButton
                visible={passwordVisible}
                onToggle={() => setPasswordVisible((visible) => !visible)}
              />
            }
            required
          />
          <div className="mt-2 text-right">
            <Link to="/admin/forgot-password" className="text-xs font-semibold text-gold-dark hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
