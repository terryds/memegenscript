/** Response helpers mirroring Sanic's `response.*` and its error format. */

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    // Kept out of search results here, not in robots.txt, so fetchers that honor robots.txt can read the API
    headers: { "content-type": "application/json", "x-robots-tag": "noindex", ...headers },
  });
}

export function html(content: string, status = 200): Response {
  return new Response(content, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export function text(content: string, status = 200): Response {
  return new Response(content, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

const REASONS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  405: "Method Not Allowed",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
  501: "Not Implemented",
};

/** Sanic-style error payload. */
export function error(status: number, message: string): Response {
  return json({ description: REASONS[status] ?? "Error", status, message }, status);
}

export function image(bytes: Uint8Array, mimeType: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    status,
    headers: { "content-type": mimeType, "content-length": String(bytes.length), ...headers },
  });
}
