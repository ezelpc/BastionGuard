import * as k8s from "@kubernetes/client-node";
import { KubernetesConfig, RestartParams, ScaleParams } from "./types";

export class KubernetesProvider {
  private appsApi: k8s.AppsV1Api;
  private namespace: string;

  public constructor(config: KubernetesConfig) {
    this.namespace = config.namespace;

    const kc = new k8s.KubeConfig();

    if (config.kubeConfigPath) {
      kc.loadFromFile(config.kubeConfigPath);
    } else {
      try {
        kc.loadFromCluster();
        console.log(`[K8S] Configuración cargada desde cluster`);
      } catch {
        kc.loadFromDefault();
        console.log(`[K8S] Configuración cargada desde kubeconfig local`);
      }
    }

    this.appsApi = kc.makeApiClient(k8s.AppsV1Api);
  }

  public async restartService(params: RestartParams): Promise<string> {
    const namespace = params.namespace ?? this.namespace;
    const name = params.service;

    console.log(`[K8S] Reiniciando deployment: ${name} en ${namespace}`);

    const patch = {
      spec: {
        template: {
          metadata: {
            annotations: {
              "bastionguard/restartedAt": new Date().toISOString(),
            },
          },
        },
      },
    };

    await this.appsApi.patchNamespacedDeployment({
      name,
      namespace,
      body: patch,
      options: {
        headers: {
          "Content-Type": "application/strategic-merge-patch+json",
        },
      },
    } as unknown as k8s.AppsV1ApiPatchNamespacedDeploymentRequest);

    return `Deployment ${name} reiniciado con rolling restart en ${namespace}`;
  }

  public async scaleReplicas(params: ScaleParams): Promise<string> {
    const namespace = params.namespace ?? this.namespace;
    const name = params.service;

    console.log(`[K8S] Escalando ${name} a ${params.replicas} réplicas en ${namespace}`);

    const patch = {
      spec: {
        replicas: params.replicas,
      },
    };

    await this.appsApi.patchNamespacedDeployment({
      name,
      namespace,
      body: patch,
      options: {
        headers: {
          "Content-Type": "application/strategic-merge-patch+json",
        },
      },
    } as unknown as k8s.AppsV1ApiPatchNamespacedDeploymentRequest);

    return `Deployment ${name} escalado a ${params.replicas} réplicas en ${namespace}`;
  }

  public async getDeploymentStatus(
    name: string,
    namespace?: string
  ): Promise<{ ready: number; desired: number }> {
    const ns = namespace ?? this.namespace;

    const deployment = await this.appsApi.readNamespacedDeployment({
      name,
      namespace: ns,
    } as k8s.AppsV1ApiReadNamespacedDeploymentRequest);

    return {
      desired: deployment.spec?.replicas ?? 0,
      ready: deployment.status?.readyReplicas ?? 0,
    };
  }
}
