import { Component, type ErrorInfo, type ReactNode } from "react";

import { captureError } from "@/lib/sentry";

import { ErrorBoundaryFallback } from "@/components/error-boundary-fallback";
import type { ThemeColor } from "@/constants/theme";

interface AppErrorBoundaryProps {
  children: ReactNode;
  palette: Record<ThemeColor, string>;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    captureError(error, {
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          resetError={this.handleReset}
          palette={this.props.palette}
        />
      );
    }

    return this.props.children;
  }
}
