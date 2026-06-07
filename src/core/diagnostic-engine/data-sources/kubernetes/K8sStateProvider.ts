/**
 * K8sStateProvider
 * Consulta estado real de servicios en Kubernetes
 */

import * as k8s from '@kubernetes/client-node';
import {
    Deployment,
    ServiceDependency,
    ServiceStatusSnapshot,
    StateProvider
} from '../types';

export interface K8sStateConfig {
  namespace?: string;
  kubeConfigPath?: string;
  inCluster?: boolean;
}

export class K8sStateProvider implements StateProvider {
  name = 'kubernetes';
  private api: k8s.AppsV1Api;
  private coreApi: k8s.CoreV1Api;
  private namespace: string;

  constructor(config: K8sStateConfig = {}) {
    const kc = new k8s.KubeConfig();

    if (config.inCluster !== false && this.isInCluster()) {
      kc.loadFromCluster();
    } else if (config.kubeConfigPath) {
      kc.loadFromFile(config.kubeConfigPath);
    } else {
      kc.loadFromDefault();
    }

    this.api = kc.makeApiClient(k8s.AppsV1Api);
    this.coreApi = kc.makeApiClient(k8s.CoreV1Api);
    this.namespace = config.namespace || 'default';
  }

  async getServiceStatus(
    serviceName: string,
    namespace?: string
  ): Promise<ServiceStatusSnapshot> {
    const ns = namespace || this.namespace;

    try {
      // Obtener Deployment
      const deployment = await this.api.readNamespacedDeployment({
        name: serviceName,
        namespace: ns,
      });

      const spec = deployment.spec!;
      const status = deployment.status!;

      // Obtener pods para contar restarts
      const pods = await this.coreApi.listNamespacedPod({
        namespace: ns,
        labelSelector: `app=${serviceName}`,
      });
      let restartCount = 0;
      let cpuPercent = 0;
      let memoryPercent = 0;

      if (pods.items.length > 0) {
        restartCount = pods.items.reduce((sum, pod) => {
          const containerStatus = pod.status?.containerStatuses?.[0];
          return sum + (containerStatus?.restartCount || 0);
        }, 0);
      }

      // Obtener métrica de CPU/Memory (simplificado, idealmente desde Prometheus)
      // TODO: integrar con metrics provider
      const resourceRequests = spec.template.spec?.containers?.[0].resources?.requests;
      if (resourceRequests) {
        // Parsing simplificado
        const cpuStr = resourceRequests.cpu as string;
        const memStr = resourceRequests.memory as string;

        if (cpuStr?.includes('m')) {
          cpuPercent = parseInt(cpuStr) / 1000;
        }
        if (memStr?.includes('Mi')) {
          memoryPercent = parseInt(memStr) / 1024; // MB to GB
        }
      }

      // Calcular si hay deploy reciente (última hora)
      const recentDeploy = status.observedGeneration === deployment.metadata?.generation;
      const deployedAt = deployment.metadata?.managedFields?.[0]?.time
        ? new Date(deployment.metadata.managedFields[0].time).toISOString()
        : new Date().toISOString();

      return {
        name: serviceName,
        namespace: ns,
        replicas: {
          desired: spec.replicas || 1,
          ready: status.readyReplicas || 0,
          updated: status.updatedReplicas,
          available: status.availableReplicas,
        },
        cpuPercent,
        memoryPercent,
        recentDeploy,
        deployedAt,
        restartCount,
        status: this.mapDeploymentStatus(status),
        lastUpdate: new Date(),
      };
    } catch (error) {
      console.error(
        `[K8sStateProvider] Error getting status for ${serviceName}:`,
        error
      );

      // Return degraded state si no podemos consultar
      return {
        name: serviceName,
        namespace: ns,
        replicas: { desired: 0, ready: 0 },
        recentDeploy: false,
        restartCount: 0,
        status: 'Unknown',
        lastUpdate: new Date(),
      };
    }
  }

  async getDeploymentHistory(
    serviceName: string,
    limit: number = 10
  ): Promise<Deployment[]> {
    try {
      const replicaSets = await this.api.listNamespacedReplicaSet({
        namespace: this.namespace,
        labelSelector: `app=${serviceName}`,
      });

      return replicaSets.items
        .slice(0, limit)
        .map((rs) => ({
          name: rs.metadata?.name || serviceName,
          timestamp: rs.metadata?.creationTimestamp
            ? new Date(rs.metadata.creationTimestamp)
            : new Date(),
          version: rs.metadata?.labels?.['version'] || rs.metadata?.name?.split('-').pop(),
          image: rs.spec?.template?.spec?.containers?.[0].image,
          replicas: rs.spec?.replicas || 1,
          changedBy: rs.metadata?.labels?.['changedBy'],
        }));
    } catch (error) {
      console.error(`[K8sStateProvider] Error getting deployment history:`, error);
      return [];
    }
  }

  async getDependencies(serviceName: string): Promise<ServiceDependency[]> {
    try {
      // Obtener todos los servicios
      const services = await this.coreApi.listNamespacedService({
        namespace: this.namespace,
      });

      // Buscar servicios que tiene endpoints relacionados
      const dependencies: ServiceDependency[] = [];

      for (const service of services.items) {
        const svcName = service.metadata?.name || '';

        // Simples heurística: si el nombre contiene keywords comunes
        if (this.isLikelyDependency(serviceName, svcName)) {
          // Obtener endpoints para ver si está activo
          const endpoints = await this.coreApi.readNamespacedEndpoints({
            name: svcName,
            namespace: this.namespace,
          });

          const isHealthy =
            endpoints.subsets?.some((s) => (s.addresses?.length || 0) > 0) ?? false;

          dependencies.push({
            name: svcName,
            status: isHealthy ? 'healthy' : 'degraded',
            latency: undefined, // TODO: obtener de Prometheus
            errorRate: undefined, // TODO: obtener de Prometheus
          });
        }
      }

      return dependencies;
    } catch (error) {
      console.error(`[K8sStateProvider] Error getting dependencies:`, error);
      return [];
    }
  }

  async findServicesByLabel(label: string, value: string): Promise<string[]> {
    try {
      const deployments = await this.api.listNamespacedDeployment({
        namespace: this.namespace,
        labelSelector: `${label}=${value}`,
      });

      return deployments.items.map((d) => d.metadata?.name || '').filter(Boolean);
    } catch (error) {
      console.error(`[K8sStateProvider] Error finding services by label:`, error);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const nodes = await this.coreApi.listNode();
      return (nodes.items?.length || 0) > 0;
    } catch (error) {
      console.error('[K8sStateProvider] Health check failed:', error);
      return false;
    }
  }

  /**
   * Helpers
   */
  private mapDeploymentStatus(
    status: k8s.V1DeploymentStatus
  ): 'Running' | 'Pending' | 'Failed' | 'Unknown' {
    if (!status) return 'Unknown';

    if (
      status.readyReplicas === status.replicas &&
      status.updatedReplicas === status.replicas
    ) {
      return 'Running';
    }
    if (status.conditions?.some((c) => c.type === 'Progressing')) {
      return 'Pending';
    }
    if (status.conditions?.some((c) => c.reason === 'FailedCreate')) {
      return 'Failed';
    }
    return 'Unknown';
  }

  private isLikelyDependency(source: string, target: string): boolean {
    // Heurística simple: servicios con nombres relacionados
    const keywords = ['db', 'cache', 'queue', 'api', 'worker', 'scheduler'];

    for (const keyword of keywords) {
      if (source.includes(keyword) && target.includes(keyword)) {
        return target !== source;
      }
    }

    return false;
  }

  private isInCluster(): boolean {
    return (
      !!process.env.KUBERNETES_SERVICE_HOST &&
      !!process.env.KUBERNETES_SERVICE_PORT
    );
  }
}
