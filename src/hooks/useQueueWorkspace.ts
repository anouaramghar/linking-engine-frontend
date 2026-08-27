import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface LoadedGroupState {
  key: string | null;
  count: number;
}

interface QueueWorkspaceValue {
  collapsedSources: Set<string>;
  setCollapsedSources: React.Dispatch<React.SetStateAction<Set<string>>>;
  groupLimits: Record<string, number>;
  setGroupLimits: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  loadedGroupKey: string | null;
  loadedGroupCount: number;
  rememberLoadedGroups: (key: string, count: number) => void;
  scrollTopFor: (key: string) => number;
  rememberScrollTop: (key: string, scrollTop: number) => void;
}

const QueueWorkspaceContext = createContext<QueueWorkspaceValue | null>(null);

export function QueueWorkspaceProvider({ children }: { children: ReactNode }) {
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(
    () => new Set(),
  );
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});
  const [loadedGroups, setLoadedGroups] = useState<LoadedGroupState>({
    key: null,
    count: 0,
  });
  // Scroll is presentation state, not render state. Keeping it in a stable
  // mutable map lets the queue remember a position without turning every wheel
  // event into a provider update for the whole workspace.
  const [scrollTops] = useState(() => new Map<string, number>());

  const rememberLoadedGroups = useCallback((key: string, count: number) => {
    setLoadedGroups((current) =>
      current.key === key && current.count === count ? current : { key, count },
    );
  }, []);
  const scrollTopFor = useCallback((key: string) => scrollTops.get(key) ?? 0, [scrollTops]);
  const rememberScrollTop = useCallback((key: string, next: number) => {
    if (!Number.isFinite(next)) return;
    scrollTops.set(key, next);
  }, [scrollTops]);

  const value = useMemo(
    () => ({
      collapsedSources,
      setCollapsedSources,
      groupLimits,
      setGroupLimits,
      loadedGroupKey: loadedGroups.key,
      loadedGroupCount: loadedGroups.count,
      rememberLoadedGroups,
      scrollTopFor,
      rememberScrollTop,
    }),
    [
      collapsedSources,
      groupLimits,
      loadedGroups,
      rememberLoadedGroups,
      rememberScrollTop,
      scrollTopFor,
    ],
  );

  return createElement(QueueWorkspaceContext.Provider, { value }, children);
}

export function useQueueWorkspace() {
  const value = useContext(QueueWorkspaceContext);
  if (!value) {
    throw new Error("useQueueWorkspace must be used inside QueueWorkspaceProvider");
  }
  return value;
}
