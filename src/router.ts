/**
 * A tiny ordered regex router. Sanic resolves routes by specificity; here the
 * order of registration encodes the same precedence explicitly. Patterns match
 * the percent-encoded `URL.pathname`.
 */
import type { AppContext } from "./context";

export type Handler = (app: AppContext, ...groups: string[]) => Promise<Response> | Response;

interface Route {
  methods: string[];
  pattern: RegExp;
  handler: Handler;
  name: string;
}

export class Router {
  private routes: Route[] = [];

  add(methods: string | string[], pattern: RegExp, handler: Handler, name = ""): this {
    this.routes.push({ methods: ([] as string[]).concat(methods), pattern, handler, name });
    return this;
  }

  get(pattern: RegExp, handler: Handler, name = ""): this {
    return this.add(["GET", "HEAD"], pattern, handler, name);
  }

  post(pattern: RegExp, handler: Handler, name = ""): this {
    return this.add("POST", pattern, handler, name);
  }

  /** Returns the matched handler and groups, or the allowed methods for a 405, or null. */
  match(method: string, path: string): { handler: Handler; groups: string[]; name: string } | { allowed: string[] } | null {
    const allowed = new Set<string>();
    for (const route of this.routes) {
      const match = route.pattern.exec(path);
      if (!match) continue;
      if (route.methods.includes(method)) {
        return { handler: route.handler, groups: match.slice(1).map((g) => g ?? ""), name: route.name };
      }
      route.methods.forEach((m) => allowed.add(m));
    }
    return allowed.size ? { allowed: [...allowed] } : null;
  }
}

/** Sanic's `slug` path type: `[a-z0-9]+(?:-[a-z0-9]+)*` */
export const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
