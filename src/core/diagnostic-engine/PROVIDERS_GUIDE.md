# 🔧 Diagnostic Engine - Providers Guía

## Resumen

El **DiagnosticEngine** es ahora completamente **modular** y **extensible**. Ya no usa mock data, sino que consulta **datos reales** de:

- **Métricas:** Prometheus, Datadog, CloudWatch
- **Logs:** Elasticsearch, CloudWatch Logs, Grafana Loki
- **Estado:** Kubernetes, ECS, Docker Swarm

## Arquitectura

```
┌─────────────────────────────────────────┐
│     DiagnosticEngine (New)              │
│  - Consulta datos REALES, no mock       │
│  - Análisis de causa raíz (RCA)         │
│  - Detección de anomalías               │
└──────────────┬──────────────────────────┘
               │
      ┌────────┼─────────┐
      │        │         │
      ▼        ▼         ▼
┌──────────┐ ┌──────┐ ┌────────┐
│Metrics  │ │ Logs │ │ State  │
│Provider │ │Prov. │ │Prov.   │
└──────────┘ └──────┘ └────────┘
      │        │         │
      ▼        ▼         ▼
┌────────────────────────────────────────┐
│   DATOS REALES (Prometheus, ES, K8s)   │
└────────────────────────────────────────┘
```

## Instalación de Dependencias

```bash
# Kubernetes provider
npm install @kubernetes/client-node

# Elasticsearch provider
npm install @elastic/elasticsearch

# Prometheus provider (axios ya está instalado)
# npm install axios

# Para testing local
docker-compose up prometheus elasticsearch  # Ver docker-compose.yml
```

## Configuración

### Variables de Entorno

```bash
# Metrics Provider
METRICS_PROVIDER=prometheus                 # prometheus | datadog | cloudwatch
PROMETHEUS_URL=http://localhost:9090

# Logs Provider
LOG_PROVIDER=elasticsearch                  # elasticsearch | cloudwatch | loki
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=password
# O usar API key:
ELASTICSEARCH_API_KEY=id:api_key_here

# State Provider
STATE_PROVIDER=kubernetes                   # kubernetes | ecs | docker-swarm
K8S_NAMESPACE=default
KUBECONFIG=/path/to/kubeconfig             # Optional, auto-detect in-cluster
```

### Configuración Programática

```typescript
import { ProviderFactory } from './core/diagnostic-engine/data-sources/ProviderFactory';
import { DiagnosticEngine } from './core/diagnostic-engine/DiagnosticEngine';

// Crear con configuración personalizada
const providers = ProviderFactory.createAll({
  metrics: {
    type: 'prometheus',
    config: {
      url: 'http://prometheus.monitoring:9090',
      timeout: 30000
    }
  },
  logs: {
    type: 'elasticsearch',
    config: {
      node: 'http://elasticsearch.logging:9200',
      username: 'elastic',
      password: 'your-password'
    }
  },
  state: {
    type: 'kubernetes',
    config: {
      namespace: 'production',
      inCluster: true
    }
  }
});

const diagnostic = new DiagnosticEngine(
  providers.metrics,
  providers.logs,
  providers.state,
  undefined,
  'production'
);
```

## Uso

### Diagnóstico Básico

```typescript
const alert = {
  id: '123',
  source: 'prometheus',
  service: 'api-gateway',
  severity: 'critical',
  title: 'High CPU Usage',
  description: 'CPU usage above 80%',
  timestamp: new Date().toISOString()
};

const report = await diagnostic.diagnose(alert);

console.log(report);
// {
//   alert,
//   generatedAt: '2026-05-31T...',
//   service: { name, replicas, status, ... },
//   rootCauseAnalysis: {
//     topCause: { cause, confidence, indicators, suggestedFixes },
//     allCauses: [...],
//     analysisQuality: 0.85,
//     dataQuality: 'high'
//   },
//   metrics: [...],
//   logs: [...],
//   errorRate: 0.05,
//   confidence: 0.82,
//   executionTime: 1234
// }
```

## Providers Disponibles

### MetricsProvider

```typescript
interface MetricsProvider {
  name: string;
  queryMetric(query: string, timeRange: TimeRange): Promise<MetricData>;
  queryTimeseries(query: string, timeRange: TimeRange): Promise<MetricTimeseries[]>;
  getAvailableMetrics(service?: string): Promise<string[]>;
  healthCheck(): Promise<boolean>;
}
```

**Implementaciones:**
- ✅ `PrometheusMetricsProvider` - Consultador de Prometheus
- ⏳ `DatadogMetricsProvider` - En desarrollo
- ⏳ `CloudWatchMetricsProvider` - En desarrollo

**Ejemplo:**
```typescript
const prometheus = new PrometheusMetricsProvider({
  url: 'http://localhost:9090'
});

const metrics = await prometheus.queryTimeseries(
  'rate(http_requests_total{job="api-gateway"}[5m])',
  {
    start: new Date(Date.now() - 2 * 60 * 60 * 1000),
    end: new Date(),
    step: '1m'
  }
);
```

### LogProvider

```typescript
interface LogProvider {
  name: string;
  queryLogs(filters: LogFilter, timeRange: TimeRange): Promise<LogQueryResult>;
  getErrorRate(service: string, timeRange: TimeRange): Promise<number>;
  getRecentErrors(service: string, limit: number): Promise<LogEntry[]>;
  healthCheck(): Promise<boolean>;
}
```

**Implementaciones:**
- ✅ `ElasticsearchLogProvider` - Consulta logs en Elasticsearch
- ⏳ `CloudWatchLogsProvider` - En desarrollo
- ⏳ `LokiLogProvider` - En desarrollo

**Ejemplo:**
```typescript
const elasticsearch = new ElasticsearchLogProvider({
  node: 'http://localhost:9200'
});

const logs = await elasticsearch.queryLogs(
  {
    service: 'api-gateway',
    level: ['error', 'warn'],
    keywords: ['timeout', 'connection']
  },
  {
    start: new Date(Date.now() - 30 * 60 * 1000),
    end: new Date()
  }
);
```

### StateProvider

```typescript
interface StateProvider {
  name: string;
  getServiceStatus(serviceName: string): Promise<ServiceStatusSnapshot>;
  getDeploymentHistory(serviceName: string, limit: number): Promise<Deployment[]>;
  getDependencies(serviceName: string): Promise<ServiceDependency[]>;
  findServicesByLabel(label: string, value: string): Promise<string[]>;
  healthCheck(): Promise<boolean>;
}
```

**Implementaciones:**
- ✅ `K8sStateProvider` - Consulta estado en Kubernetes
- ⏳ `ECSStateProvider` - En desarrollo
- ⏳ `DockerSwarmStateProvider` - En desarrollo

**Ejemplo:**
```typescript
const k8s = new K8sStateProvider({
  namespace: 'production'
});

const status = await k8s.getServiceStatus('api-gateway');
console.log(status);
// {
//   name: 'api-gateway',
//   replicas: { desired: 3, ready: 3, updated: 3 },
//   cpuPercent: 45.2,
//   memoryPercent: 62.1,
//   recentDeploy: true,
//   deployedAt: '2026-05-31T10:15:00Z',
//   restartCount: 2,
//   status: 'Running'
// }
```

## Análisis de Causa Raíz (RCA)

El motor RCA **automáticamente** detecta:

- 🔴 **Deployments recientes** que introdujeron bugs
- 📊 **Exhaustión de recursos** (CPU, Memory)
- 🔄 **Replica crashes** (crash loops)
- ⚠️ **Errores en logs** (patrones de error)
- 🔗 **Problemas de conectividad** (timeouts, conexiones)
- 📈 **Anomalías en métricas** (desviaciones estadísticas)

**Resultado:**
```typescript
{
  topCause: {
    cause: "Deployment reciente introdujo bug o regressión",
    confidence: 0.92,
    indicators: [
      "Deployment hace 5 minutos",
      "Error rate spike: 8.50%",
      "Timing coincide"
    ],
    severity: "critical",
    suggestedFixes: [
      "Rollback a versión anterior",
      "Escalar para investigar",
      "Ejecutar canarios en testing"
    ]
  },
  allCauses: [...],
  analysisQuality: 0.87,
  dataQuality: 'high'
}
```

## Testing Local

### Setup Rápido

```bash
# 1. Levantar servicios
docker-compose up -d prometheus elasticsearch

# 2. Generar datos de prueba en Prometheus
# Usar script: scripts/generate-metrics.sh

# 3. Generar logs en Elasticsearch
# curl -X POST http://localhost:9200/logs-2026.05.31/_doc \
#   -H 'Content-Type: application/json' \
#   -d '{"@timestamp":"2026-05-31T...","service":"api-gateway","message":"Error..."}'

# 4. Ejecutar con providers reales
METRICS_PROVIDER=prometheus \
LOG_PROVIDER=elasticsearch \
STATE_PROVIDER=kubernetes \
npm run dev
```

### Mock para Testing

Si no tienes servicios reales corriendo, crea mock providers:

```typescript
// src/core/diagnostic-engine/data-sources/__mocks__/MockMetricsProvider.ts
export class MockMetricsProvider implements MetricsProvider {
  name = 'mock';
  
  async queryTimeseries(query: string, timeRange: TimeRange) {
    return [{
      name: 'http_requests_total',
      labels: { job: 'api-gateway' },
      points: [
        { timestamp: new Date(), value: 100 },
        { timestamp: new Date(), value: 105 }
      ]
    }];
  }
  // ...
}
```

## Roadmap de Implementación

- ✅ **Fase 1:** PrometheusMetricsProvider, K8sStateProvider, ElasticsearchLogProvider
- ⏳ **Fase 2:** DatadogMetricsProvider, ECSStateProvider, CloudWatchLogsProvider
- ⏳ **Fase 3:** LokiLogProvider, DockerSwarmStateProvider, custom webhook providers

## Troubleshooting

### "Prometheus connection refused"
```bash
# Verificar que Prometheus está corriendo
curl http://localhost:9090/-/healthy

# Configurar URL correcta
export PROMETHEUS_URL=http://your-prometheus:9090
```

### "Elasticsearch connection timeout"
```bash
# Verificar conectividad
curl http://localhost:9200/

# Verificar autenticación
export ELASTICSEARCH_USER=elastic
export ELASTICSEARCH_PASSWORD=your-password
```

### "Kubernetes connection error"
```bash
# Si está en cluster, no necesita KUBECONFIG
# Si está local, usar:
export KUBECONFIG=~/.kube/config

# Verificar acceso
kubectl auth can-i get deployments --all-namespaces
```

## Performance

- **Prometheus queries:** ~100-200ms
- **Elasticsearch queries:** ~50-150ms
- **Kubernetes API calls:** ~100-300ms
- **Total diagnosis:** ~500-1000ms (depende de datos disponibles)

Use **caching** para queries frecuentes:

```typescript
const cache = new RedisCache(); // Implementar según necesidad

const diagnostic = new DiagnosticEngine(
  metricsProvider,
  logsProvider,
  stateProvider,
  cache  // Parámetro opcional
);
```

## Ejemplos Completos

Ver [IMPLEMENTATION_ROADMAP.md](../../IMPLEMENTATION_ROADMAP.md) para ejemplos de código completo.

