import { expect, it } from "vitest";
import { createTestDb, DB_SETUP_TIMEOUT_MS } from "../../helpers/db";

it(
  "creates every platform table from the schema files",
  async () => {
    const t = await createTestDb();
    const tables = await t.client.query("select table_name from information_schema.tables where table_schema = 'public' order by 1");
    expect(tables.rows).toEqual([{ table_name: "auth_nonce" }, { table_name: "indexer_cursor" }, { table_name: "journal" }]);
    const unique = await t.client.query("select indexdef from pg_indexes where indexname = 'journal_event_key'");
    expect(unique.rows).toEqual([{ indexdef: expect.stringContaining("UNIQUE INDEX journal_event_key ON public.journal USING btree (receipt_id, log_index, item_index)") }]);
    await t.close();
  },
  DB_SETUP_TIMEOUT_MS,
);
