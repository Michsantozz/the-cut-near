import type { z } from "zod";

/** "KEY: message" lines for every issue, without the received values (they may be secrets). */
export function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
}

/** `KEY=` copied from .env.example is empty, which means "not set". */
export function emptyToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}
