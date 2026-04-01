/**
 * EXPLAIN result display component
 * Extracted from SingleTest.tsx for reuse in ComparisonTest
 */
import { useTranslation } from 'react-i18next';
import type { ExplainAnalyze } from '../types';

interface Props {
  explain: ExplainAnalyze | undefined;
}

export default function ExplainPanel({ explain }: Props) {
  const { t } = useTranslation();

  if (!explain) return <div className="empty-state"><p>{t('components.explainNoData')}</p></div>;
  return (
    <div>
      {explain.data != null && (
        <div className="code-block">{JSON.stringify(explain.data, null, 2)}</div>
      )}
      {explain.analyze?.tree && (
        <>
          <div className="section-title mt-4">{t('components.explainAnalyze')}</div>
          <div className="code-block">{explain.analyze.tree}</div>
        </>
      )}
    </div>
  );
}
