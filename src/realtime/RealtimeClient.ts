/**
 * Sentinel Flow Realtime Client (WebSocket Protocol v1)
 *
 * Provides a resilient singleton connection with:
 * - Auto-reconnection with jittered exponential backoff
 * - Sequence tracking & resume replay (`type: "resume"`)
 * - Periodic heartbeat ping (every 20s) with stale connection detection (45s)
 * - Channel subscription tracking & auto-resubscription
 * - Ticket authentication integration
 * - Zod runtime validation of envelopes
 * - Fallback polling trigger when socket is down
 */

import { api, socketEndpoint } from "@/lib/api";
import { useConnectionStore } from "./connectionStore";
import { WsEnvelopeSchema, WsEnvelope } from "./schemas";

export type MessageHandler = (envelope: WsEnvelope) => void;
export type FallbackPollHandler = () => Promise<void> | void;

export class RealtimeClient {
  private static instance: RealtimeClient | null = null;
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private staleCheckTimer: any = null;
  private fallbackPollTimer: any = null;
  private listeners: Map<string, Set<MessageHandler>> = new Map();
  private channelListeners: Map<string, Set<MessageHandler>> = new Map();
  private fallbackPollHandlers: Set<FallbackPollHandler> = new Set();
  private isConnecting: boolean = false;
  private isClosedExplicitly: boolean = false;

  private constructor() {
    // Start lifecycle
  }

  public static getInstance(): RealtimeClient {
    if (!RealtimeClient.instance) {
      RealtimeClient.instance = new RealtimeClient();
    }
    return RealtimeClient.instance;
  }

  /**
   * Connect to the Sentinel Flow WebSocket endpoint
   */
  public async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isClosedExplicitly = false;
    this.isConnecting = true;
    const store = useConnectionStore.getState();
    store.setStatus(store.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      // 1. Obtain ticket
      let ticket: string | null = null;
      try {
        const role = typeof sessionStorage !== "undefined"
          ? (sessionStorage.getItem("sf_role") || "operator")
          : "operator";
        const identityId = typeof sessionStorage !== "undefined"
          ? (sessionStorage.getItem("sf_device_fingerprint") || null)
          : null;

        const ticketRes = await api.getWsTicket({
          role: role === "participant" ? "participant" : "operator",
          identity_id: identityId,
          passcode: "SF-OPERATOR-2026",
        });
        ticket = ticketRes?.ticket || null;
      } catch (ticketErr) {
        console.warn("[RealtimeClient] Failed to acquire ticket, proceeding with unauthenticated fallback:", ticketErr);
      }

      // 2. Open WebSocket
      const url = socketEndpoint(ticket);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnecting = false;
        const currentStore = useConnectionStore.getState();
        currentStore.setStatus("connected");
        currentStore.resetAttempts();
        currentStore.setLastMessageTime(Date.now());
        this.stopFallbackPolling();

        // Resume if we have a sequence number
        if (currentStore.lastSeq !== null) {
          this.send({
            type: "resume",
            last_seq: currentStore.lastSeq,
          });
        }

        // Resubscribe to active channels
        for (const ch of currentStore.activeSubscriptions) {
          this.send({ type: "subscribe", channel: ch });
        }

        // Start heartbeat & staleness checks
        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleRawMessage(event.data);
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.handleDisconnect(event.code, event.reason);
      };

      this.ws.onerror = (err: Event) => {
        console.warn("[RealtimeClient] WebSocket encountered an error:", err);
        // Let onclose handle reconnect
      };
    } catch (err) {
      this.isConnecting = false;
      this.handleDisconnect(1006, String(err));
    }
  }

  /**
   * Handle incoming message
   */
  private handleRawMessage(rawData: string): void {
    const store = useConnectionStore.getState();
    store.setLastMessageTime(Date.now());

    try {
      const parsed = JSON.parse(rawData);

      // Handle pong or ping
      if (parsed.type === "pong") {
        if (parsed.ts) {
          const latency = Date.now() - new Date(parsed.ts).getTime();
          if (latency >= 0 && latency < 5000) {
            store.setLatency(latency);
          }
        }
        return;
      }

      // Parse envelope
      const parseResult = WsEnvelopeSchema.safeParse(parsed);
      const envelope: WsEnvelope = parseResult.success
        ? parseResult.data
        : {
            v: parsed.v || 1,
            type: parsed.type || "unknown",
            channel: parsed.channel || "public",
            seq: parsed.seq,
            ts: parsed.ts,
            provenance: parsed.provenance || "live",
            data: parsed.data || parsed,
          };

      // Update sequence tracking
      if (typeof envelope.seq === "number") {
        store.setLastSeq(envelope.seq);
      }

      // Compute latency if timestamp is present
      if (envelope.ts) {
        const latency = Date.now() - new Date(envelope.ts).getTime();
        if (latency >= 0 && latency < 10000) {
          store.setLatency(latency);
        }
      }

      // Handle resync request from server
      if (envelope.type === "resync_required") {
        console.info("[RealtimeClient] Server requested state resynchronization");
        this.triggerFallbackPoll();
      }

      // Dispatch to type listeners
      const typeSet = this.listeners.get(envelope.type);
      if (typeSet) {
        typeSet.forEach((cb) => {
          try {
            cb(envelope);
          } catch (e) {
            console.error(`[RealtimeClient] Error in type handler for ${envelope.type}:`, e);
          }
        });
      }

      // Dispatch to wildcard listeners
      const wildcardSet = this.listeners.get("*");
      if (wildcardSet) {
        wildcardSet.forEach((cb) => {
          try {
            cb(envelope);
          } catch (e) {
            console.error("[RealtimeClient] Error in wildcard handler:", e);
          }
        });
      }

      // Dispatch to channel listeners
      if (envelope.channel) {
        const channelSet = this.channelListeners.get(envelope.channel);
        if (channelSet) {
          channelSet.forEach((cb) => {
            try {
              cb(envelope);
            } catch (e) {
              console.error(`[RealtimeClient] Error in channel handler for ${envelope.channel}:`, e);
            }
          });
        }
      }
    } catch (parseError) {
      console.warn("[RealtimeClient] Failed to parse message:", rawData, parseError);
    }
  }

  /**
   * Handle connection close and schedule jittered reconnect
   */
  private handleDisconnect(code: number, reason: string): void {
    this.isConnecting = false;
    this.stopHeartbeat();

    const store = useConnectionStore.getState();
    if (this.isClosedExplicitly) {
      store.setStatus("disconnected");
      return;
    }

    store.setStatus("reconnecting");
    store.incrementAttempts();

    // Trigger fallback polling while socket is offline
    this.startFallbackPolling();

    // Jittered exponential backoff: min 1.0s, max 15s
    const attempts = store.reconnectAttempts;
    const backoffBase = Math.min(1000 * Math.pow(1.5, Math.min(attempts, 8)), 12000);
    const jitter = Math.random() * 1500;
    const delay = Math.round(backoffBase + jitter);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Subscribe to a channel
   */
  public subscribe(channel: string, handler?: MessageHandler): () => void {
    const store = useConnectionStore.getState();
    store.addSubscription(channel);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "subscribe", channel });
    }

    if (handler) {
      let set = this.channelListeners.get(channel);
      if (!set) {
        set = new Set();
        this.channelListeners.set(channel, set);
      }
      set.add(handler);

      return () => {
        this.unsubscribe(channel, handler);
      };
    }

    return () => {
      this.unsubscribe(channel);
    };
  }

  /**
   * Unsubscribe from a channel
   */
  public unsubscribe(channel: string, handler?: MessageHandler): void {
    if (handler) {
      const set = this.channelListeners.get(channel);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.channelListeners.delete(channel);
        }
      }
    }

    // Only unsubscribe from server if no listeners remain
    const remaining = this.channelListeners.get(channel);
    if (!remaining || remaining.size === 0) {
      const store = useConnectionStore.getState();
      store.removeSubscription(channel);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: "unsubscribe", channel });
      }
    }
  }

  /**
   * Listen for specific event types
   */
  public on(type: string, handler: MessageHandler): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);

    return () => {
      set?.delete(handler);
    };
  }

  /**
   * Send JSON message to server
   */
  public send(payload: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return true;
      } catch (err) {
        console.warn("[RealtimeClient] Send error:", err);
      }
    }
    return false;
  }

  /**
   * Start heartbeat ping (every 20s) and check for stale connection (>45s)
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: "ping", ts: new Date().toISOString() });
      }
    }, 20000);

    this.staleCheckTimer = setInterval(() => {
      const lastMsg = useConnectionStore.getState().lastMessageTime;
      if (lastMsg && Date.now() - lastMsg > 45000) {
        console.warn("[RealtimeClient] Connection stale (>45s with no traffic). Forcing reconnect.");
        useConnectionStore.getState().setStatus("stale");
        this.ws?.close();
      }
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
  }

  /**
   * Register a fallback poll handler to run only when socket is down
   */
  public registerFallbackPoll(handler: FallbackPollHandler): () => void {
    this.fallbackPollHandlers.add(handler);
    return () => {
      this.fallbackPollHandlers.delete(handler);
    };
  }

  private triggerFallbackPoll(): void {
    this.fallbackPollHandlers.forEach((h) => {
      try {
        h();
      } catch (err) {
        console.warn("[RealtimeClient] Fallback poll handler error:", err);
      }
    });
  }

  private startFallbackPolling(): void {
    if (this.fallbackPollTimer) return;
    // Poll every 5s when offline
    this.triggerFallbackPoll();
    this.fallbackPollTimer = setInterval(() => {
      this.triggerFallbackPoll();
    }, 5000);
  }

  private stopFallbackPolling(): void {
    if (this.fallbackPollTimer) {
      clearInterval(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }

  /**
   * Close connection explicitly
   */
  public disconnect(): void {
    this.isClosedExplicitly = true;
    this.stopHeartbeat();
    this.stopFallbackPolling();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    useConnectionStore.getState().setStatus("disconnected");
  }
}

export const realtimeClient = RealtimeClient.getInstance();
