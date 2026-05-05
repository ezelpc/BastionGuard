export interface KubernetesConfig {
  namespace: string;
  kubeConfigPath?: string; // si no se pasa, usa el default ~/.kube/config
}

export interface ScaleParams {
  service: string;
  replicas: number;
  namespace?: string;
}

export interface RestartParams {
  service: string;
  namespace?: string;
}
