import "server-only";

// Server API of the move relay: the job the cron runs, and its ports for tests.
export { relayMovesJob, relayPorts, type RelayDeps } from "./relay";
export type { AgentRelayResult, AgentRelayStatus, RelayOptions, RelayReport } from "../model/relay";
