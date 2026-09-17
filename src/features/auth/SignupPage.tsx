import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { ApiError, signup } from "../../lib/api";
import {
  validateAdminSignupEmail,
  validateEmployeeId,
  validateFullName,
  validatePassword,
} from "../../lib/validation";

interface FieldErrors {
  fullName?: string | null;
  employeeId?: string | null;
  email?: string | null;
  password?: string | null;
}

export function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function validate(): FieldErrors {
    return {
      fullName: validateFullName(fullName),
      employeeId: validateEmployeeId(employeeId),
      email: validateAdminSignupEmail(email),
      password: validatePassword(password),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await signup({
        full_name: fullName.trim(),
        employee_id: employeeId.trim().toUpperCase(),
        email: email.trim(),
        password,
      });
      navigate("/admin/login", { state: { signedUp: true } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setFieldErrors((prev) => ({
          ...prev,
          employeeId: "Employee ID must start with \"DV\" (e.g. DV1024).",
        }));
      } else if (err instanceof ApiError && err.status === 400) {
        setFormError("An admin with that email or employee ID already exists.");
      } else {
        setFormError("Something went wrong. Please try again.");
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
          Already have an account?{" "}
          <Link to="/admin/login" className="font-semibold text-gold-dark hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
            {formError}
          </div>
        )}

        <TextField
          label="Full name"
          placeholder="Arjun Mehta"
          autoComplete="name"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: null }));
          }}
          error={fieldErrors.fullName}
          required
        />
        <TextField
          label="Employee ID"
          placeholder="DV1024"
          autoComplete="off"
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value.toUpperCase());
            if (fieldErrors.employeeId) setFieldErrors((prev) => ({ ...prev, employeeId: null }));
          }}
          error={fieldErrors.employeeId}
          required
        />
        <TextField
          label="Work email"
          type="email"
          placeholder="you@divineinfravision.com"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
          }}
          error={fieldErrors.email}
          required
        />
        <TextField
          label="Password"
          type="password"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: null }));
          }}
          error={fieldErrors.password}
          required
        />

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
