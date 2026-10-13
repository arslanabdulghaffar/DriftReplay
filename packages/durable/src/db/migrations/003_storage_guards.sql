CREATE FUNCTION guard_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.workspace_id,NEW.run_id,NEW.bytes_reserved,NEW.compute_reserved) IS DISTINCT FROM
     (OLD.workspace_id,OLD.run_id,OLD.bytes_reserved,OLD.compute_reserved) OR OLD.settled_at IS NOT NULL OR
     NEW.compute_consumed < OLD.compute_consumed OR NEW.compute_measured_ms < OLD.compute_measured_ms OR
     NEW.compute_estimated_ms < OLD.compute_estimated_ms
  THEN RAISE EXCEPTION 'IMMUTABLE_RESERVATION' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reservation_guard BEFORE UPDATE ON budget_reservations FOR EACH ROW EXECUTE FUNCTION guard_reservation();
CREATE FUNCTION guard_blob() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.workspace_id,NEW.digest,NEW.byte_length,NEW.verified_at,NEW.created_at) IS DISTINCT FROM
     (OLD.workspace_id,OLD.digest,OLD.byte_length,OLD.verified_at,OLD.created_at)
  THEN RAISE EXCEPTION 'IMMUTABLE_BLOB_IDENTITY' USING ERRCODE='23514'; END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NOT ((OLD.state='READY' AND NEW.state='DELETE_PENDING') OR (OLD.state='DELETE_PENDING' AND NEW.state='DELETED'))
      OR EXISTS(SELECT 1 FROM run_inputs WHERE workspace_id=NEW.workspace_id AND digest=NEW.digest)
      OR EXISTS(SELECT 1 FROM run_artifacts WHERE workspace_id=NEW.workspace_id AND digest=NEW.digest)
    THEN RAISE EXCEPTION 'PROTECTED_BLOB' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER blob_guard BEFORE UPDATE ON input_blobs FOR EACH ROW EXECUTE FUNCTION guard_blob();
CREATE FUNCTION assert_storage_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT EXISTS(SELECT 1 FROM storage_events WHERE workspace_id=NEW.workspace_id AND digest=NEW.digest AND reason=NEW.state)
  THEN RAISE EXCEPTION 'MISSING_STORAGE_AUDIT' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER storage_audit AFTER UPDATE ON input_blobs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_storage_audit();
