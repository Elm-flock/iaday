-- AuditLog: TRUNCATE tambien rechazado. El trigger de fila de 20261009180000 no se dispara con
-- TRUNCATE, asi que el historial podia borrarse de un golpe. Trigger de sentencia (no se edita la
-- migracion original, ya aplicada). Los tests lo evitan con session_replication_role = replica.
CREATE OR REPLACE FUNCTION audit_log_no_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es append-only: TRUNCATE no permitido'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_no_truncate();
