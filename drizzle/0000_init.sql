CREATE TABLE "auth_nonce" (
	"nonce" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"item_index" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_height" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"emitter" text NOT NULL,
	"standard" text NOT NULL,
	"version" text NOT NULL,
	"event" text NOT NULL,
	"account_id" text,
	"robot_id" text,
	"cut_index" integer,
	"amount" numeric(78, 0),
	"data" jsonb NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_attestations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"nonce" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text,
	"cut_index" integer,
	"status" text NOT NULL,
	"text" text,
	"reject_reason" text,
	"model" text NOT NULL,
	"chat_id" text,
	"request_body" text NOT NULL,
	"response_body" text,
	"signature" jsonb,
	"proof" jsonb,
	"proof_status" text,
	"attestation_id" uuid,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_cursor" (
	"name" text PRIMARY KEY NOT NULL,
	"next_block_height" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "director_lines" ADD CONSTRAINT "director_lines_attestation_id_director_attestations_id_fk" FOREIGN KEY ("attestation_id") REFERENCES "public"."director_attestations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_nonce_expires_idx" ON "auth_nonce" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_event_key" ON "journal" USING btree ("receipt_id","log_index","item_index");--> statement-breakpoint
CREATE INDEX "journal_block_idx" ON "journal" USING btree ("block_height");--> statement-breakpoint
CREATE INDEX "journal_account_idx" ON "journal" USING btree ("account_id","block_height");--> statement-breakpoint
CREATE INDEX "journal_robot_idx" ON "journal" USING btree ("robot_id","block_height");--> statement-breakpoint
CREATE INDEX "journal_event_idx" ON "journal" USING btree ("event","block_height");--> statement-breakpoint
CREATE INDEX "journal_cut_idx" ON "journal" USING btree ("cut_index");--> statement-breakpoint
CREATE INDEX "director_lines_kind_created_idx" ON "director_lines" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "director_lines_created_idx" ON "director_lines" USING btree ("created_at");