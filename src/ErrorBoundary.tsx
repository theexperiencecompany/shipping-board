import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[13px] font-medium text-ink">The board stopped rendering.</p>
        <p className="max-w-[520px] text-[11.5px] text-ink-3">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-1 h-7 rounded-[7px] bg-card-hi px-3 text-[11.5px] text-ink"
        >
          Reload
        </button>
      </div>
    );
  }
}
