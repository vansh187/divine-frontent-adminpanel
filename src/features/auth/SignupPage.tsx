import { Link } from "react-router-dom";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";

export function SignupPage() {
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
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <TextField label="Full name" placeholder="Arjun Mehta" autoComplete="name" required />
        <TextField label="Employee ID" placeholder="DVI-1024" autoComplete="off" required />
        <TextField
          label="Work email"
          type="email"
          placeholder="you@divinevisioninfra.com"
          autoComplete="email"
          required
        />
        <TextField
          label="Password"
          type="password"
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
          required
        />

        <p className="text-xs text-text-soft">
          By creating an account you agree that your access is provisioned and approved by an
          existing SUPER_ADMIN before sign-in is enabled.
        </p>

        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
