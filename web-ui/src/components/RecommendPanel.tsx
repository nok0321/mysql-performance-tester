/**
 * Recommendations display component
 * Extracted from SingleTest.tsx for reuse in ComparisonTest
 */
import type { QueryPlan } from '../types';

interface Props {
  plan: QueryPlan | undefined;
}

export default function RecommendPanel({ plan }: Props) {
  if (!plan) return <div className="empty-state"><p>推奨データなし</p></div>;
  const issues = plan.issues || [];
  const recs = plan.recommendations || [];
  return (
    <div>
      {issues.length > 0 && (
        <>
          <div className="section-title">検出された問題</div>
          {issues.map((iss, i) => (
            <div key={i} className="alert alert-error" style={{ marginBottom: 8 }}>{iss}</div>
          ))}
        </>
      )}
      {recs.length > 0 && (
        <>
          <div className="section-title mt-4">推奨事項</div>
          {recs.map((rec, i) => (
            <div key={i} className="alert alert-info" style={{ marginBottom: 8 }}>{rec}</div>
          ))}
        </>
      )}
      {issues.length === 0 && recs.length === 0 && (
        <div className="empty-state"><p>特に問題は検出されませんでした</p></div>
      )}
    </div>
  );
}
