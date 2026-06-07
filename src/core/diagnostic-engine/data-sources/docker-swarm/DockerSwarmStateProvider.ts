/**
 * DockerSwarmStateProvider
 * Consulta estado real de servicios en Docker Swarm
 */

import Dockerode from 'dockerode';
import {
  Deployment,
  ServiceDependency,
  ServiceStatusSnapshot,
  StateProvider,
} from '../types';

export interface DockerSwarmConfig {
  socketPath?: string;
  host?: string;
  port?: number;
  ca?: string;
  cert?: string;
  key?: string;
}

export class DockerSwarmStateProvider implements StateProvider {
  name = 'docker-swarm';
  private docker: Dockerode;

  constructor(config: DockerSwarmConfig = {}) {
    const { socketPath, host, port, ca, cert, key } = config;

    if (host && port) {
      // Conexión TCP (con o sin TLS)
      const dockerOptions: Dockerode.DockerOptions = {
        host,
        port,
      };

      if (ca && cert && key) {
        dockerOptions.ca = ca;
        dockerOptions.cert = cert;
        dockerOptions.key = key;
        dockerOptions.protocol = 'https';
      } else {
        dockerOptions.protocol = 'http';
      }

      this.docker = new Dockerode(dockerOptions);
      console.log(`[DockerSwarmStateProvider] Initialized with TCP: ${host}:${port}`);
    } else {
      // Conexión por Unix socket (por defecto)
      this.docker = new Dockerode({
        socketPath: socketPath || '/var/run/docker.sock',
      });
      console.log(
        `[DockerSwarmStateProvider] Initialized with socket: ${socketPath || '/var/run/docker.sock'}`
      );
    }
  }

  // ============================================================
  // PUBLIC INTERFACE METHODS
  // ============================================================

  async getServiceStatus(
    serviceName: string,
    _namespace?: string
  ): Promise<ServiceStatusSnapshot> {
    try {
      console.log(`[DockerSwarmStateProvider] getServiceStatus for: ${serviceName}`);

      const service = this.docker.getService(serviceName);
      const info = await service.inspect() as DockerodeServiceInspect;

      const desired = info.Spec?.Mode?.Replicated?.Replicas ?? 1;

      // Obtener tasks activas para contar las running
      const tasks = await this.docker.listTasks({
        filters: JSON.stringify({ service: [serviceName] }),
      }) as DockerodeTask[];

      const runningTasks = tasks.filter(
        (t) => t.Status?.State === 'running'
      ).length;

      // Deploy reciente: UpdatedAt dentro de la última hora
      const updatedAt = info.UpdatedAt ? new Date(info.UpdatedAt) : new Date(0);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentDeploy = updatedAt > oneHourAgo;

      const deployedAt = info.UpdatedAt
        ? new Date(info.UpdatedAt).toISOString()
        : new Date().toISOString();

      const status: ServiceStatusSnapshot['status'] =
        runningTasks === desired && desired > 0 ? 'Running' : 'Pending';

      console.log(
        `[DockerSwarmStateProvider] ${serviceName}: running=${runningTasks}, desired=${desired}, status=${status}, recentDeploy=${recentDeploy}`
      );

      return {
        name: serviceName,
        replicas: {
          desired,
          ready: runningTasks,
          available: runningTasks,
        },
        recentDeploy,
        deployedAt,
        restartCount: this.countRestarts(tasks),
        status,
        lastUpdate: new Date(),
      };
    } catch (error) {
      console.error(
        `[DockerSwarmStateProvider] Error getting status for ${serviceName}:`,
        error
      );
      return {
        name: serviceName,
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
      console.log(
        `[DockerSwarmStateProvider] getDeploymentHistory for: ${serviceName}, limit: ${limit}`
      );

      const service = this.docker.getService(serviceName);
      const info = await service.inspect() as DockerodeServiceInspect;

      const history: Deployment[] = [];

      // Versión actual
      const currentImage =
        info.Spec?.TaskTemplate?.ContainerSpec?.Image ?? 'unknown';
      const currentVersion = info.Version?.Index;

      history.push({
        name: `${serviceName}-v${currentVersion ?? 'current'}`,
        timestamp: info.UpdatedAt ? new Date(info.UpdatedAt) : new Date(),
        version: currentVersion !== undefined ? String(currentVersion) : undefined,
        image: currentImage,
        replicas: info.Spec?.Mode?.Replicated?.Replicas ?? 1,
        changedBy: 'docker-swarm',
      });

      // Versión anterior si existe PreviousSpec
      if (info.PreviousSpec) {
        const prevImage =
          info.PreviousSpec?.TaskTemplate?.ContainerSpec?.Image ?? 'unknown';
        const prevReplicas = info.PreviousSpec?.Mode?.Replicated?.Replicas ?? 1;

        history.push({
          name: `${serviceName}-previous`,
          timestamp: info.CreatedAt ? new Date(info.CreatedAt) : new Date(),
          version: 'previous',
          image: prevImage,
          replicas: prevReplicas,
          changedBy: 'docker-swarm',
        });
      }

      const result = history.slice(0, limit);
      console.log(
        `[DockerSwarmStateProvider] getDeploymentHistory: returning ${result.length} entries for ${serviceName}`
      );
      return result;
    } catch (error) {
      console.error(
        `[DockerSwarmStateProvider] Error getting deployment history for ${serviceName}:`,
        error
      );
      return [];
    }
  }

  async getDependencies(serviceName: string): Promise<ServiceDependency[]> {
    try {
      console.log(`[DockerSwarmStateProvider] getDependencies for: ${serviceName}`);

      // Obtener el servicio principal para conocer sus redes
      const serviceInspect = await this.docker.getService(serviceName).inspect() as DockerodeServiceInspect;
      const serviceNetworks = new Set<string>(
        (serviceInspect.Spec?.Networks ?? []).map((n) => n.Target ?? n.Aliases?.[0] ?? '')
          .filter(Boolean)
      );

      // Listar todos los servicios del swarm
      const allServices = await this.docker.listServices() as DockerodeServiceInspect[];
      const dependencies: ServiceDependency[] = [];

      for (const svc of allServices) {
        const svcName = svc.Spec?.Name ?? '';
        if (!svcName || svcName === serviceName) continue;

        // Determinar si el servicio comparte redes o tiene naming convention similar
        const svcNetworks = (svc.Spec?.Networks ?? []).map(
          (n) => n.Target ?? n.Aliases?.[0] ?? ''
        );
        const sharesNetwork = svcNetworks.some((net) => serviceNetworks.has(net));
        const relatedByName = this.isRelatedByName(serviceName, svcName);

        if (!sharesNetwork && !relatedByName) continue;

        // Obtener tasks del servicio candidato para ver si está running
        let depStatus: ServiceDependency['status'] = 'unknown';
        try {
          const tasks = await this.docker.listTasks({
            filters: JSON.stringify({ service: [svcName] }),
          }) as DockerodeTask[];

          const desired = svc.Spec?.Mode?.Replicated?.Replicas ?? 1;
          const running = tasks.filter((t) => t.Status?.State === 'running').length;

          if (running === desired && desired > 0) {
            depStatus = 'healthy';
          } else if (running > 0) {
            depStatus = 'degraded';
          } else {
            depStatus = 'failed';
          }
        } catch {
          depStatus = 'unknown';
        }

        dependencies.push({
          name: svcName,
          status: depStatus,
          latency: undefined,
          errorRate: undefined,
        });
      }

      console.log(
        `[DockerSwarmStateProvider] getDependencies: found ${dependencies.length} dependencies for ${serviceName}`
      );
      return dependencies;
    } catch (error) {
      console.error(
        `[DockerSwarmStateProvider] Error getting dependencies for ${serviceName}:`,
        error
      );
      return [];
    }
  }

  async findServicesByLabel(label: string, value: string): Promise<string[]> {
    try {
      console.log(
        `[DockerSwarmStateProvider] findServicesByLabel: ${label}=${value}`
      );

      const services = await this.docker.listServices({
        filters: JSON.stringify({ label: [`${label}=${value}`] }),
      }) as DockerodeServiceInspect[];

      const names = services
        .map((svc) => svc.Spec?.Name ?? '')
        .filter(Boolean);

      console.log(
        `[DockerSwarmStateProvider] findServicesByLabel: found ${names.length} services with ${label}=${value}`
      );
      return names;
    } catch (error) {
      console.error(
        `[DockerSwarmStateProvider] Error finding services by label ${label}=${value}:`,
        error
      );
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      console.log('[DockerSwarmStateProvider] Running health check...');
      await this.docker.ping();
      console.log('[DockerSwarmStateProvider] Health check passed — Docker daemon responded');
      return true;
    } catch (error) {
      console.error('[DockerSwarmStateProvider] Health check failed:', error);
      return false;
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Determina si dos nombres de servicios están relacionados por naming convention
   */
  private isRelatedByName(source: string, target: string): boolean {
    const sourceParts = source.split(/[-_]/);
    const targetParts = target.split(/[-_]/);

    // Prefijo común
    if (
      sourceParts[0] &&
      targetParts[0] &&
      sourceParts[0] === targetParts[0]
    ) {
      return true;
    }

    // Sufijo común
    const sourceLast = sourceParts[sourceParts.length - 1];
    const targetLast = targetParts[targetParts.length - 1];
    if (sourceLast && targetLast && sourceLast === targetLast) {
      return true;
    }

    return false;
  }

  /**
   * Cuenta el total de reinicios de tasks fallidas en el historial
   */
  private countRestarts(tasks: DockerodeTask[]): number {
    return tasks.filter(
      (t) =>
        t.Status?.State === 'failed' ||
        t.Status?.State === 'rejected' ||
        t.Status?.State === 'shutdown'
    ).length;
  }
}

// ============================================================
// TYPE HELPERS para la API de Dockerode (tipado parcial)
// ============================================================

interface DockerodeTaskStatus {
  State?: string;
  Message?: string;
  Err?: string;
}

interface DockerodeTask {
  ID?: string;
  Status?: DockerodeTaskStatus;
  Slot?: number;
  NodeID?: string;
}

interface DockerodeServiceNetworkAttachmentConfig {
  Target?: string;
  Aliases?: string[];
}

interface DockerodeContainerSpec {
  Image?: string;
}

interface DockerodeTaskTemplate {
  ContainerSpec?: DockerodeContainerSpec;
}

interface DockerodeReplicatedService {
  Replicas?: number;
}

interface DockerodeServiceMode {
  Replicated?: DockerodeReplicatedService;
}

interface DockerodeServiceSpec {
  Name?: string;
  Mode?: DockerodeServiceMode;
  Networks?: DockerodeServiceNetworkAttachmentConfig[];
  TaskTemplate?: DockerodeTaskTemplate;
  Labels?: Record<string, string>;
}

interface DockerodeServiceVersion {
  Index?: number;
}

interface DockerodeServiceInspect {
  ID?: string;
  Version?: DockerodeServiceVersion;
  CreatedAt?: string;
  UpdatedAt?: string;
  Spec?: DockerodeServiceSpec;
  PreviousSpec?: DockerodeServiceSpec;
  ServiceStatus?: {
    RunningTasks?: number;
    DesiredTasks?: number;
    CompletedTasks?: number;
  };
}
