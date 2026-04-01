/**
 * Recommendations display component
 * Extracted from SingleTest.tsx for reuse in ComparisonTest
 */
import { useTranslation } from 'react-i18next';
import type { QueryPlan } from '../types';

interface Props {
  plan: QueryPlan | undefined;
}

export default function RecommendPanel({ plan }: Props) {
  const { t } = useTranslation();

  if (!plan) return <div className="empty-state"><p>{t('components.recommendNoData')}</p></div>;
  const issues = plan.issues || [];
  const recs = plan.recommendations || [];
  return (
    <div>
      {issues.length > 0 && (
        <>
          <div className="section-title">{t('components.issuesDetected')}</div>
          {issues.map((iss, i) => (
            <div key={i} className="alert alert-error" style={{ marginBottom: 8 }}>{iss}</div>
          ))}
        </>
      )}
      {recs.length > 0 && (
        <>
          <div className="section-title mt-4">{t('components.recommendations')}</div>
          {recs.map((rec, i) => (
            <div key={i} className="alert alert-info" style={{ marginBottom: 8 }}>{rec}</div>
          ))}
        </>
      )}
      {issues.length === 0 && recs.length === 0 && (
        <div className="empty-state"><p>{t('components.noIssues')}</p></div>
      )}
    </div>
  );
}
