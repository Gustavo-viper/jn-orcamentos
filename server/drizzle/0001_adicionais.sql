ALTER TABLE "quote_items" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "addons" jsonb DEFAULT '[]'::jsonb NOT NULL;