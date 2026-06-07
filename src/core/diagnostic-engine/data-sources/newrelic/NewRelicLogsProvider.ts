/**
 * NewRelicLogsProvider
 * Consulta logs reales de New Relic vía NerdGraph GraphQL API
 */

import axios from 'axios';
import {
  LogEntry,
  LogFilter,
  LogProvider,
  LogQueryResult,
  TimeRange,
} from '../types';

export interface NewRelicLogsConfig {
  apiKey: string;
  accountId: string;
  region?: 'US' | 'EU';
}

interface NerdGraphResponse<T> {
  data: T;
  errors?: Array<{ message: string; locations?: any[]; path?: string[] }>;
}

interface NrqlResult {
  results: Array<Record<string, any>>;
}

interface NerdGraphNrqlData {
  actor: {
    account: {
      nrql: NrqlResult;
    };
  };
}

export class NewRelicLogsProvider implements LogProvider {
  name = 'newrelic-logs';
  private apiKey: string;
  private accountId: string;
  private baseURL: string;
  private client: ReturnType<typeof axios.create>;

  constructor(config: NewRelicLogsConfig) {
    this.apiKey = config.apiKey;
    this.accountId = config.accountId;
    this.baseURL =
      config.region === 'EU'
        ? 'https://api.eu.newrelic.com'
        : 'https://api.newrelic.com';

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    console.log(
      `[NewRelicLogsProvider] Initialized — accountId: ${this.accountId}, region: ${config.region || 'US'}`
    );
  }

  async queryLogs(
    filters: LogFilter,
    timeRange: TimeRange
  ): Promise<LogQueryResult> {
    const startTime = Date.now();
    const nrqlQuery = this.buildNRQL(filters, timeRange);

    console.log(`[NewRelicLogsProvider] queryLogs — NRQL: ${nrqlQuery}`);

    try {
      const gql = this.buildNerdGraphQuery(nrqlQuery);
      const results = await this.executeNerdGraph(gql);

      const entries = results.map((row) => this.parseNrqlRow(row));

      return {
        entries,
        total: entries.length,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`[NewRelicLogsProvider] Error querying logs:`, error);
      throw error;
    }
  }

  async getErrorRate(service: string, timeRange: TimeRange): Promise<number> {
    const minutesDiff = Math.ceil(
      (timeRange.end.getTime() - timeRange.start.getTime()) / 60000
    );
    const sinceMinutes = minutesDiff > 0 ? minutesDiff : 60;

    const nrqlQuery =
      `SELECT percentage(count(*), WHERE level = 'error') FROM Log ` +
      `WHERE service.name = '${service}' SINCE ${sinceMinutes} minutes ago`;

    console.log(
      `[NewRelicLogsProvider] getErrorRate — service: ${service}, since: ${sinceMinutes}m`
    );

    try {
      const gql = this.buildNerdGraphQuery(nrqlQuery);
      const results = await this.executeNerdGraph(gql);

      if (results.length === 0) return 0;

      const raw =
        results[0]['percentage'] ??
        results[0]['percentage(count(*), WHERE level = \'error\')'] ??
        null;

      if (raw === null || raw === undefined) return 0;

      // New Relic returns percentage as 0-100, normalize to 0-1
      const pct = parseFloat(String(raw));
      return isNaN(pct) ? 0 : pct / 100;
    } catch (error) {
      console.error(`[NewRelicLogsProvider] Error getting error rate:`, error);
      return 0;
    }
  }

  async getRecentErrors(service: string, limit: number = 50): Promise<LogEntry[]> {
    const nrqlQuery =
      `SELECT * FROM Log WHERE level = 'error' AND service.name = '${service}' ` +
      `ORDER BY timestamp DESC LIMIT ${limit}`;

    console.log(
      `[NewRelicLogsProvider] getRecentErrors — service: ${service}, limit: ${limit}`
    );

    try {
      const gql = this.buildNerdGraphQuery(nrqlQuery);
      const results = await this.executeNerdGraph(gql);

      return results.map((row) => this.parseNrqlRow(row));
    } catch (error) {
      console.error(`[NewRelicLogsProvider] Error getting recent errors:`, error);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    const nrqlQuery = `SELECT count(*) FROM NrIntegrationError SINCE 1 minute ago`;

    console.log(`[NewRelicLogsProvider] Running health check...`);

    try {
      const gql = this.buildNerdGraphQuery(nrqlQuery);
      await this.executeNerdGraph(gql);
      console.log(`[NewRelicLogsProvider] Health check OK`);
      return true;
    } catch (error) {
      console.error(`[NewRelicLogsProvider] Health check failed:`, error);
      return false;
    }
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private buildNRQL(filters: LogFilter, timeRange: TimeRange): string {
    const minutesDiff = Math.ceil(
      (timeRange.end.getTime() - timeRange.start.getTime()) / 60000
    );
    const sinceMinutes = minutesDiff > 0 ? minutesDiff : 60;

    const conditions: string[] = [];

    if (filters.service) {
      conditions.push(`service.name = '${filters.service}'`);
    }

    if (filters.level && filters.level.length > 0) {
      const levelsFormatted = filters.level.map((l) => `'${l}'`).join(', ');
      conditions.push(`level IN (${levelsFormatted})`);
    } else {
      // Default: error and warn
      conditions.push(`level IN ('error', 'warn')`);
    }

    if (filters.namespace) {
      conditions.push(`kubernetes.namespace = '${filters.namespace}'`);
    }

    if (filters.keywords && filters.keywords.length > 0) {
      const keywordConditions = filters.keywords
        .map((kw) => `message LIKE '%${kw}%'`)
        .join(' OR ');
      conditions.push(`(${keywordConditions})`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return `SELECT * FROM Log ${whereClause} SINCE ${sinceMinutes} minutes ago LIMIT 500`;
  }

  private parseNrqlRow(row: Record<string, any>): LogEntry {
    const rawLevel = (
      row['level'] ??
      row['log.level'] ??
      row['severity'] ??
      'info'
    )
      .toString()
      .toLowerCase();

    const validLevels: LogEntry['level'][] = ['debug', 'info', 'warn', 'error'];
    const level: LogEntry['level'] = validLevels.includes(rawLevel as any)
      ? (rawLevel as LogEntry['level'])
      : 'info';

    const rawTimestamp =
      row['timestamp'] ??
      row['@timestamp'] ??
      row['beginTimeSeconds'];

    let timestamp: Date;
    if (typeof rawTimestamp === 'number') {
      // Could be seconds or ms
      timestamp = rawTimestamp > 1e12
        ? new Date(rawTimestamp)
        : new Date(rawTimestamp * 1000);
    } else if (typeof rawTimestamp === 'string') {
      timestamp = new Date(rawTimestamp);
    } else {
      timestamp = new Date();
    }

    const service =
      row['service.name'] ??
      row['entity.name'] ??
      row['application.name'] ??
      'unknown';

    const message =
      row['message'] ??
      row['msg'] ??
      row['log.message'] ??
      '';

    // Stack trace detection
    const stackTrace: string | undefined =
      row['stack'] ??
      row['stackTrace'] ??
      row['error.stack'] ??
      undefined;

    // Collect remaining fields
    const reservedKeys = new Set([
      'timestamp',
      '@timestamp',
      'beginTimeSeconds',
      'level',
      'log.level',
      'severity',
      'service.name',
      'entity.name',
      'application.name',
      'message',
      'msg',
      'log.message',
      'stack',
      'stackTrace',
      'error.stack',
    ]);

    const fields: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      if (!reservedKeys.has(key)) {
        fields[key] = val;
      }
    }

    return {
      timestamp,
      service,
      level,
      message,
      fields,
      stackTrace,
    };
  }

  private buildNerdGraphQuery(nrql: string): string {
    return JSON.stringify({
      query: `{
        actor {
          account(id: ${this.accountId}) {
            nrql(query: "${nrql.replace(/"/g, '\\"')}") {
              results
            }
          }
        }
      }`,
    });
  }

  private async executeNerdGraph(
    query: string
  ): Promise<Array<Record<string, any>>> {
    const response = await this.client.post<
      NerdGraphResponse<NerdGraphNrqlData>
    >('/graphql', query);

    if (response.data.errors && response.data.errors.length > 0) {
      const errorMessages = response.data.errors
        .map((e) => e.message)
        .join('; ');
      throw new Error(`NerdGraph errors: ${errorMessages}`);
    }

    const results =
      response.data?.data?.actor?.account?.nrql?.results ?? [];

    return results;
  }
}
