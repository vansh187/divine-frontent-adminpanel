import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Static UI only — wires up to AUTH-02 once backend is available.
    setStep("otp");
  }

  function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate("/admin/reset-password");
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
      {step === "email" ? (
        <form className="space-y-5" onSubmit={handleEmailSubmit}>
          <TextField
            label="Email address"
            type="email"
            placeholder="admin@divinevisioninfra.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" className="w-full">
            Send OTP
          </Button>
        </form>
      ) : (
        <form className="space-y-5" onSubmit={handleOtpSubmit}>
          <TextField
            label="One-time password"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
          />
          <p className="text-xs text-text-soft">
            Didn&apos;t get the code?{" "}
            <button
              type="button"
              onClick={() => setStep("email")}
              className="font-semibold text-gold-dark hover:underline"
            >
              Resend OTP
            </button>
          </p>
          <Button type="submit" className="w-full">
            Verify OTP
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
