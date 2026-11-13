import { describe, expect, it } from "vitest";
import { isAccountId } from "@/shared/lib/account-id";

describe("isAccountId", () => {
  it.each(["mika.near", "thecut.testnet", "kiko.thecut.near", "a_b-c.near", "0x" + "ab".repeat(20), "f".repeat(64), "aa"])("accepts %s", (id) => {
    expect(isAccountId(id)).toBe(true);
  });

  it.each(["", "a", "Mika.near", "mika..near", ".near", "mika.near.", "mi--ka.near", "a".repeat(65), "mika near"])("rejects %j", (id) => {
    expect(isAccountId(id)).toBe(false);
  });
});
