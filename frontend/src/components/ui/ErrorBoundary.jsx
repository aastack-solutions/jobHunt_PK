import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Intentionally silent: production must not leak stack traces to the UI.
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-strong mx-auto mt-12 max-w-md rounded-3xl p-8 text-center animate-slide-up">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100">
            <AlertTriangle className="h-7 w-7 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Something went wrong</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            This section failed to load. Try again or reload the page.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="btn-gradient mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all active:scale-95"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
