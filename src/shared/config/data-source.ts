import "server-only";
import { serverEnv } from "./server";

/**
 * "sample" (default) serves the fictional data from docs/design so every screen works without a
 * chain or database. "live" reads NEAR and Postgres. Server-side only.
 */
export type DataSource = "sample" | "live";

export function dataSource(): DataSource {
  return serverEnv().DATA_SOURCE;
}

export function isLive(): boolean {
  return dataSource() === "live";
}
