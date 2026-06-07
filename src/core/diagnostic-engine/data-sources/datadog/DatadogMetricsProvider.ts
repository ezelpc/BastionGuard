/**
 * DatadogMetricsProvider
 * Consulta métricas reales de Datadog via REST API
 */

import axios, { AxiosInstance } from 'axios';
import {
  MetricData,
  MetricsProvider,
  MetricTimeseries,
  MetricPoint,
  TimeRange,
} from '../types';

export interface DatadogMetricsConfig {
  apiKey: string;
  appKey: string;
  site?: string; // default: 'datadoghq.com'
}

interface DatadogSeriesPoint {
  0: number; // timestamp (unix seconds)
  1: number | null; // value
}

interface DatadogSeries {
  metric: string;
  scope?: string;
  pointlist: DatadogSeriesPoint[];
  unit?: any[];
  display_name?: string;
  attributes?: Record<string, any>;
}

interface DatadogQueryResponse {
  series: DatadogSeries[];
  from_date?: number;
  to_date?: number;
  status?: string;
  query?: string;
}

interface DatadogMetricsListResponse {
  metrics: string[];
  from?: string;
}

interface DatadogValidateResponse {
  valid: boolean;
  errors?: string[];
}

export class DatadogMetricsProvider implements MetricsProvider {
  name = 'datadog';
  private client: AxiosInstance;

  constructor(config: DatadogMetricsConfig) {
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
      `[DatadogMetricsProvider] Initialized for site: ${site}`
    );
  }

  async queryMetric(query: string, timeRange: TimeRange): Promise<MetricData> {
    const startTime = Date.now();

    console.log(
      `[DatadogMetricsProvider] Querying metric: "${query}" from ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`
    );

    try {
      const from = Math.floor(timeRange.start.getTime() / 1000);
      const to = Math.floor(timeRange.end.getTime() / 1000);

      const response = await this.client.get<DatadogQueryResponse>(
        '/api/v1/query',
        {
          params: {
            from,
            to,
            query,
          },
        }
      );

      const executionTime = Date.now() - startTime;
      const result = this.parseDatadogSeries(response.data.series || []);

      console.log(
        `[DatadogMetricsProvider] Query completed in ${executionTime}ms, ${result.length} series returned`
      );

      return {
        query,
        result,
        executionTime,
      };
    } catch (error) {
      console.error(
        `[DatadogMetricsProvider] Error querying metric "${query}":`,
        error
      );
      throw error;
    }
  }

  async queryTimeseries(
    query: string,
    timeRange: TimeRange
  ): Promise<MetricTimeseries[]> {
    console.log(
      `[DatadogMetricsProvider] Querying timeseries for: "${query}"`
    );

    try {
      const data = await this.queryMetric(query, timeRange);
      return data.result;
    } catch (error) {
      console.error(
        `[DatadogMetricsProvider] Error querying timeseries for "${query}":`,
        error
      );
      throw error;
    }
  }

  async getAvailableMetrics(service?: string): Promise<string[]> {
    console.log(
      `[DatadogMetricsProvider] Listing available metrics${service ? ` for: ${service}` : ''}`
    );

    try {
      const params: Record<string, string> = {};
      if (service) {
        params.q = service;
      }

      const response = await this.client.get<DatadogMetricsListResponse>(
        '/api/v1/metrics',
        { params }
      );

      const metrics = response.data.metrics || [];

      console.log(
        `[DatadogMetricsProvider] Found ${metrics.length} metrics${service ? ` matching "${service}"` : ''}`
      );

      return metrics.slice(0, 50);
    } catch (error) {
      console.warn(
        '[DatadogMetricsProvider] Error listing metrics, returning common metrics as fallback:',
        error
      );
      return [
        'system.cpu.user',
        'system.cpu.system',
        'system.mem.used',
        'system.mem.total',
        'system.net.bytes_sent',
        'system.net.bytes_rcvd',
        'system.load.1',
        'system.load.5',
        'system.load.15',
        'container.cpu.usage',
        'container.memory.usage',
        'trace.web.request',
        'trace.web.request.errors',
        'trace.web.request.duration',
      ];
    }
  }

  async healthCheck(): Promise<boolean> {
    console.log('[DatadogMetricsProvider] Running health check...');

    try {
      const response = await this.client.get<DatadogValidateResponse>(
        '/api/v1/validate'
      );
      const healthy = response.status === 200;
      console.log(
        `[DatadogMetricsProvider] Health check ${healthy ? 'passed' : 'failed'}: status ${response.status}`
      );
      return healthy;
    } catch (error) {
      console.error('[DatadogMetricsProvider] Health check failed:', error);
      return false;
    }
  }

  /**
   * Convierte series de Datadog al formato interno MetricTimeseries[]
   */
  private parseDatadogSeries(series: DatadogSeries[]): MetricTimeseries[] {
    return series.map((s) => {
      const points: MetricPoint[] = (s.pointlist || []).map(
        (point) => ({
          timestamp: new Date(point[0] * 1000),
          value: point[1] ?? 0,
          labels: {
            metric: s.metric,
            scope: s.scope || '',
          },
        })
      );

      return {
        name: s.metric,
        labels: {
          metric: s.metric,
          scope: s.scope || '',
          display_name: s.display_name || s.metric,
        },
        points,
      };
    });
  }
}
