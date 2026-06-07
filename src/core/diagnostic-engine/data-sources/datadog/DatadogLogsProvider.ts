/**
 * DatadogLogsProvider
 * Consulta logs reales de Datadog via Logs API v2
 */

import axios from 'axios';
import {
  LogEntry,
  LogFilter,
  LogProvider,
  LogQueryResult,
  TimeRange,
} from '../types';

export interface DatadogLogsConfig {
  apiKey: string;
  appKey: string;
  site?: string; // default: 'datadoghq.com'
}

interface DatadogLogAttributes {
  timestamp: string;
  status: string;
  message: string;
  service?: string;
  host?: string;
  source?: string;
  tags?: string[];
  [key: string]: any;
}

interface DatadogLogItem {
  id: string;
  type: string;
  attributes: DatadogLogAttributes;
}

interface DatadogLogsSearchResponse {
  data: DatadogLogItem[];
  meta?: {
    page?: {
      after?: string;
      total?: number;
    };
  };
  links?: {
    next?: string;
  };
}

interface DatadogValidateResponse {
  valid: boolean;
  errors?: string[];
}

const DATADOG_STATUS_MAP: Record<string, LogEntry['level']> = {
  error: 'error',
  err: 'error',
  fatal: 'error',
  critical: 'error',
  warn: 'warn',
  warning: 'warn',
  info: 'info',
  notice: 'info',
  debug: 'debug',
  trace: 'debug',
};

export class DatadogLogsProvider implements LogProvider {
  name = 'datadog-logs';
  private client: axios.AxiosInstance;

  constructor(config: DatadogLogsConfig) {
    const site = config.site || 'datadoghq.com';

    this.client = axios.create({
      baseURL: `https://api.${site}`,
      headers: {
        'DD-API-KEY': config.apiKey,
        'DD-APPLICATION-KEY': config.appKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    console.log(
      `[DatadogLogsProvider] Initialized for site: ${site}`
    );
  }

  async queryLogs(
    filters: LogFilter,
    timeRange: TimeRange
  ): Promise<LogQueryResult> {
    const startTime = Date.now();

    console.log(
      `[DatadogLogsProvider] Querying logs for service: ${filters.service || 'all'}`
    );

    try {
      const query = this.buildQuery(filters);

      const body = {
        filter: {
          query,
          from: timeRange.start.toISOString(),
          to: timeRange.end.toISOString(),
        },
        sort: '-timestamp',
        page: {
          limit: 500,
        },
      };

      const response = await this.client.post<DatadogLogsSearchResponse>(
        '/api/v2/logs/events/search',
        body
      );

      const executionTime = Date.now() - startTime;
      const entries = (response.data.data || []).map((log) =>
        this.parseDatadogLog(log)
      );

      const total =
        response.data.meta?.page?.total ?? entries.length;

      console.log(
        `[DatadogLogsProvider] Query completed in ${executionTime}ms, ${entries.length} entries returned (total: ${total})`
      );

      return {
        entries,
        total,
        executionTime,
      };
    } catch (error) {
      console.error('[DatadogLogsProvider] Error querying logs:', error);
      throw error;
    }
  }

  async getErrorRate(service: string, timeRange: TimeRange): Promise<number> {
    console.log(
      `[DatadogLogsProvider] Calculating error rate for service: ${service}`
    );

    try {
      const errorQuery = `service:${service} status:error`;
      const totalQuery = `service:${service}`;

      const timeFilter = {
        from: timeRange.start.toISOString(),
        to: timeRange.end.toISOString(),
      };

      const [errorResponse, totalResponse] = await Promise.all([
        this.client.post<DatadogLogsSearchResponse>(
          '/api/v2/logs/events/search',
          {
            filter: { query: errorQuery, ...timeFilter },
            sort: '-timestamp',
            page: { limit: 1000 },
          }
        ),
        this.client.post<DatadogLogsSearchResponse>(
          '/api/v2/logs/events/search',
          {
            filter: { query: totalQuery, ...timeFilter },
            sort: '-timestamp',
            page: { limit: 1000 },
          }
        ),
      ]);

      const errorCount =
        errorResponse.data.meta?.page?.total ??
        (errorResponse.data.data || []).length;

      const totalCount =
        totalResponse.data.meta?.page?.total ??
        (totalResponse.data.data || []).length;

      if (totalCount === 0) {
        console.log(
          `[DatadogLogsProvider] No logs found for ${service}, error rate = 0`
        );
        return 0;
      }

      const errorRate = errorCount / totalCount;
      console.log(
        `[DatadogLogsProvider] Error rate for ${service}: ${(errorRate * 100).toFixed(2)}% (${errorCount}/${totalCount})`
      );

      return errorRate;
    } catch (error) {
      console.error(
        `[DatadogLogsProvider] Error calculating error rate for ${service}:`,
        error
      );
      return 0;
    }
  }

  async getRecentErrors(service: string, limit: number = 50): Promise<LogEntry[]> {
    console.log(
      `[DatadogLogsProvider] Getting recent errors for service: ${service}, limit: ${limit}`
    );

    try {
      const query = `status:error service:${service}`;

      const response = await this.client.post<DatadogLogsSearchResponse>(
        '/api/v2/logs/events/search',
        {
          filter: {
            query,
            from: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // última hora
            to: new Date().toISOString(),
          },
          sort: '-timestamp',
          page: {
            limit: Math.min(limit, 1000),
          },
        }
      );

      const entries = (response.data.data || [])
        .map((log) => this.parseDatadogLog(log))
        .slice(0, limit);

      console.log(
        `[DatadogLogsProvider] Found ${entries.length} recent errors for ${service}`
      );

      return entries;
    } catch (error) {
      console.error(
        `[DatadogLogsProvider] Error getting recent errors for ${service}:`,
        error
      );
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    console.log('[DatadogLogsProvider] Running health check...');

    try {
      const response = await this.client.get<DatadogValidateResponse>(
        '/api/v1/validate'
      );
      const healthy = response.status === 200;
      console.log(
        `[DatadogLogsProvider] Health check ${healthy ? 'passed' : 'failed'}: status ${response.status}`
      );
      return healthy;
    } catch (error) {
      console.error('[DatadogLogsProvider] Health check failed:', error);
      return false;
    }
  }

  /**
   * Construye la query string de Datadog a partir de los filtros internos
   */
  private buildQuery(filters: LogFilter): string {
    const parts: string[] = [];

    if (filters.service) {
      parts.push(`service:${filters.service}`);
    }

    if (filters.namespace) {
      parts.push(`kube_namespace:${filters.namespace}`);
    }

    if (filters.level && filters.level.length > 0) {
      // Mapear niveles internos a status de Datadog
      const statusParts = filters.level.map((l) => `status:${l}`);
      if (statusParts.length === 1) {
        parts.push(statusParts[0]);
      } else {
        parts.push(`(${statusParts.join(' OR ')})`);
      }
    }

    if (filters.keywords && filters.keywords.length > 0) {
      const keywordParts = filters.keywords.map((kw) => `"${kw}"`);
      parts.push(`(${keywordParts.join(' OR ')})`);
    }

    return parts.join(' ') || '*';
  }

  /**
   * Parsea un log item de Datadog v2 a LogEntry interno
   */
  private parseDatadogLog(log: DatadogLogItem): LogEntry {
    const attrs = log.attributes || {};
    const rawStatus = (attrs.status || 'info').toLowerCase();
    const level: LogEntry['level'] = DATADOG_STATUS_MAP[rawStatus] || 'info';

    return {
      timestamp: attrs.timestamp
        ? new Date(attrs.timestamp)
        : new Date(),
      service: attrs.service || 'unknown',
      level,
      message: attrs.message || '',
      fields: {
        ...attrs,
        id: log.id,
        type: log.type,
        host: attrs.host,
        source: attrs.source,
        tags: attrs.tags,
      },
      stackTrace: attrs.error?.stack || attrs.error_stack || undefined,
    };
  }
}
