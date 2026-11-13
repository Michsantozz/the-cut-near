import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

process.env.DATABASE_URL ??= "postgres://cut:cut@localhost:54330/cut_near";

// Hermetic by default: any request without an MSW handler fails the test.
const live = process.env.RUN_LIVE_E2E === "1";

beforeAll(() => server.listen({ onUnhandledFrame: live ? "bypass" : "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
