import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";

export function LoginPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Static UI only — wires up to AUTH-02 once backend is available.
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      navigate("/admin");
    }, 400);
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
      <form className="space-y-5" onSubmit={handleSubmit}>
        <TextField
          label="Email address"
          type="email"
          placeholder="admin@divinevisioninfra.com"
          autoComplete="email"
          defaultValue="admin@divinevisioninfra.com"
          required
        />
        <div>
          <TextField
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            defaultValue="••••••••"
            required
          />
          <div className="mt-2 text-right">
            <Link to="/admin/forgot-password" className="text-xs font-semibold text-gold-dark hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" className="h-4 w-4 rounded border-border text-gold accent-[#b8894f]" />
          Keep me signed in on this device
        </label>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
