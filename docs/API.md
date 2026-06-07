# BastionGuard API Documentation

## Overview

BastionGuard exposes a REST API with WebSocket support for real-time incident management and auto-remediation. This document describes all available endpoints and their usage.

**Base URL:** `http://localhost:3000`  
**Authentication:** Bearer token (JWT) required for most endpoints

---

## Authentication

All protected endpoints require an `Authorization` header with a Bearer token.

### POST /api/login

Obtain a JWT token for API access.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Response (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Headers for subsequent requests:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Alert Ingestion

### POST /webhook/:source

Receive alerts from monitoring systems (Prometheus, Grafana, CloudWatch, etc.).

**Parameters:**

- `source` (string): Alert source - `prometheus`, `grafana`, `cloudwatch`
- `X-API-Key` (header, production only): Tenant API key for authentication

**Prometheus Webhook Example:**

```bash
curl -X POST http://localhost:3000/webhook/prometheus \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "alerts": [
      {
        "status": "firing",
        "labels": {
          "alertname": "HighMemoryUsage",
          "severity": "critical",
          "job": "api-gateway",
          "instance": "api-1.prod.local:9090"
        },
        "annotations": {
          "summary": "High memory usage detected",
          "description": "Memory usage on api-gateway is 85%",
          "runbook_url": "https://wiki.example.com/runbooks/memory-usage"
        },
        "startsAt": "2026-05-31T04:30:00.000Z"
      }
    ]
  }'
```

**Grafana Webhook Example:**

```json
{
  "status": "firing",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "DiskSpaceWarning",
        "severity": "warning",
        "service": "database"
      },
      "annotations": {
        "description": "Disk usage is above 80%"
      }
    }
  ]
}
```

**Response (200 OK):**

```json
{
  "ok": true,
  "alertId": "alert-uuid-123",
  "message": "Alert received and queued for processing"
}
```

**Rate Limiting:**

- Max 100 alerts per minute
- Max 2000 alerts per hour
- Error 429 if exceeded

---

## Real-time Events (WebSocket)

### WS /socket.io

Connect to real-time event stream via WebSocket (Socket.IO).

**Connection:**

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: {
    token: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  },
});

socket.on("connect", () => {
  console.log("Connected to BastionGuard");
});
```

**Events:**

#### `alert`

Emitted when a new alert is received.

```javascript
socket.on("alert", (alert) => {
  console.log("New alert:", alert);
  // {
  //   id: "alert-uuid",
  //   tenantId: "empresa-a",
  //   source: "prometheus",
  //   severity: "critical",
  //   service: "api-gateway",
  //   message: "High memory usage",
  //   receivedAt: "2026-05-31T04:30:00.000Z"
  // }
});
```

#### `diagnostic`

Emitted when diagnostic analysis completes.

```javascript
socket.on("diagnostic", (report) => {
  console.log("Diagnostic report:", report);
  // {
  //   service: { name: "api-gateway", replicas: {...} },
  //   possibleCauses: ["Recent deploy", "Memory leak"],
  //   confidence: 0.85,
  //   generatedAt: "2026-05-31T04:30:05.000Z"
  // }
});
```

#### `decision`

Emitted when AI makes a decision.

```javascript
socket.on("decision", (decision) => {
  console.log("AI Decision:", decision);
  // {
  //   shouldAct: true,
  //   actionName: "scale_replicas",
  //   confidence: 0.92,
  //   reasoning: "Recent deploy with high memory usage and degraded replicas suggests resource contention"
  // }
});
```

#### `action`

Emitted when an action is executed.

```javascript
socket.on("action", (result) => {
  console.log("Action executed:", result);
  // {
  //   actionName: "scale_replicas",
  //   success: true,
  //   details: "Scaled from 3 to 5 replicas",
  //   dryRun: false
  // }
});
```

#### `escalation`

Emitted when issue is escalated to on-call team.

```javascript
socket.on("escalation", (escalation) => {
  console.log("Escalation:", escalation);
  // {
  //   reason: "AI confidence too low (0.65 < 0.80 threshold)",
  //   service: "payment-svc",
  //   notificationsSent: ["slack", "sms"]
  // }
});
```

---

## API Endpoints (REST)

### GET /health

Health check endpoint (no auth required).

**Response (200 OK):**

```json
{
  "status": "ok",
  "events": 42,
  "total": 127,
  "resolved": 98,
  "escalated": 22,
  "blocked": 7,
  "avgConfidence": 0.78
}
```

---

### GET /api/events

_(Requires authentication)_

Get recent pipeline events.

**Query Parameters:**

- `limit` (number, default: 100): Max events to return
- `type` (string): Filter by event type - `alert`, `diagnostic`, `decision`, `action`, `escalation`
- `tenantId` (string): Filter by tenant
- `since` (ISO timestamp): Only events after this time

**Response (200 OK):**

```json
[
  {
    "type": "alert",
    "tenantId": "empresa-a",
    "timestamp": "2026-05-31T04:30:00.000Z",
    "data": {...}
  },
  {
    "type": "decision",
    "tenantId": "empresa-a",
    "timestamp": "2026-05-31T04:30:05.000Z",
    "data": {...}
  }
]
```

---

### GET /api/tenants

_(Requires authentication)_

List all active tenants and their configuration.

**Response (200 OK):**

```json
[
  {
    "id": "empresa-a",
    "name": "Empresa A",
    "enabled": true,
    "providers": ["kubernetes", "docker-swarm"],
    "minConfidence": 0.8
  },
  {
    "id": "empresa-b",
    "name": "Empresa B",
    "enabled": true,
    "providers": ["ecs"],
    "minConfidence": 0.75
  }
]
```

---

### GET /api/audit

_(Requires authentication)_

Retrieve audit log (last 100 entries by default).

**Query Parameters:**

- `limit` (number, default: 100): Entries to return
- `tenantId` (string): Filter by tenant
- `type` (string): Filter by entry type - `action`, `escalation`, `blocked`, `decision`

**Response (200 OK):**

```json
[
  {
    "id": "audit-uuid-1",
    "timestamp": "2026-05-31T04:30:10.000Z",
    "tenantId": "empresa-a",
    "type": "action",
    "service": "api-gateway",
    "label": "scale_replicas",
    "success": true,
    "confidence": 0.92,
    "dryRun": false
  }
]
```

---

### GET /api/summary

_(Requires authentication)_

Get summary statistics.

**Response (200 OK):**

```json
{
  "total": 156,
  "resolved": 134,
  "escalated": 18,
  "blocked": 4,
  "avgConfidence": 0.79
}
```

---

### GET /api/tenants/:tenantId/oncall

_(Requires authentication)_

Get on-call schedule for a tenant.

**Response (200 OK):**

```json
[
  {
    "id": "schedule-uuid-1",
    "engineerName": "John Doe",
    "phoneNumber": "+1-555-0123",
    "shiftStart": "2026-05-31T22:00:00.000Z",
    "shiftEnd": "2026-06-01T06:00:00.000Z",
    "isActive": true
  }
]
```

---

### POST /api/tenants/:tenantId/oncall

_(Requires authentication)_

Add a new on-call shift.

**Request:**

```json
{
  "engineerName": "Jane Smith",
  "phoneNumber": "+1-555-0456",
  "shiftStart": "2026-06-01T22:00:00.000Z",
  "shiftEnd": "2026-06-02T06:00:00.000Z",
  "isActive": true
}
```

**Response (200 OK):**

```json
{
  "id": "schedule-uuid-2",
  "engineerName": "Jane Smith",
  "phoneNumber": "+1-555-0456",
  "shiftStart": "2026-06-01T22:00:00.000Z",
  "shiftEnd": "2026-06-02T06:00:00.000Z",
  "isActive": true
}
```

---

### POST /api/tenants/:tenantId/services/:serviceName/post-mortem

_(Requires authentication)_

Generate post-mortem report for a service incident.

**Request:**

```json
{
  "details": "Optional additional context"
}
```

**Response (200 OK):**

```json
{
  "markdown": "# Post-Mortem Report: api-gateway\n\n## Timeline\n...\n## Root Cause Analysis\n..."
}
```

---

### POST /api/demo/trigger

_(Development only, no auth required)_

Trigger a demo alert for testing.

**Request:**

```bash
curl -X POST http://localhost:3000/api/demo/trigger
```

**Response (200 OK):**

```json
{
  "ok": true,
  "message": "Demo alert triggered",
  "alertId": "demo-alert-uuid"
}
```

---

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Unauthorized: Missing or invalid token"
}
```

### 403 Forbidden

```json
{
  "error": "Forbidden: Invalid token"
}
```

### 429 Too Many Requests

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "message": "Descriptive error message"
}
```

---

## Examples

### Complete Flow Example

```bash
# 1. Login
TOKEN=$(curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}' \
  | jq -r '.token')

# 2. Check health
curl http://localhost:3000/health

# 3. Send alert (as Prometheus)
curl -X POST http://localhost:3000/webhook/prometheus \
  -H "Content-Type: application/json" \
  -d '{
    "alerts": [{
      "labels": {"severity":"critical","job":"api-gateway"},
      "annotations": {"summary":"High latency"}
    }]
  }'

# 4. Get recent events
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/events?limit=10

# 5. Get audit log
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/audit
```

---

## Pagination

For endpoints that return lists, use these parameters:

- `limit` (default: 100, max: 1000)
- `offset` (default: 0)

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/events?limit=50&offset=100"
```

---

## Versioning

Current API version: **v1**

Future versions will be available at `/api/v2/` while maintaining backward compatibility.

---

## Rate Limits

| Endpoint          | Limit                            |
| ----------------- | -------------------------------- |
| `/webhook/*`      | 100 alerts/min, 2000 alerts/hour |
| `/api/` (general) | 1000 req/min per token           |
| `/api/demo/*`     | 10 req/min (dev only)            |

Responses include rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1622489460
```

---

## Support

For issues or questions:

- 📖 See [README.md](../README.md)
- 🔒 Security guide: [DEVSECOPS.md](../DEVSECOPS.md)
- 💬 GitHub Issues: [BastionGuard Issues](https://github.com/your-org/bastionguard/issues)
