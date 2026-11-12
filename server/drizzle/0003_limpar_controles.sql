-- Limpeza única pedida pelo usuário: exclui (soft delete) todos os controles de material existentes.
UPDATE "jobs" SET "deleted_at" = now(), "updated_at" = now(), "version" = "version" + 1, "seq" = nextval('sync_seq') WHERE "deleted_at" IS NULL;
