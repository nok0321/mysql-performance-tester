/**
 * Recommendations display component
 * Extracted from SingleTest.tsx for reuse in ComparisonTest
 */
import { useTranslation } from 'react-i18next';
import type { QueryPlan } from '../types';

interface Props {
  plan: QueryPlan | undefined;
  explainTree?: string;
}

/**
 * Analyze EXPLAIN tree text for common performance issues.
 * Returns issues and recommendations arrays.
 */
function analyzeExplainTree(tree: string): { issues: string[]; recommendations: string[] } {
  const issues: string[] = [];
  const recommendations: string[] = [];
  const lower = tree.toLowerCase();

  if (lower.includes('full table scan') || lower.includes('table scan')) {
    issues.push('Full table scan detected');
    recommendations.push('Consider adding an index on the columns used in WHERE / JOIN clauses');
  }
  if (lower.includes('filesort')) {
    issues.push('Filesort operation detected');
    recommendations.push('Consider adding an index that covers the ORDER BY columns');
  }
  if (lower.includes('temporary')) {
    issues.push('Temporary table created');
    recommendations.push('Review GROUP BY / DISTINCT usage; an index covering these columns may eliminate the temporary table');
  }
  if (lower.includes('nested loop')) {
    recommendations.push('Nested loop join detected — ensure join columns are indexed');
  }

  return { issues, recommendations };
}

export default function RecommendPanel({ plan, explainTree }: Props) {
  const { t } = useTranslation();

  // Use explicit queryPlan if available, otherwise analyze EXPLAIN tree
  const issues = plan?.issues || [];
  const recs = plan?.recommendations || [];
  const hasExplicitPlan = issues.length > 0 || recs.length > 0;

  if (!hasExplicitPlan && explainTree) {
    const analysis = analyzeExplainTree(explainTree);
    return (
      <div>
        {analysis.issues.length > 0 && (
          <>
            <div className="section-title">{t('components.issuesDetected')}</div>
            {analysis.issues.map((iss, i) => (
              <div key={i} className="alert alert-error" style={{ marginBottom: 8 }}>{iss}</div>
            ))}
          </>
        )}
        {analysis.recommendations.length > 0 && (
          <>
            <div className="section-title mt-4">{t('components.recommendations')}</div>
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="alert alert-info" style={{ marginBottom: 8 }}>{rec}</div>
            ))}
          </>
        )}
        {analysis.issues.length === 0 && analysis.recommendations.length === 0 && (
          <div className="empty-state"><p>{t('components.noIssues')}</p></div>
        )}
      </div>
    );
  }

  if (!hasExplicitPlan) {
    return <div className="empty-state"><p>{t('components.recommendNoData')}</p></div>;
  }

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
