import { lazy, Suspense, type ReactNode } from "react";

import { useSession } from "../hooks/useSession";
import LogoLoadingAnimation from "./LogoLoadingAnimation";
import { ErrorPanel } from "./QueryState";

const LoginPage = lazy(() => import("../pages/LoginPage"));

/**
 * The dashboard's front door in the browser.
 *
 * It is not the security boundary — nginx is, via `auth_request`, and a direct
 * `/api/` call without a session gets 401 whatever this component renders. This
 * exists so the app shows a login screen instead of a shell full of failures.
 */
export default function RequireSession({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError, isFetching, refetch } = useSession();

  // Rendering the login screen before the session answers would flash it at
  // every already-signed-in operator on every reload.
  if (isPending) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <LogoLoadingAnimation size="lg" label="Checking your session" className="text-ink" />
      </div>
    );
  }

  if (isError) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl items-center px-4">
        <ErrorPanel
          title="The dashboard could not verify your session"
          description="The engine may be unavailable. Your account has not been treated as signed out."
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </main>
    );
  }

  return user ? (
    <>{children}</>
  ) : (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center">
          <LogoLoadingAnimation size="lg" label="Loading the sign-in screen" className="text-ink" />
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
