import { useState, useEffect } from 'react';
import { connectionsApi } from '../api/client';

function ConnectionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: '', host: 'localhost', port: 3306,
    database: '', user: 'root', password: '', poolSize: 10
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{initial ? '接続を編集' : '接続を追加'}</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="form-group">
          <label className="form-label">接続名</label>
          <input className="form-input" placeholder="My MySQL Server"
            value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">ホスト *</label>
            <input className="form-input" placeholder="localhost"
              value={form.host} onChange={e => set('host', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">ポート</label>
            <input className="form-input" type="number" placeholder="3306"
              value={form.port} onChange={e => set('port', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">データベース名 *</label>
          <input className="form-input" placeholder="mydb"
            value={form.database} onChange={e => set('database', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">ユーザー *</label>
            <input className="form-input" placeholder="root"
              value={form.user} onChange={e => set('user', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">パスワード</label>
            <input className="form-input" type="password"
              value={form.password} onChange={e => set('password', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">接続プールサイズ</label>
          <input className="form-input" type="number" min="1" max="50"
            value={form.poolSize} onChange={e => set('poolSize', e.target.value)} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>キャンセル</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>保存</button>
        </div>
      </div>
    </div>
  );
}

export default function Connections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const data = await connectionsApi.list();
      setConnections(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    try {
      if (editTarget) {
        await connectionsApi.update(editTarget.id, form);
      } else {
        await connectionsApi.create(form);
      }
      setShowForm(false);
      setEditTarget(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('この接続を削除しますか？')) return;
    try { await connectionsApi.remove(id); load(); }
    catch (e) { setError(e.message); }
  };

  const handleTest = async (id) => {
    setTestResults(prev => ({ ...prev, [id]: { loading: true } }));
    try {
      const result = await connectionsApi.test(id);
      setTestResults(prev => ({ ...prev, [id]: { ok: true, ...result } }));
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, error: e.message } }));
    }
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>接続管理</h2>
          <p>MySQL 接続先を登録・管理します</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditTarget(null); }}>
          + 接続を追加
        </button>
      </div>

      {error && <div className="alert alert-error">⚠ {error}</div>}

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : connections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔌</div>
          <p>接続が登録されていません。「接続を追加」から始めてください。</p>
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
                      {tr?.loading ? <span className="spinner" /> : '🔍'} 疎通確認
                    </button>
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => { setEditTarget(conn); setShowForm(true); }}>
                      ✏ 編集
                    </button>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(conn.id)}>
                      🗑
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 text-sm text-muted">
                  <span>👤 {conn.user}</span>
                  <span>🔢 Pool: {conn.poolSize}</span>
                </div>

                {tr && !tr.loading && (
                  <div className={`alert mt-4 ${tr.ok ? 'alert-success' : 'alert-error'}`}>
                    {tr.ok
                      ? `✅ 接続成功 — MySQL ${tr.serverVersion} | EXPLAIN ANALYZE: ${tr.supportsExplainAnalyze ? '対応' : '未対応'}`
                      : `❌ 接続失敗: ${tr.error}`
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
