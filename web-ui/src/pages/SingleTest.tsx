import { useState, useEffect } from 'react';
import { connectionsApi, sqlApi, testsApi } from '../api/client';
import StatCardsGrid from '../components/StatCardsGrid';
import ProgressBar from '../components/ProgressBar';
import PercentilesTable from '../components/PercentilesTable';
import HistogramChart from '../components/HistogramChart';
import ExplainPanel from '../components/ExplainPanel';
import RecommendPanel from '../components/RecommendPanel';
import useTestExecution from '../hooks/useTestExecution';
import type {
  Connection, SqlItem, SingleTestForm,
  WsMessage, RunAction,
} from '../types';

interface Props {
  wsMessages: WsMessage[];
  subscribeTestId: (testId: string) => void;
}

export default function SingleTest({ wsMessages, subscribeTestId }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sqlItems, setSqlItems] = useState<SqlItem[]>([]);

  const [form, setForm] = useState<SingleTestForm>({
    connectionId: '',
    sqlMode: 'library',
    sqlId: '',
    sqlText: '',
    testName: 'Web UI Test',
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
    connectionsApi.list().then(setConnections).catch(() => { /* ignore */ });
    sqlApi.list().then(setSqlItems).catch(() => { /* ignore */ });
  }, []);

  const handleRun = async () => {
    const sqlText = form.sqlMode === 'library'
      ? (sqlItems.find(s => s.id === form.sqlId)?.sql || '')
      : form.sqlText;

    if (!form.connectionId) return dispatch({ type: 'error', data: { message: '接続先を選択してください' } } as RunAction);
    if (!sqlText.trim()) return dispatch({ type: 'error', data: { message: 'SQL を入力または選択してください' } } as RunAction);

    dispatch({ type: 'start', progress: { phase: 'starting', current: 0, total: form.testIterations, duration: null } });
    setCurrentTestId(null);

    try {
      const { testId } = await testsApi.runSingle({ ...form, sqlText });
      setCurrentTestId(testId);
      subscribeTestId?.(testId);
    } catch (e) {
      dispatch({ type: 'error', data: { message: (e as Error).message } });
    }
  };

  const stats = run.result?.statistics;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>

      {/* Settings panel */}
      <div className="card">
        <div className="card-title mb-4">⚙ テスト設定</div>

        <div className="form-group">
          <label className="form-label">接続先 *</label>
          <select className="form-select" value={form.connectionId} onChange={e => setF('connectionId', e.target.value)}>
            <option value="">接続を選択...</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name || `${c.host}/${c.database}`}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">テスト名</label>
          <input className="form-input" value={form.testName} onChange={e => setF('testName', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">SQL 入力方法</label>
          <div className="flex gap-2">
            {(['library', 'direct'] as const).map(m => (
              <button key={m} className={`btn btn-sm ${form.sqlMode === m ? 'btn-accent' : 'btn-secondary'}`}
                onClick={() => setF('sqlMode', m)}>
                {m === 'library' ? '📚 ライブラリ' : '✏ 直接入力'}
              </button>
            ))}
          </div>
        </div>

        {form.sqlMode === 'library' ? (
          <div className="form-group">
            <label className="form-label">SQL を選択</label>
            <select className="form-select" value={form.sqlId} onChange={e => setF('sqlId', e.target.value)}>
              <option value="">SQL を選択...</option>
              {sqlItems.map(s => <option key={s.id} value={s.id}>[{s.category}] {s.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">SQL</label>
            <textarea className="form-textarea" rows={5}
              placeholder="SELECT * FROM users LIMIT 100;"
              value={form.sqlText} onChange={e => setF('sqlText', e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">実行回数</label>
          <input className="form-input" type="number" min="1" max="1000"
            value={form.testIterations} onChange={e => setF('testIterations', Number(e.target.value))} />
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          {([
            ['enableWarmup', 'ウォームアップ'],
            ['removeOutliers', '外れ値除外'],
            ['enableExplainAnalyze', 'EXPLAIN ANALYZE'],
            ['enableOptimizerTrace', 'Optimizer Trace'],
            ['enableBufferPoolMonitoring', 'Buffer Pool 監視'],
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
            <label className="form-label">外れ値検出方式</label>
            <select className="form-select" value={form.outlierMethod} onChange={e => setF('outlierMethod', e.target.value)}>
              <option value="iqr">IQR 法</option>
              <option value="zscore">Z スコア法</option>
              <option value="mad">MAD 法</option>
            </select>
          </div>
        )}

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
          onClick={handleRun} disabled={run.runState === 'running'}>
          {run.runState === 'running' ? <><span className="spinner" /> 測定中...</> : '▶ テスト実行'}
        </button>

        {run.errorMsg && <div className="alert alert-error mt-4">⚠ {run.errorMsg}</div>}
      </div>

      {/* Results panel */}
      <div>
        {/* Progress */}
        {run.runState === 'running' && (
          <ProgressBar
            current={run.progress.current}
            total={run.progress.total}
            label={run.progress.phase === 'warmup' ? '🔥 ウォームアップ中...' : '📊 測定中...'}
          >
            {run.progress.duration != null && (
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                直近: {run.progress.duration?.toFixed(2)} ms
              </div>
            )}
          </ProgressBar>
        )}

        {/* Summary stat cards */}
        {stats && (
          <StatCardsGrid items={[
            { label: '平均', value: stats.basic?.mean, unit: 'ms' },
            { label: 'P95', value: stats.percentiles?.p95, unit: 'ms', highlight: true },
            { label: 'P99', value: stats.percentiles?.p99, unit: 'ms' },
            { label: '変動係数 (CV)', value: stats.spread?.cv, unit: '%' },
          ]} />
        )}

        {/* Detail tabs */}
        {run.result && (
          <div className="card fade-in">
            <div className="tabs">
              {([['stats', '📊 統計'], ['histogram', '📈 分布'], ['explain', '🔍 EXPLAIN'], ['recommend', '💡 推奨']] as const).map(([id, label]) => (
                <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`}
                  onClick={() => setActiveTab(id)}>{label}</button>
              ))}
            </div>

            {activeTab === 'stats' && (
              <div>
                <div className="card-grid card-grid-2 mb-4">
                  <div>
                    <div className="section-title">基本統計</div>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {([
                            ['最小', stats?.basic?.min],
                            ['最大', stats?.basic?.max],
                            ['平均', stats?.basic?.mean],
                            ['中央値', stats?.basic?.median],
                            ['標準偏差', stats?.spread?.stdDev],
                            ['IQR', stats?.spread?.iqr],
                          ] as [string, number | undefined][]).map(([l, v]) => (
                            <tr key={l}><td className="text-muted">{l}</td><td className="font-mono">{v ?? '-'} ms</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="section-title">実行回数</div>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {([
                            ['合計', stats?.count?.total],
                            ['使用', stats?.count?.included],
                            ['外れ値', stats?.count?.outliers],
                          ] as [string, number | undefined][]).map(([l, v]) => (
                            <tr key={l}><td className="text-muted">{l}</td><td className="font-mono">{v ?? '-'} 回</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="section-title">パーセンタイル</div>
                <PercentilesTable percentiles={stats?.percentiles} />
              </div>
            )}

            {activeTab === 'histogram' && (
              <HistogramChart distribution={stats?.distribution} />
            )}

            {activeTab === 'explain' && (
              <ExplainPanel explain={run.result.explainAnalyze} />
            )}

            {activeTab === 'recommend' && (
              <RecommendPanel plan={run.result.explainAnalyze?.queryPlan} />
            )}
          </div>
        )}

        {!run.result && !run.runState && (
          <div className="empty-state">
            <div className="empty-icon">▶</div>
            <p>左のパネルで設定してテストを実行してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
