import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { PasswordVisibilityButton } from "../../components/ui/PasswordVisibilityButton";
import { TextField } from "../../components/ui/TextField";
import { ApiError, resendSignupOtp, signup, verifySignup } from "../../lib/api";
import {
  validateAdminEmail,
  validateEmployeeId,
  validateFullName,
  validateOtp,
  validatePassword,
} from "../../lib/validation";

const RESEND_COOLDOWN_SECONDS = 30;

interface FieldErrors {
  fullName?: string | null;
  employeeId?: string | null;
  email?: string | null;
  password?: string | null;
}

interface OtpFieldErrors {
  otp?: string | null;
}

function signupErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return "An admin with that email or employee ID already exists.";
    if (err.status === 422) return "Please check the signup details and try again.";
  }
  return "Something went wrong. Please try again.";
}

function verifyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "invalid_otp":
        return "That code is incorrect. Please try again.";
      case "otp_expired":
        return "That code has expired. Request a new one.";
      case "otp_not_requested":
        return "Please request a new code first.";
      case "not_found":
        return "No pending signup was found for this email.";
      case "too_many_attempts":
        return "Too many incorrect attempts. Try again later.";
    }
  }
  return "Something went wrong. Please try again.";
}

function resendErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "already_verified":
        return "This account is already verified. Please sign in.";
      case "not_found":
        return "No pending signup was found for this email.";
      case "too_many_requests":
        return "Please wait a moment before requesting another code.";
    }
  }
  return "Something went wrong. Please try again.";
}

export function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { verifyEmail?: string } | null;
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState(state?.verifyEmail ?? "");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [step, setStep] = useState<"signup" | "otp">(state?.verifyEmail ? "otp" : "signup");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    state?.verifyEmail ? "Please verify your email before signing in." : null
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [otpFieldErrors, setOtpFieldErrors] = useState<OtpFieldErrors>({});
  const [cooldown, setCooldown] = useState(0);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function validate(): FieldErrors {
    return {
      fullName: validateFullName(fullName),
      employeeId: validateEmployeeId(employeeId),
      email: validateAdminEmail(email),
      password: validatePassword(password),
    };
  }

  async function handleSignupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

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
      setStep("otp");
      setOtp("");
      setSuccessMessage("Account created. Enter the OTP sent to your email to verify it.");
      startCooldown();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setFieldErrors((prev) => ({
          ...prev,
          employeeId: "Employee ID must start with \"DV\" (e.g. DV1024).",
        }));
      } else {
        setFormError(signupErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const errors: OtpFieldErrors = { otp: validateOtp(otp) };
    setOtpFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await verifySignup({ email: email.trim(), otp: otp.trim() });
      navigate("/admin/login", { state: { verified: true } });
    } catch (err) {
      setFormError(verifyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendOtp() {
    setFormError(null);
    setSuccessMessage(null);

    const emailError = validateAdminEmail(email);
    if (emailError) {
      setFieldErrors((prev) => ({ ...prev, email: emailError }));
      setStep("signup");
      return;
    }

    setSubmitting(true);
    try {
      await resendSignupOtp(email.trim());
      setSuccessMessage("A new OTP has been sent to your email.");
      startCooldown();
    } catch (err) {
      setFormError(resendErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={step === "signup" ? "Divine Vision Infra Admin" : "Verify your email"}
      subtitle={step === "otp" ? `Enter the 6-digit code sent to ${email}` : undefined}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/admin/login" className="font-semibold text-gold-dark hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {step === "signup" ? (
        <form className="space-y-5" onSubmit={handleSignupSubmit} noValidate>
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
            placeholder="you@divinevisioninfra.com"
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
            type={passwordVisible ? "text" : "password"}
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
            minLength={8}
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

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={handleVerifySubmit} noValidate>
          {successMessage && (
            <div className="rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">
              {successMessage}
            </div>
          )}
          {formError && (
            <div className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
              {formError}
            </div>
          )}

          <TextField
            label="One-time password"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
              if (otpFieldErrors.otp) setOtpFieldErrors((prev) => ({ ...prev, otp: null }));
            }}
            error={otpFieldErrors.otp}
            required
          />

          <p className="text-xs text-text-soft">
            Didn&apos;t get the code?{" "}
            <button
              type="button"
              onClick={() => void handleResendOtp()}
              disabled={cooldown > 0 || submitting}
              className="font-semibold text-gold-dark hover:underline disabled:cursor-not-allowed disabled:text-text-soft disabled:no-underline"
            >
              {cooldown > 0 ? `Resend OTP (${cooldown}s)` : "Resend OTP"}
            </button>
          </p>

          <div className="space-y-3">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Verifying..." : "Verify email"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={submitting}
              onClick={() => {
                setStep("signup");
                setFormError(null);
                setSuccessMessage(null);
              }}
            >
              Back to signup
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
