export interface ECSConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  // Si no se pasan, usa las credenciales del entorno o IAM role
}

export interface ScaleTaskParams {
  cluster: string;
  service: string;
  desiredCount: number;
}

export interface RestartTaskParams {
  cluster: string;
  service: string;
}

export interface UpdateTaskDefinitionParams {
  cluster: string;
  service: string;
  taskDefinitionArn: string;
}
