export default function AuthLoading() {
  return <main className="auth-page auth-page--loading" aria-busy="true" aria-label="Loading BASNY account">
    <div className="auth-loading-visual" />
    <div className="auth-loading-panel">
      <span className="auth-loading-brand" />
      <span className="auth-loading-line" />
      <span className="auth-loading-title" />
      <span className="auth-loading-line" />
      <span className="auth-loading-field" />
      <span className="auth-loading-field" />
      <span className="auth-loading-button" />
    </div>
  </main>;
}
