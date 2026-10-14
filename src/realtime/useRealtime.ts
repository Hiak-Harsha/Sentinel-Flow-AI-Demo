import { useEffect, useRef } from "react";
import { realtimeClient, MessageHandler } from "./RealtimeClient";
import { useConnectionStore } from "./connectionStore";
import { WsEnvelope } from "./schemas";

/**
 * Hook to inspect the global realtime connection status
 */
export function useRealtimeConnection() {
  const status = useConnectionStore((s) => s.status);
  const lastSeq = useConnectionStore((s) => s.lastSeq);
  const latencyMs = useConnectionStore((s) => s.latencyMs);
  const reconnectAttempts = useConnectionStore((s) => s.reconnectAttempts);

  return { status, lastSeq, latencyMs, reconnectAttempts };
}

/**
 * Hook to subscribe to a specific channel (e.g. "public", "operator", "participant:xyz")
 */
export function useChannel(channel: string, handler?: (envelope: WsEnvelope) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!channel) return;

    const wrappedHandler: MessageHandler = (envelope) => {
      if (handlerRef.current) {
        handlerRef.current(envelope);
      }
    };

    const unsubscribe = realtimeClient.subscribe(channel, wrappedHandler);

    return () => {
      unsubscribe();
    };
  }, [channel]);
}

/**
 * Hook to listen for a specific event type (e.g. "alert.raised", "telemetry.tick")
 */
export function useRealtimeEvent(type: string, handler: (envelope: WsEnvelope) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!type) return;

    const wrappedHandler: MessageHandler = (envelope) => {
      if (handlerRef.current) {
        handlerRef.current(envelope);
      }
    };

    const unsubscribe = realtimeClient.on(type, wrappedHandler);

    return () => {
      unsubscribe();
    };
  }, [type]);
}
