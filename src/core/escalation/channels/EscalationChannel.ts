/**
 * Base interface and shared types for BastionGuard escalation channels.
 * Every channel implementation MUST implement EscalationChannel.
 */

export interface EscalationMessage {
  title: string;
  service: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  confidence: number; // 0-1
  possibleCauses: string[];
  replicas?: { ready: number; desired: number };
  recentDeploy?: boolean;
  timestamp: string;
  tenantId: string;
}

export interface ChannelResult {
  success: boolean;
  channel: string;
  error?: string;
  /** Optional extra data, e.g. created Jira ticket key */
  extra?: Record<string, unknown>;
  timestamp: string;
}

export interface EscalationChannel {
  readonly name: string;
  send(message: EscalationMessage): Promise<ChannelResult>;
  healthCheck(): Promise<boolean>;
}
