"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SourceInput } from "@/components/projects/SourceInput";
import { Button } from "@/components/ui/Button";

export default function NewProjectPage() {
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 text-text-secondary hover:text-text-primary">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight text-text-primary">
          Create New Clip Project
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Import a stream recording from Twitch, YouTube, or Kick, or upload your own video file.
        </p>
      </div>

      <SourceInput onProjectCreated={() => router.push("/dashboard")} />
    </div>
  );
}
