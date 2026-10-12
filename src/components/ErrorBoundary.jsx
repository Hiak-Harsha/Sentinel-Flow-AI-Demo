import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Sentinel Flow Error Boundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  handleReturnHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
    if (this.props.onReturnHome) {
      this.props.onReturnHome();
    } else {
      window.location.hash = "#/";
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#060d19] text-slate-100 flex items-center justify-center p-6 cyber-grid">
          <div className="max-w-md w-full rounded-2xl border border-rose-500/30 bg-slate-900/90 backdrop-blur-xl p-8 shadow-2xl shadow-rose-950/40 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold tracking-tight text-white mb-2">Something went wrong</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              The monitoring dashboard could not be rendered due to an unexpected state. The application prevented a crash.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <button
                type="button"
                onClick={this.handleRetry}
                className="rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-5 py-2.5 text-xs font-bold text-slate-950 transition hover:opacity-90 shadow-lg shadow-cyan-500/20"
              >
                ↻ Retry
              </button>
              <button
                type="button"
                onClick={this.handleReturnHome}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-white/10"
              >
                Return to Overview
              </button>
            </div>

            <div className="text-left border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center justify-between w-full"
              >
                <span>{this.state.showDetails ? "Hide technical diagnostic" : "Show technical diagnostic"}</span>
                <span>{this.state.showDetails ? "▲" : "▼"}</span>
              </button>

              {this.state.showDetails && (
                <div className="mt-3 rounded-lg bg-black/60 p-3 text-[10px] font-mono text-rose-300 overflow-x-auto max-h-40 border border-white/5">
                  <p className="font-bold text-rose-400 mb-1">{this.state.error?.toString()}</p>
                  <pre className="text-slate-400 whitespace-pre-wrap">{this.state.errorInfo?.componentStack}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
