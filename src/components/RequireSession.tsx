import type { ReactNode } from "react";

import { useSession } from "../hooks/useSession";
import LogoLoadingAnimation from "./LogoLoadingAnimation";
import LoginPage from "../pages/LoginPage";

/**
 * The dashboard's front door in the browser.
 *
 * It is not the security boundary — nginx is, via `auth_request`, and a direct
 * `/api/` call without a session gets 401 whatever this component renders. This
 * exists so the app shows a login screen instead of a shell full of failures.
 */
export default function RequireSession({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useSession();

  // Rendering the login screen before the session answers would flash it at
  // every already-signed-in operator on every reload.
  if (isPending) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <LogoLoadingAnimation size="lg" label="Checking your session" className="text-ink" />
      </div>
    );
  }

  return user ? <>{children}</> : <LoginPage />;
}
