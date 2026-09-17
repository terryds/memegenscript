import { SELF } from "cloudflare:test";

export const BASE = "http://localhost:5000";

export function get(path: string, init: RequestInit = {}): Promise<Response> {
  return SELF.fetch(BASE + path, { redirect: "manual", ...init });
}

export function postJson(path: string, data: unknown): Promise<Response> {
  return SELF.fetch(BASE + path, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function postForm(path: string, data: Record<string, string | string[] | boolean>): Promise<Response> {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    for (const item of ([] as Array<string | boolean>).concat(value)) form.append(key, String(item));
  }
  return SELF.fetch(BASE + path, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}
