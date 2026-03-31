/**
 * ComparisonTest - A/B comparison test page
 *
 * Runs two queries with identical parameters and displays
 * side-by-side results with delta metrics.
 */
import { useState, useEffect } from 'react';
import { connectionsApi, sqlApi, testsApi } from '../api/client';
import StatCardsGrid from '../components/StatCardsGrid';
import ProgressBar from '../components/ProgressBar';
import PercentilesTable from '../components/PercentilesTable';
import HistogramChart from '../components/HistogramChart';
import ExplainPanel from '../components/ExplainPanel';
import RecommendPanel from '../components/RecommendPanel';
import DeltaSummaryBar from '../components/DeltaSummaryBar';
import OverlaidHistogram from '../components/OverlaidHistogram';
import ComparisonPercentilesTable from '../components/ComparisonPercentilesTable';
import useTestExecution from '../hooks/useTestExecution';
import type {
  Connection, SqlItem, ComparisonTestForm,
  ComparisonResult, WsMessage, RunAction,
} from '../types';

interface Props {
  wsMessages: WsMessage[];
  subscribeTestId: (testId: string) => void;
}

export default function ComparisonTest({ wsMessages, subscribeTestId }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sqlItems, setSqlItems] = useState<SqlItem[]>([]);

  const [form, setForm] = useState<ComparisonTestForm>({
    connectionId: '',
    executionMode: 'sequential',
    sqlModeA: 'direct',
    sqlIdA: '',
    sqlTextA: '',
    testNameA: 'Query A',
    sqlModeB: 'direct',
    sqlIdB: '',
    sqlTextB: '',
    testNameB: 'Query B',
    testIterations: 20,
    enableWarmup: true,
    warmupPercentage: 20,
    removeOutliers: false,
    outlierMethod: 'iqr',
    enableExplainAnalyze: true,
    enableOptimizerTrace: false,
    enableBufferPoolMonitoring: true,
    enablePerformanceSchema: false,
  });
  const setF = (k: string, v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }));

  const { run, dispatch, setCurrentTestId } = useTestExecution(wsMessages);
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    connectionsApi.list().then(setConnections).catch(() => { });
    sqlApi.list().then(setSqlItems).catch(() => { });
  }, []);

  // Parse comparison data from WebSocket complete message
  useEffect(() => {
    if (run.runState !== 'complete') return;
    // The hook sets run.comparison when complete data includes comparison fields
  }, [run.runState]);

  // Build comparison result from the raw complete event
  const comparison: ComparisonResult | null = run.comparison;

  const handleRun = async () => {
    const sqlTextA = form.sqlModeA === 'library'
      ? (sqlItems.find(s => s.id === form.sqlIdA)?.sql || '')
      : form.sqlTextA;
    const sqlTextB = form.sqlModeB === 'library'
      ? (sqlItems.find(s => s.id === form.sqlIdB)?.sql || '')
      : form.sqlTextB;

    if (!form.connectionId) return dispatch({ type: 'error', data: { message: '接続先を選択してください' } } as RunAction);
    if (!sqlTextA.trim()) return dispatch({ type: 'error', data: { message: 'Query A の SQL を入力してください' } } as RunAction);
    if (!sqlTextB.trim()) return dispatch({ type: 'error', data: { message: 'Query B の SQL を入力してください' } } as RunAction);

    dispatch({ type: 'start', progress: { phase: 'starting', current: 0, total: form.testIterations, duration: null } });
    setCurrentTestId(null);

    try {
      const { testId } = await testsApi.runComparison({
        connectionId: form.connectionId,
        sqlTextA,
        sqlTextB,
        testNameA: form.testNameA,
        testNameB: form.testNameB,
        executionMode: form.executionMode,
        testIterations: form.testIterations,
        enableWarmup: form.enableWarmup,
        warmupPercentage: form.warmupPercentage,
        removeOutliers: form.removeOutliers,
        outlierMethod: form.outlierMethod,
        enableExplainAnalyze: form.enableExplainAnalyze,
        enableOptimizerTrace: form.enableOptimizerTrace,
        enableBufferPoolMonitoring: form.enableBufferPoolMonitoring,
        enablePerformanceSchema: form.enablePerformanceSchema,
      });
      setCurrentTestId(testId);
      subscribeTestId?.(testId);
    } catch (e) {
      dispatch({ type: 'error', data: { message: (e as Error).message } });
    }
  };

  // Progress label based on phase prefix
  const progressLabel = (() => {
    const phase = run.progress.phase || '';
    if (phase.startsWith('queryA:')) {
      const sub = phase.replace('queryA:', '');
      return sub === 'warmup' ? 'Query A: Warmup...' : 'Query A: Measuring...';
    }
    if (phase.startsWith('queryB:')) {
      const sub = phase.replace('queryB:', '');
      return sub === 'warmup' ? 'Query B: Warmup...' : 'Query B: Measuring...';
    }
    return 'Starting...';
  })();

  const statsA = comparison?.resultA?.statistics;
  const statsB = comparison?.resultB?.statistics;

  /** SQL input section for a single query */
  const renderSqlInput = (side: 'A' | 'B') => {
    const modeKey = side === 'A' ? 'sqlModeA' : 'sqlModeB';
    const idKey = side === 'A' ? 'sqlIdA' : 'sqlIdB';
    const textKey = side === 'A' ? 'sqlTextA' : 'sqlTextB';
    const nameKey = side === 'A' ? 'testNameA' : 'testNameB';
    const mode = form[modeKey] as string;

    return (
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="flex items-center gap-2 mb-4" style={{ marginBottom: 'var(--space-2)' }}>
          <span style={{ fontWeight: 600 }}>Query {side}</span>
          <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
            {(['library', 'direct'] as const).map(m => (
              <button key={m} className={`btn btn-sm ${mode === m ? 'btn-accent' : 'btn-secondary'}`}
                style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                onClick={() => setF(modeKey, m)}>
                {m === 'library' ? 'Lib' : 'SQL'}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 'var(--space-2)' }}>
          <input className="form-input" placeholder={`Query ${side} name`}
            value={form[nameKey] as string} onChange={e => setF(nameKey, e.target.value)} />
        </div>

        {mode === 'library' ? (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select className="form-select" value={form[idKey] as string} onChange={e => setF(idKey, e.target.value)}>
              <option value="">SQL を選択...</option>
              {sqlItems.map(s => <option key={s.id} value={s.id}>[{s.category}] {s.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <textarea className="form-textarea" rows={3}
              placeholder={`SELECT * FROM ...`}
              value={form[textKey] as string} onChange={e => setF(textKey, e.target.value)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>

      {/* Settings panel */}
      <div className="card">
        <div className="card-title mb-4">A/B Comparison Settings</div>

        <div className="form-group">
          <label className="form-label">接続先 *</label>
          <select className="form-select" value={form.connectionId} onChange={e => setF('connectionId', e.target.value)}>
            <option value="">接続を選択...</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name || `${c.host}/${c.database}`}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">実行方式</label>
          <div className="flex gap-2">
            {([['sequential', 'Sequential'], ['parallel', 'Parallel']] as const).map(([val, label]) => (
              <button key={val}
                className={`btn btn-sm ${form.executionMode === val ? 'btn-accent' : 'btn-secondary'}`}
                onClick={() => setF('executionMode', val)}>
                {label}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 4 }}>
            {form.executionMode === 'sequential'
              ? 'A → B を順に実行（公平だがキャッシュ影響あり）'
              : 'A, B を同時実行（実環境に近いがリソース競合あり）'}
          </div>
        </div>

        {renderSqlInput('A')}
        {renderSqlInput('B')}

        <div className="form-group">
          <label className="form-label">実行回数</label>
          <input className="form-input" type="number" min="1" max="1000"
            value={form.testIterations} onChange={e => setF('testIterations', Number(e.target.value))} />
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          {([
            ['enableWarmup', 'Warmup'],
            ['removeOutliers', 'Remove Outliers'],
            ['enableExplainAnalyze', 'EXPLAIN ANALYZE'],
            ['enableOptimizerTrace', 'Optimizer Trace'],
            ['enableBufferPoolMonitoring', 'Buffer Pool'],
            ['enablePerformanceSchema', 'Performance Schema'],
          ] as const).map(([key, label]) => (
            <div key={key} className="toggle-row">
              <span className="toggle-label">{label}</span>
              <label className="toggle">
                <input type="checkbox" checked={form[key] as boolean} onChange={e => setF(key, e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>

        {form.removeOutliers && (
          <div className="form-group">
            <label className="form-label">Outlier Method</label>
            <select className="form-select" value={form.outlierMethod} onChange={e => setF('outlierMethod', e.target.value)}>
              <option value="iqr">IQR</option>
              <option value="zscore">Z-Score</option>
              <option value="mad">MAD</option>
            </select>
          </div>
        )}

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
          onClick={handleRun} disabled={run.runState === 'running'}>
          {run.runState === 'running' ? <><span className="spinner" /> Running...</> : 'Run A/B Comparison'}
        </button>

        {run.errorMsg && <div className="alert alert-error mt-4">{run.errorMsg}</div>}
      </div>

      {/* Results panel */}
      <div>
        {/* Progress */}
        {run.runState === 'running' && (
          <ProgressBar
            current={run.progress.current}
            total={run.progress.total}
            label={progressLabel}
          >
            {run.progress.duration != null && (
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                Latest: {run.progress.duration?.toFixed(2)} ms
              </div>
            )}
          </ProgressBar>
        )}

        {/* Delta summary */}
        {comparison?.delta && (
          <DeltaSummaryBar
            delta={comparison.delta}
            nameA={comparison.testNameA || 'Query A'}
            nameB={comparison.testNameB || 'Query B'}
          />
        )}

        {/* Side-by-side stat cards */}
        {comparison && (statsA || statsB) && (
          <div className="card-grid card-grid-2 mb-4 fade-in">
            <div>
              <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>{comparison.testNameA || 'Query A'}</div>
              {statsA && <StatCardsGrid items={[
                { label: 'Mean', value: statsA.basic?.mean?.toFixed(2), unit: 'ms' },
                { label: 'P95', value: statsA.percentiles?.p95?.toFixed(2), unit: 'ms', highlight: true },
                { label: 'P99', value: statsA.percentiles?.p99?.toFixed(2), unit: 'ms' },
                { label: 'CV', value: statsA.spread?.cv?.toFixed(2), unit: '%' },
              ]} />}
            </div>
            <div>
              <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>{comparison.testNameB || 'Query B'}</div>
              {statsB && <StatCardsGrid items={[
                { label: 'Mean', value: statsB.basic?.mean?.toFixed(2), unit: 'ms' },
                { label: 'P95', value: statsB.percentiles?.p95?.toFixed(2), unit: 'ms', highlight: true },
                { label: 'P99', value: statsB.percentiles?.p99?.toFixed(2), unit: 'ms' },
                { label: 'CV', value: statsB.spread?.cv?.toFixed(2), unit: '%' },
              ]} />}
            </div>
          </div>
        )}

        {/* Detail tabs */}
        {comparison && (
          <div className="card fade-in">
            <div className="tabs">
              {([
                ['stats', 'Stats'],
                ['histogram', 'Distribution'],
                ['explain', 'EXPLAIN'],
                ['recommend', 'Recommend'],
              ] as const).map(([id, label]) => (
                <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`}
                  onClick={() => setActiveTab(id)}>{label}</button>
              ))}
            </div>

            {activeTab === 'stats' && (
              <div>
                {/* Side-by-side basic stats */}
                <div className="card-grid card-grid-2 mb-4">
                  <div>
                    <div className="section-title">{comparison.testNameA} - Basic Stats</div>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {([
                            ['Min', statsA?.basic?.min],
                            ['Max', statsA?.basic?.max],
                            ['Mean', statsA?.basic?.mean],
                            ['Median', statsA?.basic?.median],
                            ['StdDev', statsA?.spread?.stdDev],
                            ['IQR', statsA?.spread?.iqr],
                          ] as [string, number | undefined][]).map(([l, v]) => (
                            <tr key={l}><td className="text-muted">{l}</td><td className="font-mono">{v != null ? `${v.toFixed(2)} ms` : '-'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="section-title">{comparison.testNameB} - Basic Stats</div>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {([
                            ['Min', statsB?.basic?.min],
                            ['Max', statsB?.basic?.max],
                            ['Mean', statsB?.basic?.mean],
                            ['Median', statsB?.basic?.median],
                            ['StdDev', statsB?.spread?.stdDev],
                            ['IQR', statsB?.spread?.iqr],
                          ] as [string, number | undefined][]).map(([l, v]) => (
                            <tr key={l}><td className="text-muted">{l}</td><td className="font-mono">{v != null ? `${v.toFixed(2)} ms` : '-'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="section-title">Percentile Comparison</div>
                <ComparisonPercentilesTable
                  percentilesA={statsA?.percentiles}
                  percentilesB={statsB?.percentiles}
                  nameA={comparison.testNameA || 'Query A'}
                  nameB={comparison.testNameB || 'Query B'}
                />
              </div>
            )}

            {activeTab === 'histogram' && (
              <OverlaidHistogram
                distributionA={statsA?.distribution}
                distributionB={statsB?.distribution}
                nameA={comparison.testNameA || 'Query A'}
                nameB={comparison.testNameB || 'Query B'}
              />
            )}

            {activeTab === 'explain' && (
              <div className="card-grid card-grid-2">
                <div>
                  <div className="section-title">{comparison.testNameA}</div>
                  <ExplainPanel explain={comparison.resultA?.explainAnalyze} />
                </div>
                <div>
                  <div className="section-title">{comparison.testNameB}</div>
                  <ExplainPanel explain={comparison.resultB?.explainAnalyze} />
                </div>
              </div>
            )}

            {activeTab === 'recommend' && (
              <div className="card-grid card-grid-2">
                <div>
                  <div className="section-title">{comparison.testNameA}</div>
                  <RecommendPanel plan={comparison.resultA?.explainAnalyze?.queryPlan} />
                </div>
                <div>
                  <div className="section-title">{comparison.testNameB}</div>
                  <RecommendPanel plan={comparison.resultB?.explainAnalyze?.queryPlan} />
                </div>
              </div>
            )}
          </div>
        )}

        {!comparison && !run.runState && (
          <div className="empty-state">
            <div className="empty-icon">A/B</div>
            <p>左のパネルで2つのクエリを設定して比較テストを実行してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
