/**
 * NewRelicMetricsProvider
 * Consulta métricas reales de New Relic vía NerdGraph GraphQL API
 */

import axios from 'axios';
import {
  MetricData,
  MetricsProvider,
  MetricTimeseries,
  MetricPoint,
  TimeRange,
} from '../types';

export interface NewRelicMetricsConfig {
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

export class NewRelicMetricsProvider implements MetricsProvider {
  name = 'newrelic';
  private apiKey: string;
  private accountId: string;
  private baseURL: string;
  private client: ReturnType<typeof axios.create>;

  constructor(config: NewRelicMetricsConfig) {
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
      `[NewRelicMetricsProvider] Initialized — accountId: ${this.accountId}, region: ${config.region || 'US'}`
    );
  }

  async queryTimeseries(
    query: string,
    timeRange: TimeRange
  ): Promise<MetricTimeseries[]> {
    const minutesDiff = Math.ceil(
      (timeRange.end.getTime() - timeRange.start.getTime()) / 60000
    );
    const sinceMinutes = minutesDiff > 0 ? minutesDiff : 60;

    const nrqlQuery = `SELECT average(value) FROM Metric WHERE ${query} SINCE ${sinceMinutes} minutes ago TIMESERIES 1 minute`;

    console.log(
      `[NewRelicMetricsProvider] queryTimeseries — NRQL: ${nrqlQuery}`
    );

    try {
      const gql = this.buildNerdGraphQuery(nrqlQuery);
      const rawResults = await this.executeNerdGraph(gql);

      const timeseries: MetricTimeseries = {
        name: query,
        labels: { provider: 'newrelic', query },
        points: rawResults.map((row: Record<string, any>): MetricPoint => {
          const beginSecs: number =
            row['beginTimeSeconds'] ?? row['begin_time'] ?? 0;
          const value: number =
            row['average.value'] ??
            row['average'] ??
            row['value'] ??
            0;

          return {
            timestamp: new Date(beginSecs * 1000),
            value: typeof value === 'number' ? value : parseFloat(value) || 0,
            labels: { provider: 'newrelic' },
          };
        }),
      };

      return [timeseries];
    } catch (error) {
      console.error(
        `[NewRelicMetricsProvider] Error in queryTimeseries for "${query}":`,
        error
      );
      throw error;
    }
  }

  async queryMetric(query: string, timeRange: TimeRange): Promise<MetricData> {
    const startTime = Date.now();

    const result = await this.queryTimeseries(query, timeRange);

    return {
      query,
      result,
      executionTime: Date.now() - startTime,
    };
  }

  async getAvailableMetrics(service?: string): Promise<string[]> {
    let nrqlQuery: string;

    if (service) {
      nrqlQuery = `SELECT uniques(metricName) FROM Metric WHERE entity.name LIKE '%${service}%' SINCE 1 hour ago`;
    } else {
      nrqlQuery = `SELECT uniques(metricName) FROM Metric SINCE 1 hour ago LIMIT 50`;
    }

    console.log(
      `[NewRelicMetricsProvider] getAvailableMetrics — service: ${service ?? '(all)'}`
    );

    try {
      const gql = this.buildNerdGraphQuery(nrqlQuery);
      const results = await this.executeNerdGraph(gql);

      // New Relic returns uniques in a nested array or flat array
      const metricNames: string[] = [];

      for (const row of results) {
        const uniques =
          row['uniques(metricName)'] ??
          row['metricName'] ??
          row['uniques'] ??
          null;

        if (Array.isArray(uniques)) {
          metricNames.push(...uniques.map(String));
        } else if (typeof uniques === 'string') {
          metricNames.push(uniques);
        }
      }

      console.log(
        `[NewRelicMetricsProvider] Found ${metricNames.length} metrics`
      );
      return metricNames.slice(0, 50);
    } catch (error) {
      console.warn(
        '[NewRelicMetricsProvider] Error getting available metrics, returning defaults:',
        error
      );
      return [
        'system.cpu.userPercent',
        'system.memory.usedBytes',
        'http.server.requestCount',
        'http.server.duration',
        'apm.service.error.count',
        'apm.service.transaction.duration',
      ];
    }
  }

  async healthCheck(): Promise<boolean> {
    const nrqlQuery = `SELECT count(*) FROM NrIntegrationError SINCE 1 minute ago`;

    console.log(`[NewRelicMetricsProvider] Running health check...`);

    try {
      const gql = this.buildNerdGraphQuery(nrqlQuery);
      await this.executeNerdGraph(gql);
      console.log(`[NewRelicMetricsProvider] Health check OK`);
      return true;
    } catch (error) {
      console.error(`[NewRelicMetricsProvider] Health check failed:`, error);
      return false;
    }
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

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

  private async executeNerdGraph(query: string): Promise<Array<Record<string, any>>> {
    const response = await this.client.post<NerdGraphResponse<NerdGraphNrqlData>>(
      '/graphql',
      query
    );

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
