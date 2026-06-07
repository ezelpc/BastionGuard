/**
 * PrometheusMetricsProvider
 * Consulta métricas reales de Prometheus
 */

import axios, { AxiosInstance } from 'axios';
import {
    MetricData,
    MetricsProvider,
    MetricTimeseries,
    TimeRange
} from '../types';

export interface PrometheusConfig {
  url: string;
  timeout?: number;
}

interface PrometheusRangeResponse {
  status: 'success' | 'error';
  data: {
    resultType: 'matrix' | 'vector' | 'scalar' | 'string';
    result: PrometheusRangeResult[];
  };
}

interface PrometheusRangeResult {
  metric: Record<string, string>;
  values: [number, string][]; // [timestamp, value]
}

export class PrometheusMetricsProvider implements MetricsProvider {
  name = 'prometheus';
  private client: AxiosInstance;

  constructor(config: PrometheusConfig) {
    this.client = axios.create({
      baseURL: config.url,
      timeout: config.timeout || 30000,
    });
  }

  async queryMetric(query: string, timeRange: TimeRange): Promise<MetricData> {
    const startMs = Math.floor(timeRange.start.getTime() / 1000);
    const endMs = Math.floor(timeRange.end.getTime() / 1000);
    const step = timeRange.step || '15s';

    const startTime = Date.now();

    try {
      const response = await this.client.get<PrometheusRangeResponse>(
        '/api/v1/query_range',
        {
          params: {
            query,
            start: startMs,
            end: endMs,
            step,
          },
        }
      );

      const executionTime = Date.now() - startTime;

      if (response.data.status === 'error') {
        throw new Error(`Prometheus error: ${response.data.data}`);
      }

      const result = this.parseRangeResponse(response.data.data.result);

      return {
        query,
        result,
        executionTime,
      };
    } catch (error) {
      console.error(
        `[PrometheusMetricsProvider] Error querying ${query}:`,
        error
      );
      throw error;
    }
  }

  async queryTimeseries(
    query: string,
    timeRange: TimeRange
  ): Promise<MetricTimeseries[]> {
    const data = await this.queryMetric(query, timeRange);
    return data.result;
  }

  async getAvailableMetrics(service?: string): Promise<string[]> {
    try {
      const response = await this.client.get('/api/v1/label/__name__/values');

      let metrics = response.data.data || [];

      // Filtrar por servicio si aplica
      if (service) {
        metrics = metrics.filter(
          (m: string) =>
            m.includes(service) ||
            m.includes('job_') + service ||
            m.includes('service_') + service
        );
      }

      // Retornar las más comunes
      return metrics.slice(0, 50);
    } catch (error) {
      console.warn('[PrometheusMetricsProvider] Error getting available metrics:', error);
      // Return common metrics como fallback
      return [
        'up',
        'process_resident_memory_bytes',
        'process_cpu_seconds_total',
        'http_requests_total',
        'http_request_duration_seconds',
        'container_cpu_usage_seconds_total',
        'container_memory_usage_bytes',
        'node_cpu_seconds_total',
        'node_memory_MemAvailable_bytes',
        'node_network_receive_bytes_total',
      ];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/-/healthy');
      return response.status === 200;
    } catch (error) {
      console.error('[PrometheusMetricsProvider] Health check failed:', error);
      return false;
    }
  }

  /**
   * Parse Prometheus range response a formato internal
   */
  private parseRangeResponse(
    results: PrometheusRangeResult[]
  ): MetricTimeseries[] {
    return results.map((result) => ({
      name: result.metric.__name__ || 'unknown',
      labels: result.metric,
      points: result.values.map((value) => ({
        timestamp: new Date(value[0] * 1000),
        value: parseFloat(value[1]),
        labels: result.metric,
      })),
    }));
  }

  /**
   * Queries predefinidas para diagnóstico
   */
  static getCommonQueries(serviceName: string): Record<string, string> {
    return {
      cpu_usage: `rate(container_cpu_usage_seconds_total{pod=~"${serviceName}.*"}[5m]) * 100`,
      memory_usage: `container_memory_usage_bytes{pod=~"${serviceName}.*"} / 1024 / 1024`,
      error_rate: `rate(http_requests_total{job="${serviceName}",status=~"5.."}[5m])`,
      request_rate: `rate(http_requests_total{job="${serviceName}"}[5m])`,
      latency_p99: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{job="${serviceName}"}[5m]))`,
      available_replicas: `kube_deployment_status_replicas_available{deployment=~"${serviceName}.*"}`,
      desired_replicas: `kube_deployment_spec_replicas{deployment=~"${serviceName}.*"}`,
      restart_count: `kube_pod_container_status_restarts_total{pod=~"${serviceName}.*"}`,
    };
  }
}
