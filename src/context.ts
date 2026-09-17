import type { Settings } from "./settings";

/** Everything a handler needs about the current request. */
export interface AppContext {
  request: Request;
  url: URL;
  /** Percent-encoded path, as the router matched it */
  path: string;
  params: URLSearchParams;
  env: Env;
  settings: Settings;
  ctx: ExecutionContext;
}
