/**
 * ElasticsearchLogProvider
 * Consulta logs reales de Elasticsearch
 */

import { Client } from '@elastic/elasticsearch';
import {
    LogEntry,
    LogFilter,
    LogProvider,
    LogQueryResult,
    TimeRange,
} from '../types';

export interface ElasticsearchConfig {
  node: string;
  username?: string;
  password?: string;
  apiKey?: string;
  index?: string;
}

export class ElasticsearchLogProvider implements LogProvider {
  name = 'elasticsearch';
  private client: Client;
  private index: string;

  constructor(config: ElasticsearchConfig) {
    const auth =
      config.apiKey && config.apiKey.includes(':')
        ? {
            apiKey: config.apiKey,
          }
        : {
            username: config.username,
            password: config.password,
          };

    this.client = new Client({
      node: config.node,
      auth: auth as any,
    });

    this.index = config.index || 'logs-*';
  }

  async queryLogs(
    filters: LogFilter,
    timeRange: TimeRange
  ): Promise<LogQueryResult> {
    const startTime = Date.now();

    try {
      const must: any[] = [
        {
          range: {
            '@timestamp': {
              gte: timeRange.start.getTime(),
              lte: timeRange.end.getTime(),
            },
          },
        },
      ];

      // Filtrar por servicio
      if (filters.service) {
        must.push({
          match: {
            'service.name': filters.service,
          },
        });
      }

      // Filtrar por namespace
      if (filters.namespace) {
        must.push({
          match: {
            'kubernetes.namespace_name': filters.namespace,
          },
        });
      }

      // Filtrar por nivel
      if (filters.level && filters.level.length > 0) {
        must.push({
          terms: {
            'log.level': filters.level,
          },
        });
      }

      // Filtrar por keywords
      if (filters.keywords && filters.keywords.length > 0) {
        const should = filters.keywords.map((kw) => ({
          match: {
            message: {
              query: kw,
              fuzziness: 'AUTO',
            },
          },
        }));

        must.push({
          bool: {
            should,
            minimum_should_match: 1,
          },
        });
      }

      const response = await this.client.search({
        index: this.index,
        query: {
          bool: {
            must,
          },
        },
        size: 10000,
        sort: [{ '@timestamp': { order: 'desc' } }],
      });

      const executionTime = Date.now() - startTime;
      const entries = (response.hits.hits || []).map((hit: any) =>
        this.parseLogEntry(hit._source)
      );

      return {
        entries,
        total: (response.hits.total as any)?.value || 0,
        executionTime,
      };
    } catch (error) {
      console.error('[ElasticsearchLogProvider] Error querying logs:', error);
      throw error;
    }
  }

  async getErrorRate(serviceName: string, timeRange: TimeRange): Promise<number> {
    try {
      // Query para contar errores
      const errorResponse = await this.client.count({
        index: this.index,
        query: {
          bool: {
            must: [
              {
                match: {
                  'service.name': serviceName,
                },
              },
              {
                range: {
                  '@timestamp': {
                    gte: timeRange.start.getTime(),
                    lte: timeRange.end.getTime(),
                  },
                },
              },
              {
                terms: {
                  'log.level': ['error', 'warn'],
                },
              },
            ],
          },
        },
      });

      // Query para contar total
      const totalResponse = await this.client.count({
        index: this.index,
        query: {
          bool: {
            must: [
              {
                match: {
                  'service.name': serviceName,
                },
              },
              {
                range: {
                  '@timestamp': {
                    gte: timeRange.start.getTime(),
                    lte: timeRange.end.getTime(),
                  },
                },
              },
            ],
          },
        },
      });

      if (totalResponse.count === 0) return 0;

      return errorResponse.count / totalResponse.count;
    } catch (error) {
      console.error('[ElasticsearchLogProvider] Error calculating error rate:', error);
      return 0;
    }
  }

  async getRecentErrors(
    serviceName: string,
    limit: number = 50
  ): Promise<LogEntry[]> {
    try {
      const response = await this.queryLogs(
        {
          service: serviceName,
          level: ['error'],
        },
        {
          start: new Date(Date.now() - 60 * 60 * 1000), // última hora
          end: new Date(),
        }
      );

      return response.entries.slice(0, limit);
    } catch (error) {
      console.error('[ElasticsearchLogProvider] Error getting recent errors:', error);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const info = await this.client.info();
      return !!info;
    } catch (error) {
      console.error('[ElasticsearchLogProvider] Health check failed:', error);
      return false;
    }
  }

  /**
   * Parser de documento Elasticsearch a LogEntry
   * Asume formato standard ECS (Elastic Common Schema)
   */
  private parseLogEntry(source: any): LogEntry {
    const level = source['log.level']?.toLowerCase() || 'info';

    return {
      timestamp: source['@timestamp']
        ? new Date(source['@timestamp'])
        : new Date(),
      service: source['service.name'] || 'unknown',
      level: (level as any) || 'info',
      message: source.message || source.msg || '',
      fields: {
        pod: source['kubernetes.pod.name'],
        namespace: source['kubernetes.namespace_name'],
        container: source['container.name'],
        host: source['host.name'],
        ...source, // incluir todos los campos
      },
      stackTrace: source.stack,
    };
  }
}
