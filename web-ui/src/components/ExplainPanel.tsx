/**
 * EXPLAIN result display component
 * Extracted from SingleTest.tsx for reuse in ComparisonTest
 */
import type { ExplainAnalyze } from '../types';

interface Props {
  explain: ExplainAnalyze | undefined;
}

export default function ExplainPanel({ explain }: Props) {
  if (!explain) return <div className="empty-state"><p>EXPLAIN データなし（無効またはエラー）</p></div>;
  return (
    <div>
      {explain.data != null && (
        <div className="code-block">{JSON.stringify(explain.data, null, 2)}</div>
      )}
      {explain.analyze?.tree && (
        <>
          <div className="section-title mt-4">EXPLAIN ANALYZE</div>
          <div className="code-block">{explain.analyze.tree}</div>
        </>
      )}
    </div>
  );
}
