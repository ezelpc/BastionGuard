/**
 * CloudWatchMetricsProvider
 * Consulta métricas reales de Amazon CloudWatch
 *
 * NOTE: Uses dynamic require() for @aws-sdk/client-cloudwatch so that
 * the file compiles even when the package is not installed. Install it
 * with:  npm install @aws-sdk/client-cloudwatch
 */

import {
  MetricData,
  MetricsProvider,
  MetricTimeseries,
  MetricPoint,
  TimeRange,
} from '../types';

// ── Local stubs for @aws-sdk/client-cloudwatch types ──────────────────────────
interface CWClientConfig {
  region: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  endpoint?: string;
}

interface CWMetricDataResult {
  Id?: string;
  Label?: string;
  StatusCode?: string;
  Timestamps?: (Date | string)[];
  Values?: number[];
}

interface CWMetricItem {
  Namespace?: string;
  MetricName?: string;
}
// ──────────────────────────────────────────────────────────────────────────────

export interface CloudWatchMetricsConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

export class CloudWatchMetricsProvider implements MetricsProvider {
  name = 'cloudwatch';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  constructor(config: CloudWatchMetricsConfig) {
    // Lazy-load so TypeScript compilation succeeds even without the SDK package
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CloudWatchClient } = require('@aws-sdk/client-cloudwatch');

    const clientConfig: CWClientConfig = { region: config.region };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
    }

    this.client = new CloudWatchClient(clientConfig);
    console.log(`[CloudWatchMetricsProvider] Initialized for region: ${config.region}`);
  }

  async queryMetric(query: string, timeRange: TimeRange): Promise<MetricData> {
    const startTime = Date.now();

    console.log(
      `[CloudWatchMetricsProvider] Querying metric: ${query} from ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GetMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

      const input = {
        StartTime: timeRange.start,
        EndTime: timeRange.end,
        MetricDataQueries: [{ Id: 'm1', Expression: query, ReturnData: true }],
      };

      const command = new GetMetricDataCommand(input);
      const response = await this.client.send(command);

      const executionTime = Date.now() - startTime;
      const result = this.parseMetricDataResult(response.MetricDataResults || []);

      console.log(
        `[CloudWatchMetricsProvider] Query completed in ${executionTime}ms, ${result.length} series returned`
      );

      return { query, result, executionTime };
    } catch (error) {
      console.error(`[CloudWatchMetricsProvider] Error querying metric "${query}":`, error);
      throw error;
    }
  }

  async queryTimeseries(query: string, timeRange: TimeRange): Promise<MetricTimeseries[]> {
    console.log(`[CloudWatchMetricsProvider] Querying timeseries for: ${query}`);

    try {
      const data = await this.queryMetric(query, timeRange);
      return data.result;
    } catch (error) {
      console.error(
        `[CloudWatchMetricsProvider] Error querying timeseries for "${query}":`,
        error
      );
      throw error;
    }
  }

  async getAvailableMetrics(service?: string): Promise<string[]> {
    console.log(
      `[CloudWatchMetricsProvider] Listing available metrics${service ? ` for service: ${service}` : ''}`
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ListMetricsCommand } = require('@aws-sdk/client-cloudwatch');
      const input: { Namespace?: string } = {};

      if (service) {
        input.Namespace = this.resolveNamespace(service);
      }

      const command = new ListMetricsCommand(input);
      const response = await this.client.send(command);

      const metrics = (response.Metrics as CWMetricItem[] || []).map(
        (m) => `${m.Namespace}/${m.MetricName}`
      );

      console.log(
        `[CloudWatchMetricsProvider] Found ${metrics.length} metrics${service ? ` for ${service}` : ''}`
      );

      return metrics.slice(0, 50);
    } catch (error) {
      console.warn(
        '[CloudWatchMetricsProvider] Error listing metrics, returning common metrics as fallback:',
        error
      );
      return [
        'AWS/EC2/CPUUtilization',
        'AWS/EC2/NetworkIn',
        'AWS/EC2/NetworkOut',
        'AWS/ECS/CPUUtilization',
        'AWS/ECS/MemoryUtilization',
        'AWS/ApplicationELB/RequestCount',
        'AWS/ApplicationELB/HTTPCode_ELB_5XX_Count',
        'AWS/ApplicationELB/TargetResponseTime',
        'AWS/Lambda/Invocations',
        'AWS/Lambda/Errors',
        'AWS/Lambda/Duration',
        'AWS/RDS/CPUUtilization',
        'AWS/RDS/FreeStorageSpace',
      ];
    }
  }

  async healthCheck(): Promise<boolean> {
    console.log('[CloudWatchMetricsProvider] Running health check...');

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ListMetricsCommand } = require('@aws-sdk/client-cloudwatch');
      const command = new ListMetricsCommand({ NextToken: undefined });
      await this.client.send(command);
      console.log('[CloudWatchMetricsProvider] Health check passed');
      return true;
    } catch (error) {
      console.error('[CloudWatchMetricsProvider] Health check failed:', error);
      return false;
    }
  }

  /**
   * Convierte los resultados de GetMetricDataCommand a MetricTimeseries[]
   */
  private parseMetricDataResult(results: CWMetricDataResult[]): MetricTimeseries[] {
    return results.map((result) => {
      const timestamps = result.Timestamps || [];
      const values = result.Values || [];

      const points: MetricPoint[] = timestamps.map((ts: Date | string, idx: number) => ({
        timestamp: ts instanceof Date ? ts : new Date(ts),
        value: values[idx] ?? 0,
        labels: {
          id: result.Id || 'unknown',
          label: result.Label || 'unknown',
          statusCode: result.StatusCode || 'Unknown',
        },
      }));

      return {
        name: result.Label || result.Id || 'unknown',
        labels: {
          id: result.Id || 'unknown',
          label: result.Label || 'unknown',
          statusCode: result.StatusCode || 'Unknown',
        },
        points,
      };
    });
  }

  /**
   * Mapea un nombre de servicio a un Namespace de CloudWatch
   */
  private resolveNamespace(service: string): string {
    const normalized = service.toLowerCase();

    const namespaceMap: Record<string, string> = {
      ec2: 'AWS/EC2',
      ecs: 'AWS/ECS',
      eks: 'AWS/EKS',
      lambda: 'AWS/Lambda',
      rds: 'AWS/RDS',
      dynamodb: 'AWS/DynamoDB',
      s3: 'AWS/S3',
      sqs: 'AWS/SQS',
      sns: 'AWS/SNS',
      elb: 'AWS/ApplicationELB',
      alb: 'AWS/ApplicationELB',
      nlb: 'AWS/NetworkELB',
      cloudfront: 'AWS/CloudFront',
      elasticache: 'AWS/ElastiCache',
      apigateway: 'AWS/ApiGateway',
    };

    return namespaceMap[normalized] || `AWS/${service}`;
  }
}
