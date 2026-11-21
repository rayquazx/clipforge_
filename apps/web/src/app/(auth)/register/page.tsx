import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Create Account
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Start generating funny and emotional clips from your videos
        </p>
      </div>

      <RegisterForm />

      <div className="text-center pt-2">
        <p className="text-xs text-text-secondary">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary hover:text-primary-hover font-medium underline underline-offset-4"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
