export interface DockerSwarmConfig {
  socketPath?: string; // default: /var/run/docker.sock
  host?: string; // alternative: tcp://localhost:2375
}

export interface ScaleServiceParams {
  service: string;
  mode: "replicated" | "global";
  replicas?: number; // required si mode=replicated
}

export interface RestartServiceParams {
  service: string;
}

export interface UpdateImageParams {
  service: string;
  image: string;
  registry?: string; // default: docker.io
}
