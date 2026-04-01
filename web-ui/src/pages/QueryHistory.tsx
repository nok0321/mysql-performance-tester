/**
 * QueryHistory - Timeline view for the same query across multiple test runs.
 * Supports event annotations (e.g., index added) and before/after comparison.
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { historyApi } from '../api/client';
import TimelineChart from '../components/TimelineChart';
import EventForm from '../components/EventForm';
import DeltaSummaryBar from '../components/DeltaSummaryBar';
import type {
  QueryFingerprintSummary,
  QueryTimeline,
  HistoryComparison,
  QueryEventType,
} from '../types';

export default function QueryHistory() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fingerprints, setFingerprints] = useState<QueryFingerprintSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFp, setSelectedFp] = useState<string | null>(searchParams.get('q'));
  const [timeline, setTimeline] = useState<QueryTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState('');

  // Before/After comparison state
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [comparison, setComparison] = useState<HistoryComparison | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // SQL display toggle
  const [showSql, setShowSql] = useState(false);

  // Load fingerprint list
  useEffect(() => {
    historyApi.fingerprints()
      .then(data => { setFingerprints(data); setLoading(false); })
      .catch(e => { setError((e as Error).message); setLoading(false); });
  }, []);

  // Load timeline when selected
  const loadTimeline = useCallback(async (fp: string) => {
    setSelectedFp(fp);
    setSearchParams({ q: fp });
    setTimeline(null);
    setComparison(null);
    setBeforeId('');
    setAfterId('');
    setTimelineLoading(true);
    try {
      const data = await historyApi.timeline(fp);
      setTimeline(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTimelineLoading(false);
    }
  }, [setSearchParams]);

  // Auto-load timeline from URL param
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !timeline && !timelineLoading) {
      loadTimeline(q);
    }
  }, [searchParams, timeline, timelineLoading, loadTimeline]);

  // Add event handler
  const handleAddEvent = async (data: { label: string; type: QueryEventType; timestamp: string }) => {
    if (!selectedFp) return;
    await historyApi.createEvent({ queryFingerprint: selectedFp, ...data });
    // Reload timeline
    await loadTimeline(selectedFp);
  };

  // Delete event handler
  const handleDeleteEvent = async (id: string) => {
    await historyApi.deleteEvent(id);
    if (selectedFp) await loadTimeline(selectedFp);
  };

  // Compare handler
  const handleCompare = async () => {
    if (!selectedFp || !beforeId || !afterId) return;
    setCompareLoading(true);
    setComparison(null);
    try {
      const data = await historyApi.compare(selectedFp, beforeId, afterId);
      setComparison(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCompareLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>

      {/* Left panel: fingerprint list */}
      <div>
        <div className="section-title">{t('history.fingerprintTitle')}</div>
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : fingerprints.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p>{t('history.emptyFingerprints')}</p>
            <p className="text-xs text-muted">{t('history.emptyHint')}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {fingerprints.map(fp => (
              <div
                key={fp.queryFingerprint}
                className="card"
                style={{
                  cursor: 'pointer',
                  border: selectedFp === fp.queryFingerprint ? '1px solid var(--color-accent)' : undefined,
                }}
                onClick={() => loadTimeline(fp.queryFingerprint)}
              >
                <div className="text-sm truncate" style={{ fontWeight: 500, marginBottom: 4 }}>
                  {fp.latestTestName || fp.queryFingerprint}
                </div>
                <div className="text-xs text-muted" style={{ fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                  {fp.queryText.length > 60 ? fp.queryText.slice(0, 60) + '...' : fp.queryText}
                </div>
                <div className="flex items-center gap-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  <span>{t('history.runs', { count: fp.runCount })}</span>
                  <span>|</span>
                  <span>{new Date(fp.latestRunAt).toLocaleDateString('ja-JP')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right panel: timeline detail */}
      <div>
        {!selectedFp ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p>{t('history.selectQuery')}</p>
          </div>
        ) : timelineLoading ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : timeline ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>

            {/* SQL text (collapsible) */}
            <div className="card">
              <div
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setShowSql(!showSql)}
              >
                <div className="section-title" style={{ margin: 0 }}>{t('history.sqlSection')}</div>
                <span className="text-xs text-muted">{showSql ? `▲ ${t('history.hide')}` : `▼ ${t('history.show')}`}</span>
              </div>
              {showSql && (
                <pre style={{
                  marginTop: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: 'var(--color-surface-2)',
                  borderRadius: 6,
                  fontSize: 'var(--text-xs)',
                  overflow: 'auto',
                  maxHeight: 200,
                }}>{timeline.queryText}</pre>
              )}
            </div>

            {/* Timeline chart */}
            <div className="card">
              <div className="section-title">{t('history.timelineTitle', { count: timeline.entries.length })}</div>
              <TimelineChart entries={timeline.entries} events={timeline.events} />
            </div>

            {/* Event annotations */}
            <div className="card">
              <div className="section-title">{t('history.eventsTitle')}</div>
              {timeline.events.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <table style={{ width: '100%', fontSize: 'var(--text-xs)' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('history.eventLabel')}</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('history.eventType')}</th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('history.eventTimestamp')}</th>
                        <th style={{ padding: '4px 8px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.events.map(ev => (
                        <tr key={ev.id}>
                          <td style={{ padding: '4px 8px' }}>{ev.label}</td>
                          <td style={{ padding: '4px 8px' }}>
                            <span className="badge badge-blue">{ev.type.replace('_', ' ')}</span>
                          </td>
                          <td style={{ padding: '4px 8px' }}>{new Date(ev.timestamp).toLocaleString('ja-JP')}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                            <button
                              className="btn btn-sm"
                              style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                              onClick={() => handleDeleteEvent(ev.id)}
                            >
                              {t('common.delete')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <EventForm queryFingerprint={selectedFp} onSubmit={handleAddEvent} />
            </div>

            {/* Before/After comparison */}
            {timeline.entries.length >= 2 && (
              <div className="card">
                <div className="section-title">{t('history.beforeAfter')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 'var(--space-2)', alignItems: 'end', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <label className="form-label">{t('history.before')}</label>
                    <select className="form-input" value={beforeId} onChange={e => setBeforeId(e.target.value)}>
                      <option value="">-- {t('common.select')} --</option>
                      {timeline.entries.map(e => (
                        <option key={e.testId} value={e.testId}>
                          {new Date(e.timestamp).toLocaleString('ja-JP')} ({e.testName})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">{t('history.after')}</label>
                    <select className="form-input" value={afterId} onChange={e => setAfterId(e.target.value)}>
                      <option value="">-- {t('common.select')} --</option>
                      {timeline.entries.map(e => (
                        <option key={e.testId} value={e.testId}>
                          {new Date(e.timestamp).toLocaleString('ja-JP')} ({e.testName})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={!beforeId || !afterId || beforeId === afterId || compareLoading}
                    onClick={handleCompare}
                  >
                    {compareLoading ? '...' : t('history.compare')}
                  </button>
                </div>

                {comparison?.delta && (
                  <DeltaSummaryBar delta={comparison.delta} nameA={t('history.before')} nameB={t('history.after')} />
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
