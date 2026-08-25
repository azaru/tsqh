import { EvidenceError } from "./evidence.js";

const RESPONSE_LIMIT_BYTES = 65_536;
const REQUEST_TIMEOUT_MS = 30_000;

export interface SonarApiRequest {
  readonly hostUrl: string;
  readonly path: string;
  readonly parameters: Readonly<Record<string, string>>;
  readonly token: string;
}

export interface SonarApi {
  getJson(request: SonarApiRequest): Promise<unknown>;
}

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

type Fetcher = (
  input: string,
  init: { readonly headers: Readonly<Record<string, string>>; readonly signal: AbortSignal },
) => Promise<FetchResponse>;

export class FetchSonarApi implements SonarApi {
  public constructor(private readonly fetcher: Fetcher = fetch) {}

  public async getJson(request: SonarApiRequest): Promise<unknown> {
    const url = requestUrl(request);
    const response = await fetchResponse(this.fetcher, request, url);
    return readJsonResponse(response, request.path);
  }
}

async function fetchResponse(
  fetcher: Fetcher,
  request: SonarApiRequest,
  url: URL,
): Promise<FetchResponse> {
  let response: FetchResponse;
  try {
    response = await fetcher(url.href, {
      headers: { Authorization: `Bearer ${request.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new EvidenceError(
      timedOut
        ? `Sonar API ${request.path} timed out.`
        : `Sonar API ${request.path} request failed.`,
    );
  }
  return response;
}

async function readJsonResponse(response: FetchResponse, path: string): Promise<unknown> {
  if (!response.ok) {
    throw new EvidenceError(`Sonar API ${path} returned HTTP ${String(response.status)}.`);
  }
  const content = await readResponseBody(response, path);
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new EvidenceError(`Sonar API ${path} returned malformed JSON.`);
  }
}

async function readResponseBody(response: FetchResponse, path: string): Promise<string> {
  const content = await response.text();
  if (content.length === 0) {
    throw new EvidenceError(`Sonar API ${path} returned an empty response.`);
  }
  if (Buffer.byteLength(content) > RESPONSE_LIMIT_BYTES) {
    throw new EvidenceError(`Sonar API ${path} response exceeds 64 KiB.`);
  }
  return content;
}

function requestUrl(request: SonarApiRequest): URL {
  if (!/^\/api\/[a-z0-9_/-]+$/u.test(request.path)) {
    throw new EvidenceError("Sonar API path is invalid.");
  }
  const url = new URL(request.path, `${request.hostUrl}/`);
  for (const [key, value] of Object.entries(request.parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}
