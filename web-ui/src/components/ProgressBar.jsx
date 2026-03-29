/**
 * Reusable progress bar component for test execution
 */
export default function ProgressBar({ current, total, label, children }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="card mb-4 fade-in">
      <div className="flex items-center justify-between mb-4">
        <span className="card-title">{label}</span>
        <span className="text-muted text-sm">{current}/{total}</span>
      </div>
      <div className="progress-wrap">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-info">
        <span>{pct}%</span>
      </div>
      {children}
    </div>
  );
}
