/**
 * CloudWatchLogsProvider
 * Consulta logs reales de Amazon CloudWatch Logs
 *
 * NOTE: Uses dynamic require() for @aws-sdk/client-cloudwatch-logs so that
 * the file compiles even when the package is not installed. Install it with:
 *   npm install @aws-sdk/client-cloudwatch-logs
 */

import {
  LogEntry,
  LogFilter,
  LogProvider,
  LogQueryResult,
  TimeRange,
} from '../types';

// ── Local stubs for @aws-sdk/client-cloudwatch-logs types ─────────────────────
interface CWLClientConfig {
  region: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

interface CWLFilteredLogEvent {
  eventId?: string;
  logStreamName?: string;
  timestamp?: number;
  ingestionTime?: number;
  message?: string;
}
// ──────────────────────────────────────────────────────────────────────────────

export interface CloudWatchLogsConfig {
  region: string;
  logGroupPrefix?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class CloudWatchLogsProvider implements LogProvider {
  name = 'cloudwatch-logs';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private logGroupPrefix: string;

  constructor(config: CloudWatchLogsConfig) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { CloudWatchLogsClient } = require('@aws-sdk/client-cloudwatch-logs');

    const clientConfig: CWLClientConfig = { region: config.region };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.client = new CloudWatchLogsClient(clientConfig);
    this.logGroupPrefix = config.logGroupPrefix || '/aws/services';

    console.log(
      `[CloudWatchLogsProvider] Initialized for region: ${config.region}, logGroupPrefix: ${this.logGroupPrefix}`
    );
  }

  async queryLogs(filters: LogFilter, timeRange: TimeRange): Promise<LogQueryResult> {
    const startTime = Date.now();

    console.log(
      `[CloudWatchLogsProvider] Querying logs for service: ${filters.service || 'all'}`
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

      const logGroupName = filters.service
        ? `${this.logGroupPrefix}/${filters.service}`
        : this.logGroupPrefix;

      const patterns: string[] = [];

      if (filters.keywords && filters.keywords.length > 0) {
        patterns.push(filters.keywords.map((kw) => `?${kw}`).join(' '));
      }

      if (filters.level && filters.level.length > 0) {
        patterns.push(
          filters.level.map((l) => `?${l.toUpperCase()} ?${l.toLowerCase()}`).join(' ')
        );
      }

      const filterPattern = patterns.join(' ');

      const input = {
        logGroupName,
        startTime: timeRange.start.getTime(),
        endTime: timeRange.end.getTime(),
        filterPattern: filterPattern || undefined,
        limit: 10000,
      };

      const command = new FilterLogEventsCommand(input);
      const response = await this.client.send(command);

      const executionTime = Date.now() - startTime;
      const entries = (response.events as CWLFilteredLogEvent[] || []).map((event) =>
        this.parseLogEvent(event, filters.service || 'unknown')
      );

      console.log(
        `[CloudWatchLogsProvider] Query completed in ${executionTime}ms, ${entries.length} entries returned`
      );

      return { entries, total: entries.length, executionTime };
    } catch (error) {
      console.error('[CloudWatchLogsProvider] Error querying logs:', error);
      throw error;
    }
  }

  async getErrorRate(service: string, timeRange: TimeRange): Promise<number> {
    console.log(`[CloudWatchLogsProvider] Calculating error rate for service: ${service}`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

      const logGroupName = `${this.logGroupPrefix}/${service}`;

      const errorCommand = new FilterLogEventsCommand({
        logGroupName,
        startTime: timeRange.start.getTime(),
        endTime: timeRange.end.getTime(),
        filterPattern: '?ERROR ?error',
        limit: 10000,
      });

      const totalCommand = new FilterLogEventsCommand({
        logGroupName,
        startTime: timeRange.start.getTime(),
        endTime: timeRange.end.getTime(),
        limit: 10000,
      });

      const [errorResponse, totalResponse] = await Promise.all([
        this.client.send(errorCommand),
        this.client.send(totalCommand),
      ]);

      const errorCount = (errorResponse.events || []).length;
      const totalCount = (totalResponse.events || []).length;

      if (totalCount === 0) {
        console.log(`[CloudWatchLogsProvider] No logs found for ${service}, error rate = 0`);
        return 0;
      }

      const errorRate = errorCount / totalCount;
      console.log(
        `[CloudWatchLogsProvider] Error rate for ${service}: ${(errorRate * 100).toFixed(2)}% (${errorCount}/${totalCount})`
      );

      return errorRate;
    } catch (error) {
      console.error(
        `[CloudWatchLogsProvider] Error calculating error rate for ${service}:`,
        error
      );
      return 0;
    }
  }

  async getRecentErrors(service: string, limit: number = 50): Promise<LogEntry[]> {
    console.log(
      `[CloudWatchLogsProvider] Getting recent errors for service: ${service}, limit: ${limit}`
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');

      const command = new FilterLogEventsCommand({
        logGroupName: `${this.logGroupPrefix}/${service}`,
        startTime: Date.now() - 60 * 60 * 1000,
        endTime: Date.now(),
        filterPattern: 'ERROR',
        limit: Math.min(limit, 10000),
      });

      const response = await this.client.send(command);
      const entries = (response.events as CWLFilteredLogEvent[] || [])
        .map((event) => this.parseLogEvent(event, service))
        .slice(0, limit);

      console.log(
        `[CloudWatchLogsProvider] Found ${entries.length} recent errors for ${service}`
      );

      return entries;
    } catch (error) {
      console.error(
        `[CloudWatchLogsProvider] Error getting recent errors for ${service}:`,
        error
      );
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    console.log('[CloudWatchLogsProvider] Running health check...');

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DescribeLogGroupsCommand } = require('@aws-sdk/client-cloudwatch-logs');
      const command = new DescribeLogGroupsCommand({ limit: 1 });
      await this.client.send(command);
      console.log('[CloudWatchLogsProvider] Health check passed');
      return true;
    } catch (error) {
      console.error('[CloudWatchLogsProvider] Health check failed:', error);
      return false;
    }
  }

  /**
   * Parsea un FilteredLogEvent de CloudWatch a un LogEntry interno
   */
  private parseLogEvent(event: CWLFilteredLogEvent, service: string): LogEntry {
    const message = event.message || '';
    const level = this.detectLogLevel(message);
    const stackTrace = this.extractStackTrace(message);

    return {
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      service,
      level,
      message: this.cleanMessage(message),
      fields: {
        eventId: event.eventId,
        logStreamName: event.logStreamName,
        ingestionTime: event.ingestionTime
          ? new Date(event.ingestionTime).toISOString()
          : undefined,
        rawMessage: message,
      },
      stackTrace,
    };
  }

  private detectLogLevel(message: string): LogEntry['level'] {
    const upper = message.toUpperCase();
    if (upper.includes('ERROR') || upper.includes('FATAL') || upper.includes('CRITICAL')) {
      return 'error';
    }
    if (upper.includes('WARN') || upper.includes('WARNING')) return 'warn';
    if (upper.includes('DEBUG') || upper.includes('TRACE')) return 'debug';
    return 'info';
  }

  private cleanMessage(message: string): string {
    return message
      .replace(/^\s*(ERROR|WARN|INFO|DEBUG|TRACE|FATAL|CRITICAL)\s*:?\s*/i, '')
      .trim();
  }

  private extractStackTrace(message: string): string | undefined {
    const stackMatch = message.match(/(at\s+\S+[\s\S]*)/);
    return stackMatch ? stackMatch[1].trim() : undefined;
  }
}
