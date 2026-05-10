import Docker from "dockerode";
import {
  DockerSwarmConfig,
  RestartServiceParams,
  ScaleServiceParams,
  UpdateImageParams,
} from "./types";

export class DockerSwarmProvider {
  private docker: Docker;

  public constructor(config: DockerSwarmConfig) {
    console.log(`[SWARM] Inicializando proveedor Docker Swarm`);

    const dockerConfig: any = {};

    if (config.host) {
      dockerConfig.host = config.host;
    } else if (config.socketPath) {
      dockerConfig.socketPath = config.socketPath;
    } else {
      // Default socket path para Linux
      dockerConfig.socketPath = "/var/run/docker.sock";
    }

    this.docker = new Docker(dockerConfig);
  }

  public async scaleService(params: ScaleServiceParams): Promise<string> {
    const { service, mode, replicas } = params;

    if (mode === "replicated" && !replicas) {
      throw new Error("replicas es requerido cuando mode=replicated");
    }

    console.log(`[SWARM] Escalando servicio: ${service} a ${replicas} réplicas (modo: ${mode})`);

    try {
      const svc = this.docker.getService(service);
      const info = await svc.inspect();

      // Actualizar spec del servicio
      const newSpec = {
        ...info.Spec,
        Mode: {
          [mode]: mode === "replicated" ? { Replicas: replicas } : {},
        },
      };

      await svc.update({
        version: info.Version.Index,
        spec: newSpec as any,
      });

      return `Servicio ${service} escalado a ${replicas} réplicas en modo ${mode}`;
    } catch (err) {
      throw new Error(`Error escalando Docker Swarm: ${String(err)}`);
    }
  }

  public async restartService(params: RestartServiceParams): Promise<string> {
    const { service } = params;

    console.log(`[SWARM] Reiniciando servicio: ${service}`);

    try {
      const svc = this.docker.getService(service);
      const info = await svc.inspect();

      // Forzar actualización modificando un timestamp
      const newSpec = {
        ...info.Spec,
        TaskTemplate: {
          ...info.Spec.TaskTemplate,
          ForceUpdate: (info.Spec.TaskTemplate?.ForceUpdate ?? 0) + 1,
        },
      };

      await svc.update({
        version: info.Version.Index,
        spec: newSpec as any,
      });

      return `Servicio ${service} reiniciado con fuerza`;
    } catch (err) {
      throw new Error(`Error reiniciando servicio Docker Swarm: ${String(err)}`);
    }
  }

  public async updateImage(params: UpdateImageParams): Promise<string> {
    const { service, image, registry } = params;

    const fullImage = registry ? `${registry}/${image}` : image;

    console.log(`[SWARM] Actualizando imagen de ${service} a ${fullImage}`);

    try {
      const svc = this.docker.getService(service);
      const info = await svc.inspect();

      // Actualizar imagen en el contenedor
      const newSpec = {
        ...info.Spec,
        TaskTemplate: {
          ...info.Spec.TaskTemplate,
          ContainerSpec: {
            ...info.Spec.TaskTemplate?.ContainerSpec,
            Image: fullImage,
          },
        },
      };

      await svc.update({
        version: info.Version.Index,
        spec: newSpec as any,
      });

      return `Imagen de ${service} actualizada a ${fullImage}`;
    } catch (err) {
      throw new Error(`Error actualizando imagen Docker Swarm: ${String(err)}`);
    }
  }
}
