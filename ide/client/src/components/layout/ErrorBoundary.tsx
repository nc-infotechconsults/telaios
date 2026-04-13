import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Copy, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for debugging — could be wired to a telemetry service later
    console.error("[ErrorBoundary] Uncaught render error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  private handleCopyError = () => {
    const text = this.state.error
      ? `${this.state.error.name}: ${this.state.error.message}\n\n${this.state.error.stack ?? ""}`
      : "Unknown error";
    navigator.clipboard.writeText(text).catch(() => {
      // clipboard API may not be available
    });
  };

  private toggleDetails = () => {
    this.setState((s) => ({ showDetails: !s.showDetails }));
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, showDetails } = this.state;

    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0c] relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[500px] h-[500px] bg-red-500/10 rounded-full blur-[120px]" />
        </div>

        <div className="bg-white/[0.02] backdrop-blur-xl border border-red-500/20 rounded-2xl p-10 max-w-lg w-full shadow-2xl flex flex-col items-center relative z-10 mx-4">
          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 shadow-inner border border-red-500/20">
            <AlertTriangle className="text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.5)]" size={32} />
          </div>

          <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
          <p className="text-zinc-400 text-sm mb-6 text-center">
            The IDE encountered an unexpected error. You can retry rendering or reload the page.
          </p>

          {/* Error summary */}
          {error && (
            <div className="w-full mb-6">
              <button
                onClick={this.toggleDetails}
                className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2"
              >
                {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {error.name}: {error.message.slice(0, 80)}
                {error.message.length > 80 ? "..." : ""}
              </button>

              {showDetails && (
                <div className="relative">
                  <pre className="bg-black/40 border border-white/[0.05] rounded-lg p-3 text-xs text-red-300/80 overflow-auto max-h-48 font-mono leading-relaxed">
                    {error.stack ?? error.message}
                  </pre>
                  <button
                    onClick={this.handleCopyError}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-zinc-400 hover:text-white transition-colors"
                    title="Copy error"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <button
              onClick={this.handleRetry}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white text-sm border border-white/[0.05] transition-colors"
            >
              <RotateCcw size={14} />
              Retry
            </button>
            <button
              onClick={this.handleReload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm border border-red-500/20 transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
