import { Flame } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-xl shadow-primary/20">
            <Flame className="w-7 h-7 fill-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            ClipForge
          </h1>
          <p className="text-xs text-text-secondary">
            AI-powered highlights & viral stream clips
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl shadow-black/50">
          {children}
        </div>
      </div>
    </div>
  );
}
