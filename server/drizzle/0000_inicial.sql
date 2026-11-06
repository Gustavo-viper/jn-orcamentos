CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"user_id" text,
	"user_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_history" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"user_id" text,
	"user_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"client_id" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"text" text NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_by_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"name" text NOT NULL,
	"document" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"cep" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"district" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"complement" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"detail" jsonb,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"client_id" text,
	"quote_id" text,
	"job_id" text,
	"method" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"dedupe_key" text
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"job_id" text NOT NULL,
	"type" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status_to" text,
	"created_by" text DEFAULT '' NOT NULL,
	"created_by_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"number" integer,
	"quote_id" text,
	"client_id" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"services_summary" text DEFAULT '' NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"start_date" date,
	"expected_end" date,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'waiting' NOT NULL,
	"contracted_value" bigint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"materials" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"entry_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"quote_id" text NOT NULL,
	"type" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"unit_cost" bigint DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"dimensions" text DEFAULT '' NOT NULL,
	"plate_area" double precision,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"min_stock" double precision DEFAULT 0 NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"indivisible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"service_id" text NOT NULL,
	"service_name" text NOT NULL,
	"measurement_type" text NOT NULL,
	"width" double precision NOT NULL,
	"length" double precision NOT NULL,
	"height" double precision DEFAULT 0 NOT NULL,
	"surface" text DEFAULT 'floor' NOT NULL,
	"waste_pct" double precision NOT NULL,
	"labor_price_override" bigint,
	"linear_override" double precision,
	"quantity" double precision,
	"deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gross_area" double precision DEFAULT 0 NOT NULL,
	"net_area" double precision DEFAULT 0 NOT NULL,
	"linear" double precision DEFAULT 0 NOT NULL,
	"measure" double precision DEFAULT 0 NOT NULL,
	"labor_cost" bigint DEFAULT 0 NOT NULL,
	"material_cost" bigint DEFAULT 0 NOT NULL,
	"price" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"qty" double precision NOT NULL,
	"unit_cost" bigint NOT NULL,
	"cost" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"number" integer,
	"client_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issue_date" date NOT NULL,
	"valid_until" date NOT NULL,
	"margin_pct" double precision DEFAULT 0 NOT NULL,
	"margin_on_labor" boolean DEFAULT true NOT NULL,
	"discount_type" text DEFAULT 'none' NOT NULL,
	"discount_value" double precision DEFAULT 0 NOT NULL,
	"installments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_terms" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"calc" jsonb,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"total_cost" bigint DEFAULT 0 NOT NULL,
	"estimated_profit" bigint DEFAULT 0 NOT NULL,
	"portal_token" text,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"client_comment" text DEFAULT '' NOT NULL,
	"created_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"product_id" text NOT NULL,
	"consumption" double precision NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"measurement_type" text NOT NULL,
	"pricing_mode" text DEFAULT 'cost_plus' NOT NULL,
	"labor_price" bigint DEFAULT 0 NOT NULL,
	"charge_unit" text NOT NULL,
	"linear_basis" text DEFAULT 'perimeter' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"product_id" text NOT NULL,
	"type" text NOT NULL,
	"delta" double precision NOT NULL,
	"balance_after" double precision NOT NULL,
	"unit_cost" bigint DEFAULT 0 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"job_id" text,
	"created_by" text DEFAULT '' NOT NULL,
	"created_by_name" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"op_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"base_version" integer,
	"server_version" integer NOT NULL,
	"client_data" jsonb NOT NULL,
	"server_data" jsonb NOT NULL,
	"resolution" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_ops" (
	"op_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ok" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_entry_id_finance_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."finance_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_events" ADD CONSTRAINT "portal_events_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_materials" ADD CONSTRAINT "quote_materials_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_materials" ADD CONSTRAINT "service_materials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_seq_idx" ON "activities" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "activities_created_idx" ON "activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "change_history_entity_idx" ON "change_history" USING btree ("entity","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "client_notes_seq_idx" ON "client_notes" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "client_notes_client_idx" ON "client_notes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_seq_idx" ON "clients" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "clients_city_idx" ON "clients" USING btree ("city");--> statement-breakpoint
CREATE INDEX "clients_document_idx" ON "clients" USING btree ("document");--> statement-breakpoint
CREATE INDEX "error_logs_created_idx" ON "error_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "finance_entries_seq_idx" ON "finance_entries" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_entries_dedupe_uq" ON "finance_entries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "finance_entries_due_idx" ON "finance_entries" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "finance_entries_quote_idx" ON "finance_entries" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "finance_entries_client_idx" ON "finance_entries" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "job_events_seq_idx" ON "job_events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "job_events_job_idx" ON "job_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_seq_idx" ON "jobs" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_number_uq" ON "jobs" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_quote_uq" ON "jobs" USING btree ("quote_id") WHERE "jobs"."deleted_at" is null and "jobs"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "jobs_client_idx" ON "jobs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_uq" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "payments_seq_idx" ON "payments" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "payments_entry_idx" ON "payments" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "portal_events_seq_idx" ON "portal_events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "portal_events_quote_idx" ON "portal_events" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "products_seq_idx" ON "products" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "quote_items_quote_idx" ON "quote_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_materials_quote_idx" ON "quote_materials" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quote_materials_product_idx" ON "quote_materials" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "quotes_seq_idx" ON "quotes" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_uq" ON "quotes" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_portal_token_uq" ON "quotes" USING btree ("portal_token");--> statement-breakpoint
CREATE INDEX "quotes_client_idx" ON "quotes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status","issue_date");--> statement-breakpoint
CREATE INDEX "service_materials_service_idx" ON "service_materials" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "service_materials_product_idx" ON "service_materials" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "services_seq_idx" ON "services" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "settings_seq_idx" ON "settings" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "stock_movements_seq_idx" ON "stock_movements" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_job_idx" ON "stock_movements" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "sync_ops_user_idx" ON "sync_ops" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));