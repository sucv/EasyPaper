import { useEffect, useRef, useCallback, useState } from 'react';
import ReconnectingWebSocket from 'reconnecting-websocket';
import type { WsEvent, BusyState } from '../types';

export function useWebSocket(projectId: string | null) {
  const wsRef = useRef<ReconnectingWebSocket | null>(null);
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);
  const [busyState, setBusyState] = useState<BusyState>({ busy: false, operation: null, idea_slug: null });
  const listenersRef = useRef<((e: WsEvent) => void)[]>([]);

  useEffect(() => {
    if (!projectId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws/${projectId}`;
    const ws = new ReconnectingWebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (msg: MessageEvent) => {
      try {
        const event: WsEvent = JSON.parse(msg.data);
        setLastEvent(event);
        if (event.type === 'busy_state') {
          setBusyState({ busy: event.busy, operation: event.operation, idea_slug: event.idea_slug });
        }
        listenersRef.current.forEach((fn) => fn(event));
      } catch {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId]);

  const addListener = useCallback((fn: (e: WsEvent) => void) => {
    listenersRef.current.push(fn);
    return () => {
      listenersRef.current = listenersRef.current.filter((f) => f !== fn);
    };
  }, []);

  return { lastEvent, busyState, addListener };
}