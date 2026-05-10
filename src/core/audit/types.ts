export type AuditEntryType = "action" | "escalation" | "blocked" | "decision";

export interface AuditEntry {
  id: string;
  timestamp: string;
  tenantId: string;
  type: AuditEntryType;
  service: string;
  /** Nombre de la acción o motivo de escalación */
  label: string;
  success: boolean;
  confidence?: number;
  details?: string;
  dryRun?: boolean;
}
