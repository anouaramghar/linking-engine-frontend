import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorPanel } from "./QueryState";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Keeps a failed lazy route from taking the whole dashboard shell with it. */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("dashboard route failed to render", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPanel
          title="This dashboard page could not load"
          description="The page failed while loading. Reload the dashboard and try again."
          onRetry={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
