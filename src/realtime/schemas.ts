import { z } from "zod";

/**
 * Zod Schemas for Sentinel Flow WebSocket Protocol v1
 */

export const ProvenanceEnum = z.enum(["live", "replay", "simulated"]);

export const WsEnvelopeSchema = z.object({
  v: z.number().default(1),
  type: z.string(),
  channel: z.string().optional(),
  seq: z.number().optional(),
  ts: z.string().optional(),
  provenance: ProvenanceEnum.optional().default("live"),
  data: z.record(z.string(), z.any()).default({}),
});

export type WsEnvelope = z.infer<typeof WsEnvelopeSchema>;

// Telemetry Tick Payload
export const TelemetryTickDataSchema = z.object({
  requests_per_sec: z.number().default(0),
  active_devices: z.number().default(0),
  threat_level: z.string().default("LOW"),
  pipeline_lag_ms: z.number().optional().default(0),
  events_per_sec: z.number().optional().default(0),
});

export type TelemetryTickData = z.infer<typeof TelemetryTickDataSchema>;

// Alert Payload
export const AlertDataSchema = z.object({
  alert_id: z.string().optional(),
  id: z.string().optional(),
  incident_id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  severity: z.string().default("LOW"),
  identity_id: z.string().optional(),
  threat_score: z.number().optional(),
  confidence: z.number().optional(),
  mitre_techniques: z.array(z.string()).optional().default([]),
  evidence: z.array(z.any()).optional().default([]),
  status: z.string().default("ACTIVE"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type AlertData = z.infer<typeof AlertDataSchema>;

// System Health Payload
export const SystemHealthDataSchema = z.object({
  status: z.string().default("ok"),
  events_per_sec: z.number().default(0),
  queue_lag: z.number().default(0),
  p95_latency_ms: z.number().default(0),
  db_alive: z.boolean().default(true),
  model_loaded: z.boolean().default(true),
  active_subscribers: z.number().default(0),
});

export type SystemHealthData = z.infer<typeof SystemHealthDataSchema>;

// Assessment Update Payload
export const AssessmentDataSchema = z.object({
  identity_id: z.string(),
  threat_score: z.number().default(0),
  threat_level: z.string().default("LOW"),
  confidence: z.number().default(0),
  features: z.record(z.string(), z.any()).optional(),
  baseline_maturity: z.string().optional(),
  reasons: z.array(z.string()).optional().default([]),
});

export type AssessmentData = z.infer<typeof AssessmentDataSchema>;
