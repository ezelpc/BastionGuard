/**
 * ProviderFactory
 * Crea instancias de providers basado en configuración.
 * Soporta: Prometheus, Datadog, CloudWatch, New Relic (metrics)
 *           Elasticsearch, CloudWatch Logs, Loki, New Relic (logs)
 *           Kubernetes, ECS, Docker Swarm (state)
 */

import {
  MetricsProvider,
  LogProvider,
  StateProvider,
  ProvidersConfig,
} from "./types";
import { PrometheusMetricsProvider } from "./prometheus/PrometheusMetricsProvider";
import { K8sStateProvider } from "./kubernetes/K8sStateProvider";
import { ElasticsearchLogProvider } from "./elasticsearch/ElasticsearchLogProvider";
import { LokiLogProvider } from "./loki/LokiLogProvider";
import { ECSStateProvider } from "./ecs/ECSStateProvider";
import { DockerSwarmStateProvider } from "./docker-swarm/DockerSwarmStateProvider";
import { CloudWatchMetricsProvider } from "./cloudwatch/CloudWatchMetricsProvider";
import { CloudWatchLogsProvider } from "./cloudwatch/CloudWatchLogsProvider";
import { DatadogMetricsProvider } from "./datadog/DatadogMetricsProvider";
import { NewRelicMetricsProvider } from "./newrelic/NewRelicMetricsProvider";
import { NewRelicLogsProvider } from "./newrelic/NewRelicLogsProvider";

export class ProviderFactory {
  static createMetricsProvider(config: ProvidersConfig["metrics"]): MetricsProvider {
    console.log(`[ProviderFactory] Creando metrics provider: ${config.type}`);

    switch (config.type) {
      case "prometheus":
        return new PrometheusMetricsProvider({
          url: config.config.url || process.env.PROMETHEUS_URL || "http://localhost:9090",
          timeout: config.config.timeout || 30000,
        });

      case "datadog":
        if (!config.config.apiKey && !process.env.DATADOG_API_KEY) {
          throw new Error("Datadog requiere DATADOG_API_KEY");
        }
        return new DatadogMetricsProvider({
          apiKey: config.config.apiKey || process.env.DATADOG_API_KEY!,
          appKey: config.config.appKey || process.env.DATADOG_APP_KEY || "",
          site: config.config.site || process.env.DATADOG_SITE || "datadoghq.com",
        });

      case "cloudwatch":
        return new CloudWatchMetricsProvider({
          region: config.config.region || process.env.AWS_REGION || "us-east-1",
          accessKeyId: config.config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
        });

      case "newrelic":
        if (!config.config.apiKey && !process.env.NEWRELIC_API_KEY) {
          throw new Error("New Relic requiere NEWRELIC_API_KEY");
        }
        return new NewRelicMetricsProvider({
          apiKey: config.config.apiKey || process.env.NEWRELIC_API_KEY!,
          accountId: config.config.accountId || process.env.NEWRELIC_ACCOUNT_ID || "",
          region: (config.config.region || process.env.NEWRELIC_REGION || "US") as "US" | "EU",
        });

      default:
        throw new Error(`Unknown metrics provider: ${(config as any).type}`);
    }
  }

  static createLogProvider(config: ProvidersConfig["logs"]): LogProvider {
    console.log(`[ProviderFactory] Creando log provider: ${config.type}`);

    switch (config.type) {
      case "elasticsearch":
        return new ElasticsearchLogProvider({
          node: config.config.node || process.env.ELASTICSEARCH_URL || "http://localhost:9200",
          username: config.config.username || process.env.ELASTICSEARCH_USER,
          password: config.config.password || process.env.ELASTICSEARCH_PASSWORD,
          apiKey: config.config.apiKey || process.env.ELASTICSEARCH_API_KEY,
          index: config.config.index || process.env.ELASTICSEARCH_INDEX || "logs-*",
        });

      case "cloudwatch":
        return new CloudWatchLogsProvider({
          region: config.config.region || process.env.AWS_REGION || "us-east-1",
          logGroupPrefix: config.config.logGroupPrefix || process.env.AWS_CLOUDWATCH_LOG_GROUP_PREFIX,
          accessKeyId: config.config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
        });

      case "loki":
        return new LokiLogProvider({
          url: config.config.url || process.env.LOKI_URL || "http://localhost:3100",
          orgId: config.config.orgId || process.env.LOKI_ORG_ID,
          username: config.config.username || process.env.LOKI_USERNAME,
          password: config.config.password || process.env.LOKI_PASSWORD,
        });

      case "newrelic":
        if (!config.config.apiKey && !process.env.NEWRELIC_API_KEY) {
          throw new Error("New Relic requiere NEWRELIC_API_KEY");
        }
        return new NewRelicLogsProvider({
          apiKey: config.config.apiKey || process.env.NEWRELIC_API_KEY!,
          accountId: config.config.accountId || process.env.NEWRELIC_ACCOUNT_ID || "",
          region: (config.config.region || process.env.NEWRELIC_REGION || "US") as "US" | "EU",
        });

      default:
        throw new Error(`Unknown log provider: ${(config as any).type}`);
    }
  }

  static createStateProvider(config: ProvidersConfig["state"]): StateProvider {
    console.log(`[ProviderFactory] Creando state provider: ${config.type}`);

    switch (config.type) {
      case "kubernetes":
        return new K8sStateProvider({
          namespace: config.config.namespace || process.env.K8S_NAMESPACE || "default",
          kubeConfigPath: config.config.kubeConfigPath || process.env.KUBECONFIG,
          inCluster: config.config.inCluster !== false,
        });

      case "ecs":
        return new ECSStateProvider({
          region: config.config.region || process.env.AWS_REGION || "us-east-1",
          cluster: config.config.cluster || process.env.AWS_ECS_CLUSTER || "default",
          accessKeyId: config.config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
        });

      case "docker-swarm":
        return new DockerSwarmStateProvider({
          socketPath: config.config.socketPath || process.env.DOCKER_HOST || "/var/run/docker.sock",
          host: config.config.host,
          port: config.config.port,
        });

      default:
        throw new Error(`Unknown state provider: ${(config as any).type}`);
    }
  }

  /**
   * Crear todos los providers con configuración
   */
  static createAll(config: ProvidersConfig) {
    return {
      metrics: this.createMetricsProvider(config.metrics),
      logs: this.createLogProvider(config.logs),
      state: this.createStateProvider(config.state),
    };
  }

  /**
   * Crear desde variables de entorno (sin config explícita)
   */
  static createFromEnv() {
    const metricsType = (process.env.METRICS_PROVIDER || "prometheus") as ProvidersConfig["metrics"]["type"];
    const logsType = (process.env.LOG_PROVIDER || "elasticsearch") as ProvidersConfig["logs"]["type"];
    const stateType = (process.env.STATE_PROVIDER || "kubernetes") as ProvidersConfig["state"]["type"];

    return this.createAll({
      metrics: { type: metricsType, config: {} },
      logs: { type: logsType, config: {} },
      state: { type: stateType, config: {} },
    });
  }

  /**
   * Crear con defaults para testing local (Prometheus + Elasticsearch + K8s)
   */
  static createDefaults() {
    return this.createAll({
      metrics: {
        type: "prometheus",
        config: { url: "http://localhost:9090" },
      },
      logs: {
        type: "elasticsearch",
        config: { node: "http://localhost:9200" },
      },
      state: {
        type: "kubernetes",
        config: { namespace: "default", inCluster: false },
      },
    });
  }
}
