/**
 * ECSStateProvider
 * Consulta estado real de servicios en AWS ECS
 */

import {
  ECSClient,
  DescribeServicesCommand,
  ListServicesCommand,
  DescribeTaskDefinitionCommand,
  DescribeServicesCommandOutput,
} from '@aws-sdk/client-ecs';
import {
  Deployment,
  ServiceDependency,
  ServiceStatusSnapshot,
  StateProvider,
} from '../types';

export interface ECSStateConfig {
  region: string;
  cluster: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class ECSStateProvider implements StateProvider {
  name = 'ecs';
  private client: ECSClient;
  private cluster: string;

  constructor(config: ECSStateConfig) {
    const clientConfig: ConstructorParameters<typeof ECSClient>[0] = {
      region: config.region,
    };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.client = new ECSClient(clientConfig);
    this.cluster = config.cluster;

    console.log(
      `[ECSStateProvider] Initialized for cluster: ${this.cluster} in region: ${config.region}`
    );
  }

  // ============================================================
  // PUBLIC INTERFACE METHODS
  // ============================================================

  async getServiceStatus(
    serviceName: string,
    _namespace?: string
  ): Promise<ServiceStatusSnapshot> {
    try {
      console.log(`[ECSStateProvider] getServiceStatus for: ${serviceName}`);

      const response: DescribeServicesCommandOutput = await this.client.send(
        new DescribeServicesCommand({
          cluster: this.cluster,
          services: [serviceName],
        })
      );

      if (!response.services || response.services.length === 0) {
        console.warn(`[ECSStateProvider] Service not found: ${serviceName}`);
        return this.buildUnknownSnapshot(serviceName);
      }

      const service = response.services[0];
      const runningCount = service.runningCount ?? 0;
      const desiredCount = service.desiredCount ?? 0;
      const deployments = service.deployments ?? [];

      // Hay rollout si hay más de un deployment activo
      const recentDeploy = deployments.length > 1;
      const deployedAt = deployments[0]?.createdAt
        ? deployments[0].createdAt.toISOString()
        : new Date().toISOString();

      // ECS no expone restartCount directamente
      const restartCount = 0;

      const status: ServiceStatusSnapshot['status'] =
        runningCount === desiredCount && desiredCount > 0 ? 'Running' : 'Pending';

      console.log(
        `[ECSStateProvider] ${serviceName}: running=${runningCount}, desired=${desiredCount}, status=${status}, recentDeploy=${recentDeploy}`
      );

      return {
        name: serviceName,
        namespace: this.cluster,
        replicas: {
          desired: desiredCount,
          ready: runningCount,
          available: runningCount,
        },
        recentDeploy,
        deployedAt,
        restartCount,
        status,
        lastUpdate: new Date(),
      };
    } catch (error) {
      console.error(
        `[ECSStateProvider] Error getting status for ${serviceName}:`,
        error
      );
      return this.buildUnknownSnapshot(serviceName);
    }
  }

  async getDeploymentHistory(
    serviceName: string,
    limit: number = 10
  ): Promise<Deployment[]> {
    try {
      console.log(
        `[ECSStateProvider] getDeploymentHistory for: ${serviceName}, limit: ${limit}`
      );

      const response = await this.client.send(
        new DescribeServicesCommand({
          cluster: this.cluster,
          services: [serviceName],
        })
      );

      if (!response.services || response.services.length === 0) {
        console.warn(`[ECSStateProvider] No service found for deployment history: ${serviceName}`);
        return [];
      }

      const deployments = (response.services[0].deployments ?? []).slice(0, limit);

      const results: Deployment[] = await Promise.all(
        deployments.map(async (dep) => {
          const taskDefArn = dep.taskDefinition ?? '';
          let image: string | undefined;

          if (taskDefArn) {
            try {
              const taskDefResponse = await this.client.send(
                new DescribeTaskDefinitionCommand({ taskDefinition: taskDefArn })
              );

              const containers =
                taskDefResponse.taskDefinition?.containerDefinitions ?? [];
              image = containers[0]?.image;
            } catch (taskDefError) {
              console.warn(
                `[ECSStateProvider] Could not fetch task definition ${taskDefArn}:`,
                taskDefError
              );
            }
          }

          // Extraer revisión del ARN para usar como versión
          const revisionMatch = taskDefArn.match(/:(\d+)$/);
          const version = revisionMatch ? revisionMatch[1] : undefined;

          return {
            name: dep.id ?? serviceName,
            timestamp: dep.createdAt ?? new Date(),
            version,
            image,
            replicas: dep.desiredCount ?? 1,
            changedBy: dep.launchType,
          };
        })
      );

      console.log(
        `[ECSStateProvider] getDeploymentHistory: found ${results.length} deployments for ${serviceName}`
      );
      return results;
    } catch (error) {
      console.error(
        `[ECSStateProvider] Error getting deployment history for ${serviceName}:`,
        error
      );
      return [];
    }
  }

  async getDependencies(serviceName: string): Promise<ServiceDependency[]> {
    try {
      console.log(`[ECSStateProvider] getDependencies for: ${serviceName}`);

      // Listar todos los servicios del cluster
      const listResponse = await this.client.send(
        new ListServicesCommand({ cluster: this.cluster })
      );

      const allArns = listResponse.serviceArns ?? [];
      if (allArns.length === 0) return [];

      // Obtener servicios relacionados filtrando por nombre
      const relatedArns = allArns.filter((arn) => {
        const arnServiceName = arn.split('/').pop() ?? '';
        return (
          arnServiceName !== serviceName &&
          this.isRelatedService(serviceName, arnServiceName)
        );
      });

      if (relatedArns.length === 0) {
        console.log(`[ECSStateProvider] No related services found for: ${serviceName}`);
        return [];
      }

      // DescribeServices acepta máximo 10 a la vez
      const chunks = this.chunkArray(relatedArns, 10);
      const dependencies: ServiceDependency[] = [];

      for (const chunk of chunks) {
        const descResponse = await this.client.send(
          new DescribeServicesCommand({
            cluster: this.cluster,
            services: chunk,
          })
        );

        for (const svc of descResponse.services ?? []) {
          const svcName = svc.serviceName ?? svc.serviceArn?.split('/').pop() ?? 'unknown';
          const running = svc.runningCount ?? 0;
          const desired = svc.desiredCount ?? 0;

          let status: ServiceDependency['status'] = 'unknown';
          if (desired === 0) {
            status = 'unknown';
          } else if (running === desired) {
            status = 'healthy';
          } else if (running > 0) {
            status = 'degraded';
          } else {
            status = 'failed';
          }

          dependencies.push({
            name: svcName,
            status,
            latency: undefined, // requiere métricas externas
            errorRate: undefined,
          });
        }
      }

      console.log(
        `[ECSStateProvider] getDependencies: found ${dependencies.length} dependencies for ${serviceName}`
      );
      return dependencies;
    } catch (error) {
      console.error(
        `[ECSStateProvider] Error getting dependencies for ${serviceName}:`,
        error
      );
      return [];
    }
  }

  async findServicesByLabel(label: string, value: string): Promise<string[]> {
    try {
      console.log(
        `[ECSStateProvider] findServicesByLabel: ${label}=${value} in cluster ${this.cluster}`
      );

      // ECS tags requieren llamadas adicionales (ListTagsForResource).
      // Estrategia simplificada: listar todos los servicios y filtrar los que
      // contengan el valor del label en su nombre (convención de naming).
      const listResponse = await this.client.send(
        new ListServicesCommand({ cluster: this.cluster })
      );

      const arns = listResponse.serviceArns ?? [];
      const matchingNames: string[] = [];

      for (const arn of arns) {
        const svcName = arn.split('/').pop() ?? '';
        // Convención: servicios tagueados con label suelen incluirlo en el nombre
        if (svcName.toLowerCase().includes(value.toLowerCase())) {
          matchingNames.push(svcName);
        }
      }

      console.log(
        `[ECSStateProvider] findServicesByLabel: found ${matchingNames.length} services matching ${label}=${value}`
      );
      return matchingNames;
    } catch (error) {
      console.error(
        `[ECSStateProvider] Error finding services by label ${label}=${value}:`,
        error
      );
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      console.log(`[ECSStateProvider] Running health check on cluster: ${this.cluster}`);
      await this.client.send(
        new ListServicesCommand({ cluster: this.cluster, maxResults: 1 })
      );
      console.log('[ECSStateProvider] Health check passed');
      return true;
    } catch (error) {
      console.error('[ECSStateProvider] Health check failed:', error);
      return false;
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Determina si dos nombres de servicios son probablemente relacionados
   * Compara prefijos o sufijos comunes separados por guiones
   */
  private isRelatedService(source: string, target: string): boolean {
    const sourceParts = source.split('-');
    const targetParts = target.split('-');

    // Prefijo común (primer segmento)
    if (sourceParts[0] && targetParts[0] && sourceParts[0] === targetParts[0]) {
      return true;
    }

    // Sufijo común (último segmento)
    const sourceLast = sourceParts[sourceParts.length - 1];
    const targetLast = targetParts[targetParts.length - 1];
    if (sourceLast && targetLast && sourceLast === targetLast) {
      return true;
    }

    // Palabras clave de infraestructura compartidas
    const infraKeywords = ['db', 'cache', 'queue', 'api', 'worker', 'auth', 'gateway'];
    for (const keyword of infraKeywords) {
      if (source.includes(keyword) && target.includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Divide un array en chunks de tamaño máximo dado
   */
  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Retorna un snapshot de estado desconocido para casos de error
   */
  private buildUnknownSnapshot(serviceName: string): ServiceStatusSnapshot {
    return {
      name: serviceName,
      namespace: this.cluster,
      replicas: { desired: 0, ready: 0 },
      recentDeploy: false,
      restartCount: 0,
      status: 'Unknown',
      lastUpdate: new Date(),
    };
  }
}
