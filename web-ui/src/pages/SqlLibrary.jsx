import { useState, useEffect, useCallback } from 'react';
import { sqlApi } from '../api/client';

const CATEGORIES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'AGGREGATE', 'COMPLEX', 'OTHER'];

function SqlForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: '', sql: '', category: 'SELECT', description: ''
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal fade-in" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{initial ? 'SQL を編集' : 'SQL を追加'}</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">名前</label>
            <input className="form-input" placeholder="ユーザー検索クエリ"
              value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">カテゴリ</label>
            <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">SQL *</label>
          <textarea className="form-textarea" rows={8}
            placeholder="SELECT * FROM users WHERE id = 1;"
            value={form.sql} onChange={e => set('sql', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">説明（任意）</label>
          <input className="form-input" placeholder="このクエリの目的..."
            value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>キャンセル</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>保存</button>
        </div>
      </div>
    </div>
  );
}

function SqlCard({ item, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card fade-in">
      <div className="card-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <span className="badge badge-blue">{item.category}</span>
            <span className="card-title truncate">{item.name || 'Unnamed'}</span>
          </div>
          {item.description && (
            <div className="card-subtitle mt-4" style={{ marginTop: 4 }}>{item.description}</div>
          )}
        </div>
        <div className="flex gap-2" style={{ flexShrink: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(e => !e)}>
            {expanded ? '▲ 閉じる' : '▼ SQL 表示'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onEdit(item)}>✏</button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(item.id)}>🗑</button>
        </div>
      </div>

      {expanded && (
        <div className="code-block fade-in">{item.sql}</div>
      )}

      <div className="flex gap-3 text-xs text-muted mt-4">
        <span>📅 {new Date(item.updatedAt).toLocaleDateString('ja-JP')}</span>
        <span>ID: {item.id}</span>
      </div>
    </div>
  );
}

export default function SqlLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await sqlApi.list({ category: filterCat || undefined, keyword: keyword || undefined });
      setItems(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [filterCat, keyword]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editTarget) await sqlApi.update(editTarget.id, form);
      else await sqlApi.create(form);
      setShowForm(false);
      setEditTarget(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('この SQL を削除しますか？')) return;
    try { await sqlApi.remove(id); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>SQL ライブラリ</h2>
          <p>テストに使用する SQL を登録・管理します</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditTarget(null); }}>
          + SQL を追加
        </button>
      </div>

      {error && <div className="alert alert-error">⚠ {error}</div>}

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex gap-3 items-center">
          <input className="form-input" style={{ maxWidth: 260 }}
            placeholder="🔍 キーワード検索..."
            value={keyword} onChange={e => setKeyword(e.target.value)} />
          <select className="form-select" style={{ maxWidth: 160 }}
            value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">すべてのカテゴリ</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <span className="text-muted text-sm">{items.length} 件</span>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <p>SQL が登録されていません。「SQL を追加」から始めてください。</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {items.map(item => (
            <SqlCard key={item.id} item={item}
              onEdit={(item) => { setEditTarget(item); setShowForm(true); }}
              onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showForm && (
        <SqlForm
          initial={editTarget}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
