"use client";

import * as React from "react";

interface MswProviderProps {
  children: React.ReactNode;
}

let workerPromise: Promise<any> | null = null;

function startMsw() {
  if (typeof window === "undefined") return Promise.resolve();
  if (!workerPromise) {
    workerPromise = import("@/mocks/browser").then(async ({ worker }) => {
      try {
        await worker.start({
          serviceWorker: {
            url: "/mockServiceWorker.js",
          },
          onUnhandledRequest: "bypass",
        });
      } catch (err) {
        console.error("Failed to start Mock Service Worker:", err);
      }
      return worker;
    });
  }
  return workerPromise;
}

export function MswProvider({ children }: MswProviderProps) {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

    if (!useMocks) {
      setIsReady(true);
      return;
    }

    const promise = startMsw();
    if (promise) {
      promise
        .then(() => {
          setIsReady(true);
        })
        .catch((err) => {
          console.error("Failed to start Mock Service Worker:", err);
          setIsReady(true);
        });
    } else {
      setIsReady(true);
    }
  }, []);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-xs text-text-secondary font-medium">Initializing mock environment...</p>
      </div>
    );
  }

  return <>{children}</>;
}
