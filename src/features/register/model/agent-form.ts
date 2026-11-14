// What `register_agent({ id, name, kind, x_handle })` accepts, checked in the browser before the wallet opens.
// Mirrors `validate_agent_id` and `validate_text` in contracts/thecut/src/agents.rs (MAX_TEXT 32, MAX_X_HANDLE 16 bytes).

export const MAX_TEXT_BYTES = 32;
export const MAX_X_HANDLE_BYTES = 16;
/** NEAR account ids are at most 64 characters, so the agent id leaves room for `.<contract>`. */
export const MAX_ACCOUNT_ID = 64;

/** Kinds already on the lineup; a creator picks one or types its own. */
export const AGENT_KINDS = [
  "AI analyst",
  "AI streamer",
  "AI agent",
  "AI artist",
  "AI idol",
  "Virtual influencer",
  "Virtual singer",
  "Virtual model",
  "Digital model",
  "VTuber",
] as const;

const bytes = (value: string) => new TextEncoder().encode(value).length;
const isSeparator = (char: string) => char === "-" || char === "_";

/**
 * The agent id as a NEAR sub-account label: 2 to 32 characters of a-z, 0-9, - and _, starting and ending with
 * a letter or digit, with no two separators in a row, and short enough that `<id>.<contract>` is a valid account.
 * Null when it is fine, else the contract's own message.
 */
export function agentIdError(id: string, contractId: string): string | null {
  if (id.length < 2 || id.length > 32) return "Agent id must be 2 to 32 characters";
  let previousSeparator = true;
  for (const char of id) {
    if (!/^[a-z0-9_-]$/.test(char)) return "Agent id may use only a-z, 0-9, - and _";
    if (isSeparator(char) && previousSeparator) return "Agent id cannot start with or repeat - or _";
    previousSeparator = isSeparator(char);
  }
  if (previousSeparator) return "Agent id cannot end with - or _";
  if (id.length + 1 + contractId.length > MAX_ACCOUNT_ID) return `${id}.${contractId} is longer than 64 characters`;
  return null;
}

/** "Melody-9" → "melody-9"; "Glitch Gremlin" → "glitchgremlin". A suggestion the creator can edit. */
export function suggestAgentId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 32)
    .replace(/[-_]+$/g, "");
}

/** Name or kind: required, at most 32 bytes, no control characters. */
export function textError(value: string, field: "name" | "kind"): string | null {
  if (!value.trim()) return `${field === "name" ? "Name" : "Kind"} cannot be empty`;
  if (bytes(value) > MAX_TEXT_BYTES) return `${field === "name" ? "Name" : "Kind"} can be at most ${MAX_TEXT_BYTES} bytes`;
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return `${field === "name" ? "Name" : "Kind"} cannot contain control characters`;
  return null;
}

/** X handle: optional `@`, then 1 to 15 letters, digits or _ (X's own rule, within the contract's 16 bytes). */
export function xHandleError(handle: string): string | null {
  if (!handle) return "Add the agent’s X account";
  if (!/^@?[A-Za-z0-9_]{1,15}$/.test(handle) || bytes(handle) > MAX_X_HANDLE_BYTES) return "An X handle is 1 to 15 letters, digits or _";
  return null;
}

/** "ChartwiseCut" → "@ChartwiseCut". */
export function normalizeXHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed && !trimmed.startsWith("@") ? `@${trimmed}` : trimmed;
}

export type AgentForm = { id: string; name: string; kind: string; xHandle: string };

/** Every problem with the form, by field. Empty when `register_agent` would accept it. */
export function formErrors(form: AgentForm, contractId: string): Partial<Record<keyof AgentForm, string>> {
  const errors: Partial<Record<keyof AgentForm, string>> = {};
  const name = textError(form.name, "name");
  const kind = textError(form.kind, "kind");
  const id = agentIdError(form.id, contractId);
  const x = xHandleError(normalizeXHandle(form.xHandle));
  if (name) errors.name = name;
  if (kind) errors.kind = kind;
  if (id) errors.id = id;
  if (x) errors.xHandle = x;
  return errors;
}

/** The arguments of `register_agent`, as the contract names them. */
export function registerArgs(form: AgentForm) {
  return { id: form.id, name: form.name.trim(), kind: form.kind.trim(), x_handle: normalizeXHandle(form.xHandle) };
}
