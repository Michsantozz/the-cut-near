import { z } from "zod";

// NEAR account id rules (nomicon "Account ID"): 2-64 chars of lowercase alphanumerics separated by
// single `-`, `_` or `.`. Covers named, implicit (64 hex) and eth-implicit (0x + 40 hex) accounts.
const ACCOUNT_ID = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export const accountIdSchema = z.string().regex(ACCOUNT_ID, "must be a valid NEAR account id");

export function isAccountId(value: string): boolean {
  return ACCOUNT_ID.test(value);
}
