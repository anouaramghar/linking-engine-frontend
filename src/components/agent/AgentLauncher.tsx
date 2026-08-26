interface AgentLauncherProps {
  currentPath?: string;
  onOpen: () => void;
}

const LAUNCHER_CLEARANCE_ROUTES = ["/queue", "/selected", "/sites", "/publish"];

/**
 * The small, eager part of the assistant. Keep this launcher free of the
 * avatar renderer so the full assistant bundle can wait for an explicit open.
 */
export default function AgentLauncher({ currentPath, onOpen }: AgentLauncherProps) {
  const path = currentPath ?? (typeof window === "undefined" ? "/" : window.location.pathname);
  const launcherNeedsClearance = LAUNCHER_CLEARANCE_ROUTES.some(
    (route) => path === route || (route === "/publish" && path.startsWith("/publish/")),
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open Mesh"
      aria-haspopup="dialog"
      className={`assistant-launcher fixed z-40 flex h-14 w-14
        items-center justify-center rounded-full ${
          launcherNeedsClearance ? "assistant-launcher--raised" : ""
        }`}
    >
      <svg
        aria-hidden="true"
        width="30"
        height="30"
        viewBox="0 0 26 26"
        fill="none"
        className="block"
      >
        <circle cx="6" cy="20" r="4" fill="currentColor" />
        <circle cx="20" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.8 17.2 L17.2 8.8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}
