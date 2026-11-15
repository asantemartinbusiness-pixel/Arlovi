import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Notice } from "@/design-system";

/**
 * Contains a screen that throws while rendering. The shell, navigation and
 * every other application keep working; the failed screen says what happened
 * and offers a retry. Reset whenever the address changes (via `resetKey`).
 */
export class ScreenErrorBoundary extends Component<{ children: ReactNode; resetKey: string; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Arlovi: ${this.props.label} failed to render.`, error, info.componentStack);
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pg">
        <div className="pg-head"><h1>This screen could not be shown</h1></div>
        <div className="pg-body">
          <Notice
            tone="danger"
            title={`${this.props.label} stopped while rendering`}
            actions={<Button size="sm" variant="secondary" onClick={() => this.setState({ error: null })}>Try again</Button>}
          >
            {this.state.error.message || "An unexpected error occurred."} The rest of the workspace is unaffected, and no record was changed by this failure.
          </Notice>
        </div>
      </div>
    );
  }
}
