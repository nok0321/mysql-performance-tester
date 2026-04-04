import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { connectionsApi } from '../api/client';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { Connection, ConnectionFormData, ConnectionTestResult } from '../types';

interface ConnectionFormProps {
  initial: Connection | null;
  onSave: (form: ConnectionFormData) => void;
  onCancel: () => void;
}

function ConnectionForm({ initial, onSave, onCancel }: ConnectionFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ConnectionFormData>(initial || {
    name: '', host: 'localhost', port: 3306,
    database: '', user: 'root', password: '', poolSize: 10
  });
  const set = (k: keyof ConnectionFormData, v: string | number) => setForm(f => ({ ...f, [k]: v }));
  const trapRef = useFocusTrap(onCancel);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div ref={trapRef} className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" id="modal-title">{initial ? t('connections.editTitle') : t('connections.addTitle')}</h3>
          <button className="modal-close" aria-label="Close" onClick={onCancel}>×</button>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="conn-name">{t('connections.name')}</label>
          <input className="form-input" id="conn-name" placeholder="My MySQL Server"
            value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="conn-host">{t('connections.host')} *</label>
            <input className="form-input" id="conn-host" placeholder="localhost" aria-required="true"
              value={form.host} onChange={e => set('host', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="conn-port">{t('connections.port')}</label>
            <input className="form-input" id="conn-port" type="number" placeholder="3306"
              value={form.port} onChange={e => set('port', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="conn-database">{t('connections.database')} *</label>
          <input className="form-input" id="conn-database" placeholder="mydb" aria-required="true"
            value={form.database} onChange={e => set('database', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="conn-user">{t('connections.user')} *</label>
            <input className="form-input" id="conn-user" placeholder="root" aria-required="true"
              value={form.user} onChange={e => set('user', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="conn-password">{t('connections.password')}</label>
            <input className="form-input" id="conn-password" type="password"
              value={form.password} onChange={e => set('password', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="conn-pool">{t('connections.poolSize')}</label>
          <input className="form-input" id="conn-pool" type="number" min="1" max="50"
            value={form.poolSize} onChange={e => set('poolSize', e.target.value)} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}

export default function Connections() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const data = await connectionsApi.list();
      setConnections(data);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form: ConnectionFormData) => {
    try {
      if (editTarget) {
        await connectionsApi.update(editTarget.id, form);
      } else {
        await connectionsApi.create(form);
      }
      setShowForm(false);
      setEditTarget(null);
      load();
    } catch (e) { setError((e as Error).message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('connections.confirmDelete'))) return;
    try { await connectionsApi.remove(id); load(); }
    catch (e) { setError((e as Error).message); }
  };

  const handleTest = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { loading: true } }));
    try {
      const result = await connectionsApi.test(id);
      setTestResults(prev => ({ ...prev, [id]: { ok: true, ...result } }));
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, error: (e as Error).message } }));
    }
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>{t('connections.title')}</h2>
          <p>{t('connections.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditTarget(null); }}>
          + {t('connections.addButton')}
        </button>
      </div>

      {error && <div className="alert alert-error">⚠ {error}</div>}

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : connections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔌</div>
          <p>{t('connections.emptyState')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {connections.map(conn => {
            const tr = testResults[conn.id];
            return (
              <div key={conn.id} className="card fade-in">
                <div className="card-header">
                  <div>
                    <div className="card-title">{conn.name || `${conn.host}:${conn.port}`}</div>
                    <div className="card-subtitle font-mono">
                      {conn.host}:{conn.port} / {conn.database}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => handleTest(conn.id)}
                      disabled={tr?.loading}>
                      {tr?.loading ? <span className="spinner" /> : '🔍'} {t('connections.testButton')}
                    </button>
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => { setEditTarget(conn); setShowForm(true); }}>
                      ✏ {t('common.edit')}
                    </button>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(conn.id)}
                      aria-label={t('common.delete')}>
                      🗑
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 text-sm text-muted">
                  <span>👤 {conn.user}</span>
                  <span>🔢 {t('connections.pool', { size: conn.poolSize })}</span>
                </div>

                {tr && !tr.loading && (
                  <div className={`alert mt-4 ${tr.ok ? 'alert-success' : 'alert-error'}`}>
                    {tr.ok
                      ? `✅ ${t('connections.testSuccess', { version: tr.serverVersion, support: tr.supportsExplainAnalyze ? t('connections.explainSupported') : t('connections.explainNotSupported') })}`
                      : `❌ ${t('connections.testFail', { error: tr.error })}`
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ConnectionForm
          initial={editTarget}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
