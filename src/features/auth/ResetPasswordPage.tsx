import { Link } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";

export function ResetPasswordPage() {
  return (
    <AuthLayout
      title="Reset password"
      subtitle="Choose a new password for your admin account"
      footer={
        <Link to="/admin/login" className="font-semibold text-gold-dark hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <TextField
          label="New password"
          type="password"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          required
        />
        <TextField
          label="Confirm new password"
          type="password"
          placeholder="Re-enter new password"
          autoComplete="new-password"
          required
        />
        <Button type="submit" className="w-full">
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
