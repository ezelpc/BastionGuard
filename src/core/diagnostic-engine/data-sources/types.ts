/**
 * Data Source Interfaces - Abstraction layer para consultar datos reales
 * Esto permite que DiagnosticEngine sea agnóstico a proveedores específicos
 */

export interface TimeRange {
  start: Date;
  end: Date;
  step?: string; // ej: '15s', '1m', '5m'
}

export interface MetricPoint {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

export interface MetricTimeseries {
  name: string;
  labels: Record<string, string>;
  points: MetricPoint[];
}

export interface MetricData {
  query: string;
  result: MetricTimeseries[];
  executionTime: number;
}

export interface LogEntry {
  timestamp: Date;
  service: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
  stackTrace?: string;
}

export interface LogQueryResult {
  entries: LogEntry[];
  total: number;
  executionTime: number;
}

export interface Replica {
  desired: number;
  ready: number;
  updated?: number;
  available?: number;
}

export interface ServiceStatusSnapshot {
  name: string;
  namespace?: string;
  replicas: Replica;
  cpuPercent?: number;
  memoryPercent?: number;
  recentDeploy: boolean;
  deployedAt?: string;
  restartCount: number;
  status: 'Running' | 'Pending' | 'Failed' | 'Unknown';
  lastUpdate: Date;
}

export interface Deployment {
  name: string;
  timestamp: Date;
  version?: string;
  image?: string;
  replicas: number;
  changedBy?: string;
}

export interface ServiceDependency {
  name: string;
  status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  latency?: number; // ms
  errorRate?: number; // 0-1
}

// ============================================================
// INTERFACES DE PROVIDERS
// ============================================================

/**
 * MetricsProvider: Consulta métricas en tiempo real
 */
export interface MetricsProvider {
  name: string;

  /**
   * Consulta una métrica puntual
   */
  queryMetric(
    query: string,
    timeRange: TimeRange
  ): Promise<MetricData>;

  /**
   * Consulta series de tiempo (para gráficos)
   */
  queryTimeseries(
    query: string,
    timeRange: TimeRange
  ): Promise<MetricTimeseries[]>;

  /**
   * Metrics disponibles por servicio (discovery)
   */
  getAvailableMetrics(service?: string): Promise<string[]>;

  /**
   * Health check del provider
   */
  healthCheck(): Promise<boolean>;
}

/**
 * LogProvider: Consulta logs
 */
export interface LogProvider {
  name: string;

  /**
   * Query logs con filtros
   */
  queryLogs(
    filters: LogFilter,
    timeRange: TimeRange
  ): Promise<LogQueryResult>;

  /**
   * Error rate en un período
   */
  getErrorRate(
    service: string,
    timeRange: TimeRange
  ): Promise<number>; // 0-1

  /**
   * Logs de error recientes
   */
  getRecentErrors(
    service: string,
    limit: number
  ): Promise<LogEntry[]>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}

export interface LogFilter {
  service?: string;
  level?: LogEntry['level'][];
  keywords?: string[];
  namespace?: string;
}

/**
 * StateProvider: Estado actual de servicios
 */
export interface StateProvider {
  name: string;

  /**
   * Status de un servicio ahora
   */
  getServiceStatus(
    serviceName: string,
    namespace?: string
  ): Promise<ServiceStatusSnapshot>;

  /**
   * Historial de deployments
   */
  getDeploymentHistory(
    serviceName: string,
    limit: number
  ): Promise<Deployment[]>;

  /**
   * Servicios que dependen de este
   */
  getDependencies(
    serviceName: string
  ): Promise<ServiceDependency[]>;

  /**
   * Buscar servicios por label/tag
   */
  findServicesByLabel(
    label: string,
    value: string
  ): Promise<string[]>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}

/**
 * CacheService: Cache de queries para no sobrecargar
 */
export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Factory para seleccionar providers por configuración
 */
export interface ProvidersConfig {
  metrics: {
    type: 'prometheus' | 'datadog' | 'cloudwatch' | 'newrelic';
    config: Record<string, any>;
  };
  logs: {
    type: 'elasticsearch' | 'cloudwatch' | 'loki' | 'newrelic';
    config: Record<string, any>;
  };
  state: {
    type: 'kubernetes' | 'ecs' | 'docker-swarm';
    config: Record<string, any>;
  };
}
