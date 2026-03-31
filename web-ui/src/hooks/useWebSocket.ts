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

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const ws = new WebSocket(WS_URL);
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
        reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), delay);
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
    connect();
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
