/**
 * useWebSocket - WebSocket 接続管理フック
 * サーバーからのテスト進捗メッセージを受信してコールバックで通知する
 *
 * 改善点:
 * - WS_URL をポートハードコードから window.location ベースに変更
 *   （Vite dev proxy の ws プロキシ or 同一オリジン運用を想定）
 * - onMessage を ref で保持し、useCallback deps を安定させる（再接続ループ防止）
 * - 再接続にエクスポネンシャルバックオフを適用（最大 30s）
 * - subscribeTestId() を返し、テスト開始後に購読を登録できるようにする
 */
import { useEffect, useRef, useCallback } from 'react';

// Vite dev proxy の /ws パスを経由して ws://localhost:3001 に転送する。
// vite.config.js: '/ws' → 'ws://localhost:3001'
// 本番ビルド（静的配信）時も同一オリジンの /ws パスに接続する。
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws`;

const BACKOFF_BASE_MS  = 3000;
const BACKOFF_MAX_MS   = 30000;

export function useWebSocket(onMessage) {
  const wsRef             = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef        = useRef(true);
  const retryCountRef     = useRef(0);

  // onMessage を ref で保持して connect のクロージャを安定させる。
  // これにより onMessage が毎レンダー変わっても useEffect が再実行されない。
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; });

  // WS が OPEN でないときに呼ばれた subscribe を保持するキュー（M6対応）。
  // 接続確立後に flush して全て送信する。
  const pendingSubscribesRef = useRef(new Set());

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        retryCountRef.current = 0; // 接続成功でバックオフリセット
        // 接続待ちキューに溜まった subscribe を一括送信（M6対応）
        for (const testId of pendingSubscribesRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', testId }));
        }
        pendingSubscribesRef.current.clear();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          onMessageRef.current(msg);
        } catch (e) {
          console.warn('[WS] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        // エクスポネンシャルバックオフ: 3s → 6s → 12s → ... 最大 30s
        const delay = Math.min(
          BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current),
          BACKOFF_MAX_MS
        );
        retryCountRef.current += 1;
        console.log(`[WS] Disconnected. Reconnecting in ${delay}ms...`);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      console.error('[WS] Connection error:', e);
    }
  }, []); // deps なし：onMessage は ref 経由、connect 自体は不変

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  /**
   * テスト開始後にサーバーへ購読メッセージを送信する。
   * WS が OPEN でない場合はキューに積み、接続確立時に flush する（M6対応）。
   * サーバー側に60秒のターミナルイベントキャッシュがあるが、
   * キュー方式によりキャッシュ切れのリスクをさらに低減する。
   * @param {string} testId
   */
  const subscribeTestId = useCallback((testId) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', testId }));
    } else {
      // 接続待ちキューに追加
      pendingSubscribesRef.current.add(testId);
    }
  }, []);

  return { wsRef, subscribeTestId };
}
