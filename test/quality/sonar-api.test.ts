import { describe, expect, it, vi } from "vitest";
import { FetchSonarApi } from "../../src/quality/sonar-api.js";

const request = {
  hostUrl: "https://sonar.example.test",
  path: "/api/ce/task",
  parameters: { id: "task 1" },
  token: "api-secret",
} as const;

describe("Sonar API client", () => {
  it("uses a bounded authenticated GET and parses JSON", async () => {
    const fetcher = vi.fn(async (
      _input: string,
      _init: { readonly headers: Readonly<Record<string, string>>; readonly signal: AbortSignal },
    ) => response('{"task":{"status":"SUCCESS"}}'));
    const api = new FetchSonarApi(fetcher);

    await expect(api.getJson(request)).resolves.toEqual({ task: { status: "SUCCESS" } });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![0]).toBe("https://sonar.example.test/api/ce/task?id=task+1");
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      headers: { Authorization: "Bearer api-secret", Accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects an invalid API path before requesting", async () => {
    const fetcher = vi.fn(async () => response("{}"));
    const api = new FetchSonarApi(fetcher);

    for (const path of ["https://other.test/api", "x/api/ce/task", "/api/ce/task?extra"] as const) {
      await expect(api.getJson({ ...request, path })).rejects.toThrow(/path is invalid/u);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts a response at the exact 64 KiB boundary", async () => {
    const content = `{"x":"${"x".repeat(65_528)}"}`;
    const api = new FetchSonarApi(async () => response(content));

    await expect(api.getJson(request)).resolves.toEqual({ x: "x".repeat(65_528) });
  });

  it.each([
    ["HTTP failure", async () => response("server detail api-secret", 401), /HTTP 401/u],
    ["empty", async () => response(""), /empty response/u],
    ["malformed", async () => response("not-json"), /malformed JSON/u],
    ["oversized", async () => response("x".repeat(65_537)), /exceeds 64 KiB/u],
    ["request failure", async () => Promise.reject(new Error("api-secret")), /request failed/u],
    ["timeout", async () => Promise.reject(Object.assign(new Error("api-secret"), { name: "TimeoutError" })), /timed out/u],
  ] as const)("fails closed for %s", async (_label, fetcher, message) => {
    const api = new FetchSonarApi(fetcher);

    let error: unknown;
    try {
      await api.getJson(request);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(message);
    expect((error as Error).message).not.toContain("api-secret");
  });
});

function response(content: string, status = 200): {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
} {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => content,
  };
}
