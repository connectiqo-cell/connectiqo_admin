import { Component } from "react";

/**
 * Catches render errors below it so one broken component shows a message
 * instead of unmounting the whole app (a blank/black screen).
 * Changing `resetKey` (e.g. the route path) clears the error.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error caught by ErrorBoundary:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fullPage = false } = this.props;
    return (
      <div className={fullPage ? "admin-page-loader" : ""} role="alert">
        <div className="admin-card p-4 error-boundary">
          <div className="d-flex align-items-start gap-3">
            <span className="material-icons error-boundary__icon" aria-hidden="true">error_outline</span>
            <div className="min-w-0">
              <h2 className="h5 mb-1">Something went wrong on this page</h2>
              <p className="text-muted small mb-3">
                The rest of the panel still works. Try again, or go back to the overview.
              </p>
              <details className="error-boundary__details mb-3">
                <summary className="small text-muted">Technical details</summary>
                <pre className="json-pre mt-2 mb-0">{String(error?.message || error)}</pre>
              </details>
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => this.setState({ error: null })}>
                  Try again
                </button>
                <a className="btn btn-outline-secondary btn-sm" href={import.meta.env.BASE_URL}>
                  Go to Overview
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
