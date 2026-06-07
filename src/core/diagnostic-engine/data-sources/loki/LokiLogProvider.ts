/**
 * LokiLogProvider
 * Consulta logs reales de Grafana Loki vía HTTP (LogQL)
 */

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  LogEntry,
  LogFilter,
  LogProvider,
  LogQueryResult,
  TimeRange,
} from '../types';

export interface LokiConfig {
  url?: string;
  orgId?: string;
  username?: string;
  password?: string;
}

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][]; // [timestamp_ns, log_line]
}

interface LokiQueryRangeResponse {
  status: string;
  data: {
    resultType: string;
    result: LokiStream[];
  };
}

interface LokiLabelsResponse {
  status: string;
  data: string[];
}

export class LokiLogProvider implements LogProvider {
  name = 'loki';
  private baseUrl: string;
  private orgId?: string;
  private authHeader?: string;

  constructor(config: LokiConfig = {}) {
    this.baseUrl = config.url || 'http://localhost:3100';
    this.orgId = config.orgId;

    if (config.username && config.password) {
      const creds = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      this.authHeader = `Basic ${creds}`;
    }

    console.log(`[LokiLogProvider] Initialized with URL: ${this.baseUrl}${this.orgId ? `, OrgID: ${this.orgId}` : ''}`);
  }

  // ============================================================
  // PUBLIC INTERFACE METHODS
  // ============================================================

  async queryLogs(filters: LogFilter, timeRange: TimeRange): Promise<LogQueryResult> {
    const startTime = Date.now();

    try {
      const logQL = this.buildLogQL(filters);
      const startNs = String(timeRange.start.getTime() * 1e6);
      const endNs = String(timeRange.end.getTime() * 1e6);

      console.log(`[LokiLogProvider] queryLogs — LogQL: ${logQL}, range: [${timeRange.start.toISOString()} → ${timeRange.end.toISOString()}]`);

      const params = new URLSearchParams({
        query: logQL,
        start: startNs,
        end: endNs,
        limit: '500',
        direction: 'backward',
      });

      const response = await this.get<LokiQueryRangeResponse>(
        `/loki/api/v1/query_range?${params.toString()}`
      );

      const entries: LogEntry[] = [];

      for (const stream of response.data.result) {
        for (const [tsNs, line] of stream.values) {
          entries.push(this.parseLogLine(stream.stream, line, tsNs));
        }
      }

      const executionTime = Date.now() - startTime;
      console.log(`[LokiLogProvider] queryLogs returned ${entries.length} entries in ${executionTime}ms`);

      return {
        entries,
        total: entries.length,
        executionTime,
      };
    } catch (error) {
      console.error('[LokiLogProvider] Error querying logs:', error);
      throw error;
    }
  }

  async getErrorRate(service: string, timeRange: TimeRange): Promise<number> {
    try {
      console.log(`[LokiLogProvider] getErrorRate for service: ${service}`);

      const startNs = String(timeRange.start.getTime() * 1e6);
      const endNs = String(timeRange.end.getTime() * 1e6);

      // Query para errores
      const errorQuery = `{app="${service}"} | json | level=~"error|warn"`;
      const totalQuery = `{app="${service}"}`;

      const errorParams = new URLSearchParams({
        query: errorQuery,
        start: startNs,
        end: endNs,
        limit: '5000',
        direction: 'backward',
      });

      const totalParams = new URLSearchParams({
        query: totalQuery,
        start: startNs,
        end: endNs,
        limit: '5000',
        direction: 'backward',
      });

      const [errorResponse, totalResponse] = await Promise.all([
        this.get<LokiQueryRangeResponse>(`/loki/api/v1/query_range?${errorParams.toString()}`),
        this.get<LokiQueryRangeResponse>(`/loki/api/v1/query_range?${totalParams.toString()}`),
      ]);

      const errorCount = errorResponse.data.result.reduce(
        (sum, stream) => sum + stream.values.length,
        0
      );
      const totalCount = totalResponse.data.result.reduce(
        (sum, stream) => sum + stream.values.length,
        0
      );

      if (totalCount === 0) {
        console.log(`[LokiLogProvider] getErrorRate: no logs found for ${service}, returning 0`);
        return 0;
      }

      const rate = errorCount / totalCount;
      console.log(`[LokiLogProvider] getErrorRate for ${service}: ${errorCount}/${totalCount} = ${rate.toFixed(4)}`);
      return rate;
    } catch (error) {
      console.error(`[LokiLogProvider] Error calculating error rate for ${service}:`, error);
      return 0;
    }
  }

  async getRecentErrors(service: string, limit: number = 50): Promise<LogEntry[]> {
    try {
      console.log(`[LokiLogProvider] getRecentErrors for service: ${service}, limit: ${limit}`);

      const endNs = String(Date.now() * 1e6);
      const startNs = String((Date.now() - 60 * 60 * 1000) * 1e6); // última hora

      const query = `{app="${service}"} | json | level="error"`;
      const params = new URLSearchParams({
        query,
        start: startNs,
        end: endNs,
        limit: String(limit),
        direction: 'backward',
      });

      const response = await this.get<LokiQueryRangeResponse>(
        `/loki/api/v1/query_range?${params.toString()}`
      );

      const entries: LogEntry[] = [];

      for (const stream of response.data.result) {
        for (const [tsNs, line] of stream.values) {
          entries.push(this.parseLogLine(stream.stream, line, tsNs));
          if (entries.length >= limit) break;
        }
        if (entries.length >= limit) break;
      }

      console.log(`[LokiLogProvider] getRecentErrors: found ${entries.length} errors for ${service}`);
      return entries;
    } catch (error) {
      console.error(`[LokiLogProvider] Error getting recent errors for ${service}:`, error);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      console.log('[LokiLogProvider] Running health check...');
      await this.get<LokiLabelsResponse>('/loki/api/v1/labels');
      console.log('[LokiLogProvider] Health check passed');
      return true;
    } catch (error) {
      console.error('[LokiLogProvider] Health check failed:', error);
      return false;
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Construye una query LogQL a partir de los filtros proporcionados
   */
  private buildLogQL(filters: LogFilter): string {
    const service = filters.service || '*';
    let query = `{app="${service}"}`;

    // Filtrar por keywords con pipe line filter
    if (filters.keywords && filters.keywords.length > 0) {
      for (const keyword of filters.keywords) {
        query += ` |= "${keyword}"`;
      }
    }

    // Filtrar por nivel usando json parser
    if (filters.level && filters.level.length > 0) {
      const levelPattern = filters.level.join('|');
      query += ` | json | level=~"${levelPattern}"`;
    }

    console.log(`[LokiLogProvider] Built LogQL: ${query}`);
    return query;
  }

  /**
   * Parsea un stream de Loki a una LogEntry tipada
   */
  parseLogLine(
    stream: Record<string, string>,
    line: string,
    tsNs: string
  ): LogEntry {
    const timestamp = new Date(parseInt(tsNs) / 1e6);
    const service = stream['app'] || stream['service'] || stream['job'] || 'unknown';

    // Intentar parsear el JSON del log line para extraer campos
    let fields: Record<string, unknown> = { ...stream };
    let message = line;
    let level: LogEntry['level'] = 'info';
    let stackTrace: string | undefined;

    try {
      const parsed = JSON.parse(line);
      message = parsed.message || parsed.msg || parsed.log || line;

      // Normalizar nivel
      const rawLevel = (parsed.level || parsed.severity || stream['level'] || 'info').toLowerCase();
      level = this.normalizeLevel(rawLevel);

      // Stack trace si existe
      if (parsed.stack || parsed.stackTrace || parsed.stack_trace) {
        stackTrace = parsed.stack || parsed.stackTrace || parsed.stack_trace;
      }

      fields = { ...stream, ...parsed };
    } catch {
      // Line is not JSON — usar como mensaje directo
      message = line;
      // Intentar inferir nivel desde stream labels
      const rawLevel = stream['level'] || stream['severity'] || 'info';
      level = this.normalizeLevel(rawLevel);
    }

    return {
      timestamp,
      service,
      level,
      message,
      fields: fields as Record<string, string>,
      stackTrace,
    };
  }

  /**
   * Normaliza un string de nivel a los valores válidos de LogEntry
   */
  private normalizeLevel(raw: string): LogEntry['level'] {
    const lower = raw.toLowerCase();
    if (lower === 'error' || lower === 'err' || lower === 'fatal' || lower === 'critical') {
      return 'error';
    }
    if (lower === 'warn' || lower === 'warning') {
      return 'warn';
    }
    if (lower === 'debug' || lower === 'trace' || lower === 'verbose') {
      return 'debug';
    }
    return 'info';
  }

  /**
   * HTTP GET helper usando el módulo nativo de Node.js
   * Soporta http y https automáticamente
   */
  private get<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const fullUrl = new URL(path, this.baseUrl);
      const isHttps = fullUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: fullUrl.hostname,
        port: fullUrl.port || (isHttps ? 443 : 80),
        path: fullUrl.pathname + fullUrl.search,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      };

      // Añadir OrgID header si está configurado (multi-tenancy)
      if (this.orgId && options.headers) {
        (options.headers as Record<string, string>)['X-Scope-OrgID'] = this.orgId;
      }

      // Añadir auth header si hay credenciales
      if (this.authHeader && options.headers) {
        (options.headers as Record<string, string>)['Authorization'] = this.authHeader;
      }

      const req = transport.request(options, (res) => {
        let data = '';

        res.on('data', (chunk: string) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Loki HTTP ${res.statusCode}: ${data}`));
              return;
            }
            resolve(JSON.parse(data) as T);
          } catch (parseError) {
            reject(new Error(`Failed to parse Loki response: ${parseError}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Loki request failed: ${err.message}`));
      });

      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Loki request timed out after 30s'));
      });

      req.end();
    });
  }
}
