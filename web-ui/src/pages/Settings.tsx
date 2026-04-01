import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation();
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
        <h2>{t('settings.title')}</h2>
        <p>{t('settings.subtitle')}</p>
      </div>

      {saved && <div className="alert alert-success">✅ {t('settings.saved')}</div>}

      <div className="card mb-4">
        <div className="card-title mb-4">🧪 {t('settings.testDefaults')}</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('settings.defaultIterations')}</label>
            <input className="form-input" type="number" min="1" max="1000"
              value={form.testIterations} onChange={e => setF('testIterations', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('settings.warmupPercent')}</label>
            <input className="form-input" type="number" min="0" max="100"
              value={form.warmupPercentage} onChange={e => setF('warmupPercentage', Number(e.target.value))} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('settings.outlierMethod')}</label>
          <select className="form-select" value={form.outlierMethod} onChange={e => setF('outlierMethod', e.target.value)}>
            <option value="iqr">{t('settings.iqrRecommended')}</option>
            <option value="zscore">{t('settings.zscore')}</option>
            <option value="mad">{t('settings.mad')}</option>
          </select>
        </div>

        {([
          ['enableWarmup', t('settings.enableWarmup')],
          ['removeOutliers', t('settings.removeOutliers')],
          ['enableExplainAnalyze', t('settings.enableExplain')],
          ['enableOptimizerTrace', t('settings.enableOptimizer')],
          ['enableBufferPoolMonitoring', t('settings.enableBuffer')],
          ['enablePerformanceSchema', t('settings.enablePerfSchema')],
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
        <div className="card-title mb-4">💾 {t('settings.resultStorage')}</div>
        <div className="toggle-row">
          <span className="toggle-label">{t('settings.autoSave')}</span>
          <label className="toggle">
            <input type="checkbox" checked={form.autoSaveResults} onChange={e => setF('autoSaveResults', e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
        <div className="toggle-row">
          <span className="toggle-label">{t('settings.debugOutput')}</span>
          <label className="toggle">
            <input type="checkbox" checked={form.debugOutputEnabled} onChange={e => setF('debugOutputEnabled', e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title mb-4">ℹ️ {t('settings.systemInfo')}</div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><td className="text-muted">{t('settings.backendUrl')}</td><td className="font-mono text-sm">http://localhost:3001</td></tr>
              <tr><td className="text-muted">{t('settings.wsUrl')}</td><td className="font-mono text-sm">ws://localhost:3001</td></tr>
              <tr><td className="text-muted">{t('settings.frontend')}</td><td className="font-mono text-sm">http://localhost:5173</td></tr>
              <tr><td className="text-muted">{t('settings.version')}</td><td className="font-mono text-sm">1.0.0</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title mb-4">{t('settings.language')}</div>
        <div className="form-group">
          <select className="form-select" value={i18n.language} onChange={e => i18n.changeLanguage(e.target.value)}>
            <option value="ja">{t('settings.langJa')}</option>
            <option value="en">{t('settings.langEn')}</option>
          </select>
        </div>
      </div>

      <button className="btn btn-primary btn-lg" onClick={handleSave}>
        💾 {t('settings.saveButton')}
      </button>
    </div>
  );
}
