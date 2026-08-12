import { useCallback, useState } from "react";

/**
 * Whether the queue's detail panel is open beside the list.
 *
 * The same workspace decision the rail already stores, at the other edge of the
 * screen: an operator scanning a wide queue wants those 410px back, and should
 * not have to take them back on every reload. One key, one read, and a `catch`
 * because storage throws outright under a restrictive privacy setting.
 *
 * Collapsing is not the same as closing. Closing puts the panel back to its
 * "Select a suggestion" rest state; collapsing takes the column away entirely,
 * and opening a suggestion is what brings it back.
 */
const STORAGE_KEY = "linkmesh.detail-panel";

export type DetailPanelState = "expanded" | "collapsed";

const store = (state: DetailPanelState) => {
  try {
    window.localStorage?.setItem(STORAGE_KEY, state);
  } catch {
    // The choice still holds for this session.
  }
};

export const readStoredDetailPanel = (): DetailPanelState => {
  try {
    return window.localStorage?.getItem(STORAGE_KEY) === "collapsed" ? "collapsed" : "expanded";
  } catch {
    return "expanded";
  }
};

export const useDetailPanel = () => {
  const [state, setState] = useState<DetailPanelState>(readStoredDetailPanel);

  const collapse = useCallback(() => {
    setState("collapsed");
    store("collapsed");
  }, []);

  /** Opening a suggestion is a request to read it, so it reopens the column. */
  const expand = useCallback(() => {
    setState((current) => {
      if (current === "expanded") return current;
      store("expanded");
      return "expanded";
    });
  }, []);

  return { collapsed: state === "collapsed", collapse, expand };
};
