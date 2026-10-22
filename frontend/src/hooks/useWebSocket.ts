import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type MetricsHistory,
  type SystemState,
  emptySystemState,
  generateSampleState,
} from '../types';

const MAX_HISTORY = 120; // 120 seconds of buffered history

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseWebSocketReturn {
  state: SystemState;
  history: MetricsHistory[];
  status: ConnectionStatus;
  send: (msg: Record<string, unknown>) => void;
  isSample: boolean;
}

export function useWebSocket(
  url = 'ws://localhost:8000/ws/live',
): UseWebSocketReturn {
  const [state, setState] = useState<SystemState>(emptySystemState());
  const [history, setHistory] = useState<MetricsHistory[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isSample, setIsSample] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sampleElapsedRef = useRef(0);

  const appendHistory = useCallback(
    (sys: SystemState) => {
      const entry: MetricsHistory = {
        timestamp: Date.now(),
        elapsed: sys.elapsed_seconds,
        voip: sys.metrics.voip,
        video: sys.metrics.video,
        web: sys.metrics.web,
        bulk: sys.metrics.bulk,
        jain_index: sys.jain_fairness_index,
        utilization: sys.bottleneck_utilization,
      };
      setHistory((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });
    },
    [],
  );

  const startSampleMode = useCallback(() => {
    setIsSample(true);
    setStatus('connected');
    sampleElapsedRef.current = 0;

    const tick = () => {
      sampleElapsedRef.current += 1;
      const sample = generateSampleState(sampleElapsedRef.current);
      setState(sample);
      appendHistory(sample);
    };
    tick(); // initial
    sampleTimerRef.current = setInterval(tick, 1000);
  }, [appendHistory]);

  const stopSampleMode = useCallback(() => {
    if (sampleTimerRef.current) {
      clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    setIsSample(false);
  }, []);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        retryRef.current = 0;
        stopSampleMode();
        setIsSample(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SystemState;
          setState(data);
          appendHistory(data);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;
        const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
        retryRef.current += 1;
        timerRef.current = setTimeout(() => {
          // After 3 failed attempts, fall back to sample data
          if (retryRef.current > 3) {
            startSampleMode();
          } else {
            connect();
          }
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // If WebSocket construction fails, start sample mode
      setStatus('disconnected');
      if (retryRef.current > 1) {
        startSampleMode();
      } else {
        retryRef.current += 1;
        timerRef.current = setTimeout(connect, 2000);
      }
    }
  }, [url, appendHistory, startSampleMode, stopSampleMode]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (timerRef.current) clearTimeout(timerRef.current);
      stopSampleMode();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { state, history, status, send, isSample };
}
