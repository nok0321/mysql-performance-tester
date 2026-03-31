import { useState, useEffect } from 'react';
import { reportsApi } from '../api/client';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import type { ReportSummary, ReportDetail } from '../types';

interface TrendDataPoint {
  name: string;
  p95: number;
  p50: number;
  p99: number;
}

export default function Analytics() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [details, setDetails] = useState<ReportDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const list = await reportsApi.list();
        setReports(list);

        const recent = list.slice(0, 20);
        const dets = await Promise.all(
          recent.map(r => reportsApi.get(r.id).catch(() => null))
        );
        setDetails(dets.filter((d): d is ReportDetail => d !== null));
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  // Build P95 trend data
  const trendData: TrendDataPoint[] = details
    .filter(d => d.result?.statistics?.percentiles?.p95)
    .map((d, i) => ({
      name: d.testName || `Test ${i + 1}`,
      p95: d.result!.statistics!.percentiles!.p95!,
      p50: d.result!.statistics!.percentiles!.p50!,
      p99: d.result!.statistics!.percentiles!.p99!,
    }))
    .slice(-15);

  // Sort by highest P95
  const sorted = [...trendData].sort((a, b) => b.p95 - a.p95);

  const totalTests = reports.length;
  const singleCount = reports.filter(r => r.type === 'single').length;
  const parallelCount = reports.filter(r => r.type === 'parallel').length;
  const avgP95 = trendData.length > 0
    ? (trendData.reduce((s, d) => s + d.p95, 0) / trendData.length).toFixed(2)
    : null;

  if (loading) return <div className="empty-state"><div className="spinner spinner-lg" /></div>;
  if (reports.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">📈</div>
      <p>テストを実行するとアナリティクスが表示されます</p>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h2>アナリティクス</h2>
        <p>過去のテスト結果からトレンドと改善ポイントを分析します</p>
      </div>

      {/* Summary cards */}
      <div className="card-grid card-grid-4 mb-4">
        {[
          { label: '総テスト数', value: totalTests, unit: '件' },
          { label: '単一テスト', value: singleCount, unit: '件' },
          { label: '並列テスト', value: parallelCount, unit: '件' },
          { label: '平均 P95', value: avgP95, unit: 'ms' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value ?? '-'}<span className="stat-unit">{s.unit}</span></div>
          </div>
        ))}
      </div>

      {trendData.length > 1 && (
        <>
          {/* P95 trend */}
          <div className="card mb-4">
            <div className="card-title mb-4">📉 P95 レイテンシ トレンド</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="p50" stroke="var(--color-success)" dot={false} strokeWidth={2} name="P50 (ms)" />
                <Line type="monotone" dataKey="p95" stroke="var(--color-accent)" dot={false} strokeWidth={2} name="P95 (ms)" />
                <Line type="monotone" dataKey="p99" stroke="var(--color-warning)" dot={false} strokeWidth={2} name="P99 (ms)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Per-test P95 comparison */}
          <div className="card">
            <div className="card-title mb-4">📊 テスト別 P95 比較（高い順）</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sorted} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} unit="ms" />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} width={80} />
                <Tooltip contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6 }} />
                <Bar dataKey="p95" fill="var(--color-accent)" radius={[0, 3, 3, 0]} name="P95 (ms)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
