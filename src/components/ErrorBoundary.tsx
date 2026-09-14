import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

interface Props {
  children: ReactNode;
  /** Changing this value (e.g. the current route path) clears a caught error. */
  resetKey?: unknown;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="mx-auto mt-10 max-w-md p-8 text-center">
          <h2 className="mb-2 text-lg font-bold text-text">Something went wrong</h2>
          <p className="mb-5 text-sm text-text-muted">
            This screen hit an unexpected error. Reloading usually fixes it.
          </p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </Card>
      );
    }
    return this.props.children;
  }
}
