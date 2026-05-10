import { AuditLogger } from "../AuditLogger";

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
  readFileSync: jest.fn(() => ""),
}));

describe("AuditLogger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create an instance", () => {
    const logger = AuditLogger.getInstance();
    expect(logger).toBeDefined();
  });

  it("should append entries and generate summary", () => {
    const logger = AuditLogger.getInstance();

    // Clear the cache manually to ensure a clean state since it's a singleton
    (logger as unknown as { cache: unknown[] }).cache = [];

    logger.append("action", {
      tenantId: "tenant-1",
      service: "web",
      label: "restart",
      success: true,
      confidence: 0.9,
    });

    logger.append("escalation", {
      tenantId: "tenant-1",
      service: "web",
      label: "escalated due to low confidence",
      success: false,
      confidence: 0.2,
    });

    const summary = logger.summary();
    expect(summary.total).toBe(2);
    expect(summary.resolved).toBe(1);
    expect(summary.escalated).toBe(1);
    expect(summary.blocked).toBe(0);
    expect(summary.avgConfidence).toBeCloseTo(0.55);

    const all = logger.readAll();
    expect(all.length).toBe(2);

    const last = logger.readLast(1);
    expect(last.length).toBe(1);
    expect(last[0].type).toBe("escalation");
  });
});
