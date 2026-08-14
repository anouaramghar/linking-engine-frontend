import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

/**
 * `useState` for the things a page should still be holding when you come back
 * to it.
 *
 * A route change unmounts the page, so every `useState` inside it dies with the
 * component. For a spinner that is correct. For the seven fields an operator
 * typed into the traceability filter, the sites they ticked before stepping out
 * to check a policy, or a publication preparation that cost one live request per
 * source article, it is the dashboard throwing away work it was trusted with.
 *
 * The store lives above `<Routes>`, so it outlives the pages that read it. It is
 * held in memory rather than in `sessionStorage` on purpose:
 *
 *   - The values are `Map`s and `Set`s, which do not survive JSON.
 *   - A reload is the one gesture everybody already means as "start clean". A
 *     store that survived it would hand back an hour-old draft, or a prepared
 *     batch naming plans the engine has since moved on, with nothing on screen
 *     to say how old either one was.
 *   - Signing out reloads the tab (see `useLogout`), so one operator's selection
 *     cannot be waiting for the next one. Nothing here has to be cleaned up by
 *     hand for that to hold.
 *
 * What belongs here is what the operator built: drafts, filters, selections,
 * expanded and collapsed things, work that was paid for. What does not is
 * anything the page should re-derive on arrival — notices, in-flight mutation
 * flags, open modals. Restoring a toast means showing a stale one; restoring an
 * open dialog means the page reopens a question the operator already walked away
 * from.
 */
type PageStateStore = Map<string, unknown>;

const PageStateContext = createContext<PageStateStore | null>(null);

export function PageStateProvider({ children }: { children: ReactNode }) {
  // `useState` rather than a ref, for the lazy initialiser: one Map for the life
  // of the shell. Writes go straight into it and deliberately do not re-render —
  // the reader's own `useState` below is what paints the change, so a page
  // remembering something cannot cost every other subscriber a render.
  const [store] = useState<PageStateStore>(() => new Map());

  return createElement(PageStateContext.Provider, { value: store }, children);
}

const initialise = <T,>(initial: T | (() => T)) =>
  typeof initial === "function" ? (initial as () => T)() : initial;

/**
 * Identical to `useState`, including the lazy initialiser and functional
 * updates, except that the value is restored when the page is mounted again
 * under the same key.
 *
 * Keys are namespaced by page — `"sites.search"`, not `"search"` — because the
 * store is one flat map shared by the whole shell.
 *
 * Without a `PageStateProvider` above it this is exactly `useState`. That is
 * what lets a page test mount a page on its own and get clean state per test,
 * rather than every suite in the file inheriting the last one's selection.
 */
export function usePageState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(PageStateContext);
  const read = () => (store?.has(key) ? (store.get(key) as T) : initialise(initial));

  const [value, setValue] = useState<T>(read);
  const [seenKey, setSeenKey] = useState(key);

  // Adjusted during render rather than in an effect, the same way
  // `useIncrementalList` handles its reset key: the new key's value is what this
  // render should already be showing, so there is no correct intermediate state
  // to paint while an effect waits to correct it.
  if (seenKey !== key) {
    setSeenKey(key);
    setValue(read);
  }

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      // The write happens inside the updater so it sees the committed value,
      // which is the only way a functional update can be stored correctly.
      setValue((current) => {
        const next =
          typeof action === "function" ? (action as (previous: T) => T)(current) : action;
        store?.set(key, next);
        return next;
      });
    },
    [key, store],
  );

  return [value, set];
}
