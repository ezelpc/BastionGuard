import {
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  ECSClientConfig,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";
import { ECSConfig, RestartTaskParams, ScaleTaskParams, UpdateTaskDefinitionParams } from "./types";

export class ECSProvider {
  private client: ECSClient;

  public constructor(config: ECSConfig) {
    console.log(`[ECS] Inicializando proveedor para región: ${config.region}`);

    const clientConfig: ECSClientConfig = {
      region: config.region,
    };

    // Si se proporcionan credenciales explícitas, usarlas
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.client = new ECSClient(clientConfig);
  }

  public async scaleTask(params: ScaleTaskParams): Promise<string> {
    const { cluster, service, desiredCount } = params;

    console.log(
      `[ECS] Escalando servicio: ${service} en cluster ${cluster} a ${desiredCount} tareas`
    );

    try {
      // Verificar que el servicio existe
      const describeCmd = new DescribeServicesCommand({
        cluster,
        services: [service],
      });

      const describeResponse = await this.client.send(describeCmd);

      if (!describeResponse.services || describeResponse.services.length === 0) {
        throw new Error(`Servicio ${service} no encontrado en cluster ${cluster}`);
      }

      // Actualizar desiredCount
      const updateCmd = new UpdateServiceCommand({
        cluster,
        service,
        desiredCount,
      });

      const response = await this.client.send(updateCmd);

      return `Servicio ${service} escalado a ${desiredCount} tareas. ARN: ${response.service?.serviceArn}`;
    } catch (err) {
      throw new Error(`Error escalando ECS: ${String(err)}`);
    }
  }

  public async restartTask(params: RestartTaskParams): Promise<string> {
    const { cluster, service } = params;

    console.log(`[ECS] Reiniciando tareas del servicio: ${service} en cluster ${cluster}`);

    try {
      // Forzar nuevo despliegue actualizando forceNewDeployment
      const updateCmd = new UpdateServiceCommand({
        cluster,
        service,
        forceNewDeployment: true,
      });

      const response = await this.client.send(updateCmd);

      return `Tareas del servicio ${service} reiniciadas. Nuevo despliegue forzado. ARN: ${response.service?.serviceArn}`;
    } catch (err) {
      throw new Error(`Error reiniciando tareas ECS: ${String(err)}`);
    }
  }

  public async updateTaskDefinition(params: UpdateTaskDefinitionParams): Promise<string> {
    const { cluster, service, taskDefinitionArn } = params;

    console.log(`[ECS] Actualizando definición de tarea de ${service} a ${taskDefinitionArn}`);

    try {
      // Verificar que la task definition existe
      const describeTaskDefCmd = new DescribeTaskDefinitionCommand({
        taskDefinition: taskDefinitionArn,
      });

      await this.client.send(describeTaskDefCmd);

      // Actualizar el servicio con la nueva task definition
      const updateCmd = new UpdateServiceCommand({
        cluster,
        service,
        taskDefinition: taskDefinitionArn,
      });

      const response = await this.client.send(updateCmd);

      return `Definición de tarea de ${service} actualizada a ${taskDefinitionArn}. ARN: ${response.service?.serviceArn}`;
    } catch (err) {
      throw new Error(`Error actualizando task definition: ${String(err)}`);
    }
  }
}
