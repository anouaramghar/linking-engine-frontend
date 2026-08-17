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

interface ScrollState {
  key: string | null;
  top: number;
}

interface QueueWorkspaceValue {
  collapsedSources: Set<string>;
  setCollapsedSources: React.Dispatch<React.SetStateAction<Set<string>>>;
  groupLimits: Record<string, number>;
  setGroupLimits: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  loadedGroupKey: string | null;
  loadedGroupCount: number;
  rememberLoadedGroups: (key: string, count: number) => void;
  scrollKey: string | null;
  scrollTop: number;
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
  const [scroll, setScroll] = useState<ScrollState>({ key: null, top: 0 });

  const rememberLoadedGroups = useCallback((key: string, count: number) => {
    setLoadedGroups((current) =>
      current.key === key && current.count === count ? current : { key, count },
    );
  }, []);
  const rememberScrollTop = useCallback((key: string, next: number) => {
    if (!Number.isFinite(next)) return;
    setScroll((current) =>
      current.key === key && current.top === next ? current : { key, top: next },
    );
  }, []);

  const value = useMemo(
    () => ({
      collapsedSources,
      setCollapsedSources,
      groupLimits,
      setGroupLimits,
      loadedGroupKey: loadedGroups.key,
      loadedGroupCount: loadedGroups.count,
      rememberLoadedGroups,
      scrollKey: scroll.key,
      scrollTop: scroll.top,
      rememberScrollTop,
    }),
    [
      collapsedSources,
      groupLimits,
      loadedGroups,
      rememberLoadedGroups,
      rememberScrollTop,
      scroll,
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
