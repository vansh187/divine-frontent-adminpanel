import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { ApiError, forgotPassword, resetPassword } from "../../lib/api";
import {
  validateConfirmPassword,
  validateEmail,
  validateOtp,
  validatePassword,
} from "../../lib/validation";

const RESEND_COOLDOWN_SECONDS = 30;

interface OtpFieldErrors {
  otp?: string | null;
  newPassword?: string | null;
  confirmPassword?: string | null;
}

function resetErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "invalid_otp":
        return "That code is incorrect. Please try again.";
      case "otp_expired":
        return "That code has expired. Request a new one.";
      case "otp_not_requested":
        return "Please request a new code first.";
      case "too_many_attempts":
        return "Too many incorrect attempts. Try again in 15 minutes.";
      case "too_many_requests":
        return "Please wait a moment before requesting another code.";
    }
  }
  return "Something went wrong. Please try again.";
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpFieldErrors, setOtpFieldErrors] = useState<OtpFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  async function sendOtp() {
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setStep("otp");
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
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    setEmailError(emailErr);
    if (emailErr) return;
    void sendOtp();
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errors: OtpFieldErrors = {
      otp: validateOtp(otp),
      newPassword: validatePassword(newPassword),
      confirmPassword: validateConfirmPassword(newPassword, confirmPassword),
    };
    setOtpFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({ email: email.trim(), otp: otp.trim(), new_password: newPassword });
      navigate("/admin/login", { state: { reset: true } });
    } catch (err) {
      setError(resetErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot password"
      subtitle={
        step === "email"
          ? "Enter your admin email and we'll send you a one-time code"
          : `Enter the 6-digit code sent to ${email}`
      }
      footer={
        <Link to="/admin/login" className="font-semibold text-gold-dark hover:underline">
          Back to sign in
        </Link>
      }
    >
      {error && (
        <div className="mb-5 rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {step === "email" ? (
        <form className="space-y-5" onSubmit={handleEmailSubmit} noValidate>
          <TextField
            label="Email address"
            type="email"
            placeholder="admin@divinevisioninfra.com"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            error={emailError}
            required
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Sending..." : "Send OTP"}
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={handleOtpSubmit} noValidate>
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
          <TextField
            label="New password"
            type="password"
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (otpFieldErrors.newPassword) setOtpFieldErrors((prev) => ({ ...prev, newPassword: null }));
            }}
            error={otpFieldErrors.newPassword}
            required
          />
          <TextField
            label="Confirm new password"
            type="password"
            placeholder="Re-enter new password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (otpFieldErrors.confirmPassword)
                setOtpFieldErrors((prev) => ({ ...prev, confirmPassword: null }));
            }}
            error={otpFieldErrors.confirmPassword}
            required
          />

          <p className="text-xs text-text-soft">
            Didn&apos;t get the code?{" "}
            <button
              type="button"
              onClick={() => void sendOtp()}
              disabled={cooldown > 0 || submitting}
              className="font-semibold text-gold-dark hover:underline disabled:cursor-not-allowed disabled:text-text-soft disabled:no-underline"
            >
              {cooldown > 0 ? `Resend OTP (${cooldown}s)` : "Resend OTP"}
            </button>
          </p>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Resetting..." : "Reset password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
