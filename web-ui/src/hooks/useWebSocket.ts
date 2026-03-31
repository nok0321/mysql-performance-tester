/**
 * useWebSocket - WebSocket connection management hook
 * Receives test progress messages from the server and notifies via callback
 */
import { useEffect, useRef, useCallback } from 'react';
import type { WsMessage } from '../types';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws`;

const BACKOFF_BASE_MS = 3000;
const BACKOFF_MAX_MS = 30000;

type WsMessageHandler = (msg: WsMessage) => void;

export function useWebSocket(onMessage: WsMessageHandler): {
  wsRef: React.RefObject<WebSocket | null>;
  subscribeTestId: (testId: string) => void;
} {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(true);
  const retryCountRef = useRef<number>(0);

  const onMessageRef = useRef<WsMessageHandler>(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; });

  const pendingSubscribesRef = useRef<Set<string>>(new Set());
  const connectRef = useRef<(() => void) | null>(null);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      // Fetch a one-time authentication token before opening the WebSocket
      let wsUrl = WS_URL;
      try {
        const res = await fetch('/api/ws-token');
        if (res.ok) {
          const data = (await res.json()) as { success: boolean; token: string };
          if (data.success && data.token) {
            const separator = WS_URL.includes('?') ? '&' : '?';
            wsUrl = `${WS_URL}${separator}token=${data.token}`;
          }
        }
      } catch {
        // Token fetch failed — attempt connection without token (localhost dev fallback)
        console.warn('[WS] Failed to fetch auth token, connecting without token');
      }

      if (!mountedRef.current) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        retryCountRef.current = 0;
        for (const testId of pendingSubscribesRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', testId }));
        }
        pendingSubscribesRef.current.clear();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WsMessage = JSON.parse(event.data as string);
          onMessageRef.current(msg);
        } catch (e) {
          console.warn('[WS] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        const delay = Math.min(
          BACKOFF_BASE_MS * Math.pow(2, retryCountRef.current),
          BACKOFF_MAX_MS
        );
        retryCountRef.current += 1;
        console.log(`[WS] Disconnected. Reconnecting in ${delay}ms...`);
        reconnectTimerRef.current = setTimeout(() => { void connectRef.current?.(); }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      console.error('[WS] Connection error:', e);
    }
  }, []);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    void connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribeTestId = useCallback((testId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', testId }));
    } else {
      pendingSubscribesRef.current.add(testId);
    }
  }, []);

  return { wsRef, subscribeTestId };
}
