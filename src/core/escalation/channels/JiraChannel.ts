import axios, { AxiosInstance } from 'axios';
import { EscalationChannel, EscalationMessage, ChannelResult } from './EscalationChannel';

interface JiraChannelConfig {
  jiraUrl?: string;
  email?: string;
  apiToken?: string;
  projectKey?: string;
}

/**
 * Creates Jira incidents (Issues) for BastionGuard escalation events.
 * Uses Jira REST API v3 with Basic Auth (email + API token).
 * Issue descriptions are formatted using Atlassian Document Format (ADF).
 */
export class JiraChannel implements EscalationChannel {
  public readonly name = 'jira';

  private readonly client: AxiosInstance;
  private readonly projectKey: string;

  public constructor(config: JiraChannelConfig = {}) {
    const jiraUrl = config.jiraUrl ?? process.env.JIRA_URL;
    const email = config.email ?? process.env.JIRA_EMAIL;
    const apiToken = config.apiToken ?? process.env.JIRA_API_TOKEN;
    const projectKey = config.projectKey ?? process.env.JIRA_PROJECT_KEY ?? 'OPS';

    if (!jiraUrl) {
      throw new Error('[JiraChannel] jiraUrl is required. Set JIRA_URL or pass jiraUrl in config.');
    }
    if (!email) {
      throw new Error('[JiraChannel] email is required. Set JIRA_EMAIL or pass email in config.');
    }
    if (!apiToken) {
      throw new Error('[JiraChannel] apiToken is required. Set JIRA_API_TOKEN or pass apiToken in config.');
    }

    this.projectKey = projectKey;

    this.client = axios.create({
      baseURL: jiraUrl,
      auth: { username: email, password: apiToken },
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    console.log(`[JiraChannel] Inicializado → ${jiraUrl} | Proyecto: ${projectKey}`);
  }

  /**
   * Builds an Atlassian Document Format (ADF) description for the Jira issue.
   */
  private buildAdfDescription(message: EscalationMessage): unknown {
    const confidencePct = (message.confidence * 100).toFixed(0);

    const causeItems = message.possibleCauses.map((cause) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: cause }],
        },
      ],
    }));

    const rows: unknown[] = [
      this.adfTableRow('Servicio', message.service, true),
      this.adfTableRow('Severidad', message.severity.toUpperCase()),
      this.adfTableRow('Motivo', message.reason),
      this.adfTableRow('Confianza IA', `${confidencePct}%`),
      this.adfTableRow('Tenant', message.tenantId),
      this.adfTableRow('Timestamp', message.timestamp),
    ];

    if (message.replicas !== undefined) {
      rows.push(this.adfTableRow('Réplicas', `${message.replicas.ready}/${message.replicas.desired}`));
    }
    if (message.recentDeploy !== undefined) {
      rows.push(this.adfTableRow('Deploy Reciente', message.recentDeploy ? 'Sí' : 'No'));
    }

    const content: unknown[] = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: '🛡️ Incidente BastionGuard' }],
      },
      {
        type: 'table',
        attrs: { isNumberColumnEnabled: false, layout: 'default' },
        content: rows,
      },
    ];

    if (causeItems.length > 0) {
      content.push(
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Causas Posibles' }],
        },
        {
          type: 'bulletList',
          content: causeItems,
        }
      );
    }

    content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Este ticket fue creado automáticamente por BastionGuard Auto-Remediation.',
          marks: [{ type: 'em' }],
        },
      ],
    });

    return {
      type: 'doc',
      version: 1,
      content,
    };
  }

  private adfTableRow(label: string, value: string, header = false): unknown {
    const cellType = header ? 'tableHeader' : 'tableCell';
    return {
      type: 'tableRow',
      content: [
        {
          type: cellType,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: label, marks: [{ type: 'strong' }] }],
            },
          ],
        },
        {
          type: 'tableCell',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: value }],
            },
          ],
        },
      ],
    };
  }

  public async send(message: EscalationMessage): Promise<ChannelResult> {
    const timestamp = new Date().toISOString();
    const priority = message.severity === 'critical' ? 'Highest' : 'High';

    const issueBody = {
      fields: {
        project: { key: this.projectKey },
        summary: `[BastionGuard] Incidente: ${message.service} - ${message.severity.toUpperCase()}`,
        description: this.buildAdfDescription(message),
        issuetype: { name: 'Incident' },
        priority: { name: priority },
        labels: ['bastionguard', 'auto-generated'],
      },
    };

    try {
      console.log(`[JiraChannel] Creando issue para servicio "${message.service}" en proyecto ${this.projectKey}...`);
      const response = await this.client.post<{ key: string; id: string }>('/rest/api/3/issue', issueBody);

      const ticketKey = response.data.key;
      console.log(`[JiraChannel] ✅ Issue creado: ${ticketKey}`);

      return {
        success: true,
        channel: this.name,
        timestamp,
        extra: { ticketKey, issueId: response.data.id },
      };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = JSON.stringify(err.response?.data ?? {});
        console.error(`[JiraChannel] ❌ Error HTTP ${status}: ${data}`);
        return {
          success: false,
          channel: this.name,
          error: `HTTP ${status}: ${data}`,
          timestamp,
        };
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[JiraChannel] ❌ Error de conexión:`, errorMsg);
      return { success: false, channel: this.name, error: errorMsg, timestamp };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      console.log('[JiraChannel] Ejecutando health check...');
      const response = await this.client.get('/rest/api/3/myself');
      const ok = response.status === 200;
      console.log(`[JiraChannel] Health check: ${ok ? '✅ OK' : `❌ HTTP ${response.status}`}`);
      return ok;
    } catch (err) {
      console.error('[JiraChannel] ❌ Health check falló:', err);
      return false;
    }
  }
}
