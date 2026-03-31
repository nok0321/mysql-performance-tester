import { useState } from 'react';
import type { SettingsForm } from '../types';

const DEFAULTS: SettingsForm = {
  testIterations: 20,
  warmupPercentage: 20,
  outlierMethod: 'iqr',
  enableWarmup: true,
  removeOutliers: false,
  enableExplainAnalyze: true,
  enableOptimizerTrace: false,
  enableBufferPoolMonitoring: true,
  enablePerformanceSchema: false,
  debugOutputEnabled: false,
  autoSaveResults: true,
};

export default function Settings() {
  const [form, setForm] = useState<SettingsForm>(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('perftest-settings') || '{}') }; }
    catch { return DEFAULTS; }
  });
  const [saved, setSaved] = useState(false);
  const setF = (k: string, v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    localStorage.setItem('perftest-settings', JSON.stringify(form));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h2>設定</h2>
        <p>テストのデフォルト値などを設定します</p>
      </div>

      {saved && <div className="alert alert-success">✅ 設定を保存しました</div>}

      <div className="card mb-4">
        <div className="card-title mb-4">🧪 テストデフォルト設定</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">デフォルト実行回数</label>
            <input className="form-input" type="number" min="1" max="1000"
              value={form.testIterations} onChange={e => setF('testIterations', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">ウォームアップ割合 (%)</label>
            <input className="form-input" type="number" min="0" max="100"
              value={form.warmupPercentage} onChange={e => setF('warmupPercentage', Number(e.target.value))} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">外れ値検出方式</label>
          <select className="form-select" value={form.outlierMethod} onChange={e => setF('outlierMethod', e.target.value)}>
            <option value="iqr">IQR 法（推奨）</option>
            <option value="zscore">Z スコア法</option>
            <option value="mad">MAD 法</option>
          </select>
        </div>

        {([
          ['enableWarmup', 'ウォームアップを有効にする'],
          ['removeOutliers', '外れ値を自動除外する'],
          ['enableExplainAnalyze', 'EXPLAIN ANALYZE を有効にする（MySQL 8.0.18+）'],
          ['enableOptimizerTrace', 'Optimizer Trace を有効にする（低速注意）'],
          ['enableBufferPoolMonitoring', 'Buffer Pool 監視を有効にする'],
          ['enablePerformanceSchema', 'Performance Schema を有効にする'],
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

      <div className="card mb-4">
        <div className="card-title mb-4">💾 結果保存設定</div>
        <div className="toggle-row">
          <span className="toggle-label">テスト完了時に自動保存する</span>
          <label className="toggle">
            <input type="checkbox" checked={form.autoSaveResults} onChange={e => setF('autoSaveResults', e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="toggle-row">
          <span className="toggle-label">デバッグ出力ファイルを生成する</span>
          <label className="toggle">
            <input type="checkbox" checked={form.debugOutputEnabled} onChange={e => setF('debugOutputEnabled', e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title mb-4">ℹ️ システム情報</div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><td className="text-muted">バックエンド URL</td><td className="font-mono text-sm">http://localhost:3001</td></tr>
              <tr><td className="text-muted">WebSocket URL</td><td className="font-mono text-sm">ws://localhost:3001</td></tr>
              <tr><td className="text-muted">フロントエンド</td><td className="font-mono text-sm">http://localhost:5173</td></tr>
              <tr><td className="text-muted">バージョン</td><td className="font-mono text-sm">1.0.0</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <button className="btn btn-primary btn-lg" onClick={handleSave}>
        💾 設定を保存
      </button>
    </div>
  );
}
