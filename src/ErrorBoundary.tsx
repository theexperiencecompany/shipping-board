import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  // Nobody is at the wall to press Reload, so try again on our own.
  componentDidCatch() {
    setTimeout(() => location.reload(), 30_000);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[1.3rem] font-semibold text-ink">
          The board stopped rendering. Retrying in 30 seconds.
        </p>
        <p className="max-w-[36rem] text-[0.95rem] text-ink-3">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="mt-1 h-[2.2rem] rounded-[0.6rem] bg-card-hi px-4 text-[0.95rem] text-ink"
        >
          Reload
        </button>
      </div>
    );
  }
}
