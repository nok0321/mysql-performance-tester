/**
 * ComparisonTest - A/B comparison test page
 *
 * Runs two queries with identical parameters and displays
 * side-by-side results with delta metrics.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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

    if (!form.connectionId) return dispatch({ type: 'error', data: { message: t('comparison.errorNoConnection') } } as RunAction);
    if (!sqlTextA.trim()) return dispatch({ type: 'error', data: { message: t('comparison.errorNoSqlA') } } as RunAction);
    if (!sqlTextB.trim()) return dispatch({ type: 'error', data: { message: t('comparison.errorNoSqlB') } } as RunAction);

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
      return sub === 'warmup' ? t('comparison.queryAWarmup') : t('comparison.queryAMeasuring');
    }
    if (phase.startsWith('queryB:')) {
      const sub = phase.replace('queryB:', '');
      return sub === 'warmup' ? t('comparison.queryBWarmup') : t('comparison.queryBMeasuring');
    }
    return t('comparison.starting');
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
          <span style={{ fontWeight: 600 }}>{side === 'A' ? t('comparison.queryA') : t('comparison.queryB')}</span>
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
          <input className="form-input" placeholder={t('comparison.queryNamePlaceholder', { side })}
            value={form[nameKey] as string} onChange={e => setF(nameKey, e.target.value)} />
        </div>

        {mode === 'library' ? (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <select className="form-select" value={form[idKey] as string} onChange={e => setF(idKey, e.target.value)}>
              <option value="">{t('singleTest.selectSql')}</option>
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
        <div className="card-title mb-4">{t('comparison.settingsTitle')}</div>

        <div className="form-group">
          <label className="form-label" htmlFor="ct-connection">{t('singleTest.connection')} *</label>
          <select className="form-select" id="ct-connection" aria-required="true" value={form.connectionId} onChange={e => setF('connectionId', e.target.value)}>
            <option value="">{t('singleTest.selectConnection')}</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name || `${c.host}/${c.database}`}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t('comparison.executionMode')}</label>
          <div className="flex gap-2">
            {([['sequential', t('comparison.sequential')], ['parallel', t('comparison.parallel')]] as [string, string][]).map(([val, label]) => (
              <button key={val}
                className={`btn btn-sm ${form.executionMode === val ? 'btn-accent' : 'btn-secondary'}`}
                onClick={() => setF('executionMode', val)}>
                {label}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 4 }}>
            {form.executionMode === 'sequential'
              ? t('comparison.sequentialDesc')
              : t('comparison.parallelDesc')}
          </div>
        </div>

        {renderSqlInput('A')}
        {renderSqlInput('B')}

        <div className="form-group">
          <label className="form-label" htmlFor="ct-iterations">{t('singleTest.iterations')}</label>
          <input className="form-input" id="ct-iterations" type="number" min="1" max="1000"
            value={form.testIterations} onChange={e => setF('testIterations', Number(e.target.value))} />
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          {([
            ['enableWarmup', t('comparison.warmup')],
            ['removeOutliers', t('comparison.removeOutliers')],
            ['enableExplainAnalyze', t('singleTest.explainAnalyze')],
            ['enableOptimizerTrace', t('singleTest.optimizerTrace')],
            ['enableBufferPoolMonitoring', t('singleTest.bufferPool')],
            ['enablePerformanceSchema', t('singleTest.perfSchema')],
          ] as [string, string][]).map(([key, label]) => (
            <div key={key} className="toggle-row">
              <span className="toggle-label">{label}</span>
              <label className="toggle">
                <input type="checkbox" checked={form[key as keyof ComparisonTestForm] as boolean} onChange={e => setF(key, e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>

        {form.removeOutliers && (
          <div className="form-group">
            <label className="form-label" htmlFor="ct-outlier">{t('comparison.outlierMethod')}</label>
            <select className="form-select" id="ct-outlier" value={form.outlierMethod} onChange={e => setF('outlierMethod', e.target.value)}>
              <option value="iqr">{t('singleTest.iqrMethod')}</option>
              <option value="zscore">{t('singleTest.zscoreMethod')}</option>
              <option value="mad">{t('singleTest.madMethod')}</option>
            </select>
          </div>
        )}

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
          onClick={handleRun} disabled={run.runState === 'running'}>
          {run.runState === 'running' ? <><span className="spinner" /> {t('comparison.running')}</> : t('comparison.runButton')}
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
                {t('comparison.latestDuration', { duration: run.progress.duration?.toFixed(2) })}
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
                { label: t('common.mean'), value: statsA.basic?.mean?.toFixed(2), unit: 'ms' },
                { label: t('common.p95'), value: statsA.percentiles?.p95?.toFixed(2), unit: 'ms', highlight: true },
                { label: t('common.p99'), value: statsA.percentiles?.p99?.toFixed(2), unit: 'ms' },
                { label: t('common.cv'), value: statsA.spread?.cv?.toFixed(2), unit: '%' },
              ]} />}
            </div>
            <div>
              <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>{comparison.testNameB || 'Query B'}</div>
              {statsB && <StatCardsGrid items={[
                { label: t('common.mean'), value: statsB.basic?.mean?.toFixed(2), unit: 'ms' },
                { label: t('common.p95'), value: statsB.percentiles?.p95?.toFixed(2), unit: 'ms', highlight: true },
                { label: t('common.p99'), value: statsB.percentiles?.p99?.toFixed(2), unit: 'ms' },
                { label: t('common.cv'), value: statsB.spread?.cv?.toFixed(2), unit: '%' },
              ]} />}
            </div>
          </div>
        )}

        {/* Detail tabs */}
        {comparison && (
          <div className="card fade-in">
            <div className="tabs">
              {([
                ['stats', t('comparison.tabStats')],
                ['histogram', t('comparison.tabDistribution')],
                ['explain', t('comparison.tabExplain')],
                ['recommend', t('comparison.tabRecommend')],
              ] as [string, string][]).map(([id, label]) => (
                <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`}
                  aria-label={label} onClick={() => setActiveTab(id)}>{label}</button>
              ))}
            </div>

            {activeTab === 'stats' && (
              <div>
                {/* Side-by-side basic stats */}
                <div className="card-grid card-grid-2 mb-4">
                  <div>
                    <div className="section-title">{comparison.testNameA} - {t('comparison.basicStats')}</div>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {([
                            [t('common.min'), statsA?.basic?.min],
                            [t('common.max'), statsA?.basic?.max],
                            [t('common.mean'), statsA?.basic?.mean],
                            [t('common.median'), statsA?.basic?.median],
                            [t('common.stdDev'), statsA?.spread?.stdDev],
                            [t('common.iqr'), statsA?.spread?.iqr],
                          ] as [string, number | undefined][]).map(([l, v]) => (
                            <tr key={l}><td className="text-muted">{l}</td><td className="font-mono">{v != null ? `${v.toFixed(2)} ms` : '-'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="section-title">{comparison.testNameB} - {t('comparison.basicStats')}</div>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {([
                            [t('common.min'), statsB?.basic?.min],
                            [t('common.max'), statsB?.basic?.max],
                            [t('common.mean'), statsB?.basic?.mean],
                            [t('common.median'), statsB?.basic?.median],
                            [t('common.stdDev'), statsB?.spread?.stdDev],
                            [t('common.iqr'), statsB?.spread?.iqr],
                          ] as [string, number | undefined][]).map(([l, v]) => (
                            <tr key={l}><td className="text-muted">{l}</td><td className="font-mono">{v != null ? `${v.toFixed(2)} ms` : '-'}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="section-title">{t('comparison.percentileComparison')}</div>
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
            <p>{t('comparison.emptyState')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
