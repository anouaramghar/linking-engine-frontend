import { lazy, Suspense, useEffect, useState } from "react";

import type { AgentPanelProps } from "./AgentPanel";
import AgentLauncher from "./AgentLauncher";

const AgentPanel = lazy(() => import("./AgentPanel"));

const hasMcpAction = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.has("mcp-action");
};

type AgentPanelHostProps = Omit<AgentPanelProps, "initialOpen">;

/**
 * Keep the assistant's panel and avatar runtime off the shell's critical path,
 * then pull them in once the first paint is done so the launcher settles into
 * the live avatar on its own. An operator who clicks before that lands — or
 * arrives on a signed MCP link — gets the panel opened straight away.
 */
export default function AgentPanelHost(props: AgentPanelHostProps) {
  const [panelLoaded, setPanelLoaded] = useState(hasMcpAction);
  const [openOnLoad, setOpenOnLoad] = useState(hasMcpAction);

  // Fetch the panel chunk once the shell has painted, then swap the launcher
  // for the real one so the avatar arrives without a flash of empty Suspense.
  useEffect(() => {
    let cancelled = false;
    void import("./AgentPanel").then(() => {
      if (!cancelled) setPanelLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openPanel = () => {
    setOpenOnLoad(true);
    setPanelLoaded(true);
  };

  if (!panelLoaded) {
    return <AgentLauncher currentPath={props.currentPath} onOpen={openPanel} />;
  }

  return (
    <Suspense fallback={<AgentLauncher currentPath={props.currentPath} onOpen={openPanel} />}>
      <AgentPanel {...props} initialOpen={openOnLoad} />
    </Suspense>
  );
}
