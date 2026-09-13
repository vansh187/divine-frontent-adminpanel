const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_ID_RE = /^DV[A-Z0-9]+$/;
const OTP_RE = /^\d{6}$/;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Email is required.";
  if (!EMAIL_RE.test(trimmed)) return "Enter a valid email address.";
  return null;
}

export function validateFullName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Full name is required.";
  if (trimmed.length < 2) return "Full name must be at least 2 characters.";
  return null;
}

export function validateEmployeeId(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return "Employee ID is required.";
  if (!EMPLOYEE_ID_RE.test(trimmed)) return "Employee ID must start with \"DV\" (e.g. DV1024).";
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  return null;
}

export function validateLoginPassword(value: string): string | null {
  if (!value) return "Password is required.";
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return "Please confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export function validateOtp(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "One-time password is required.";
  if (!OTP_RE.test(trimmed)) return "Enter the 6-digit code.";
  return null;
}
