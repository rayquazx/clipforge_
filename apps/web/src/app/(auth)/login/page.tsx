import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Sign In
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Enter your credentials to manage your clips and streams
        </p>
      </div>

      <LoginForm />

      <div className="text-center pt-2">
        <p className="text-xs text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-primary hover:text-primary-hover font-medium underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
