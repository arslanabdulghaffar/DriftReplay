CREATE TABLE local_workspaces (
  workspace_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  trust_mode text NOT NULL DEFAULT 'single-owner-local' CHECK (trust_mode = 'single-owner-local'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE budget_limits (
  workspace_id uuid PRIMARY KEY REFERENCES local_workspaces,
  max_runs integer NOT NULL DEFAULT 1000 CHECK (max_runs BETWEEN 1 AND 1000),
  max_workers integer NOT NULL DEFAULT 2 CHECK (max_workers BETWEEN 1 AND 2),
  max_bytes bigint NOT NULL DEFAULT 134217728 CHECK (max_bytes BETWEEN 1 AND 134217728),
  max_compute_ms bigint NOT NULL DEFAULT 1200000 CHECK (max_compute_ms BETWEEN 1 AND 1200000),
  run_count integer NOT NULL DEFAULT 0 CHECK (run_count >= 0 AND run_count <= max_runs),
  active_workers integer NOT NULL DEFAULT 0 CHECK (active_workers >= 0 AND active_workers <= max_workers),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  consumed_bytes bigint NOT NULL DEFAULT 0 CHECK (consumed_bytes >= 0),
  reserved_compute_ms bigint NOT NULL DEFAULT 0 CHECK (reserved_compute_ms >= 0),
  consumed_compute_ms bigint NOT NULL DEFAULT 0 CHECK (consumed_compute_ms >= 0),
  CHECK (reserved_bytes + consumed_bytes <= max_bytes),
  CHECK (reserved_compute_ms + consumed_compute_ms <= max_compute_ms)
);
CREATE TABLE input_blobs (
  workspace_id uuid NOT NULL REFERENCES local_workspaces,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 0 AND 26214400),
  storage_key text GENERATED ALWAYS AS ('sha256/' || digest) STORED,
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY','DELETE_PENDING','DELETED')),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  delete_after timestamptz NOT NULL DEFAULT clock_timestamp() + interval '7 days',
  deleted_at timestamptz,
  PRIMARY KEY(workspace_id,digest),
  CHECK ((state = 'DELETED') = (deleted_at IS NOT NULL))
);
CREATE TABLE investigation_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES local_workspaces,
  request_key text NOT NULL CHECK (request_key ~ '^[0-9a-f]{64}$'),
  input_set_digest text NOT NULL CHECK (input_set_digest ~ '^[0-9a-f]{64}$'),
  engine jsonb NOT NULL CHECK (jsonb_typeof(engine) = 'object'),
  policy_id text NOT NULL CHECK (policy_id = 'local-analysis-v2'),
  policy_hash text NOT NULL CHECK (policy_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','CLAIMED','ANALYZING','CANCEL_REQUESTED','CANCELLED','ANALYSIS_COMPLETE','STOPPED','INDETERMINATE')),
  state_version integer NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  input_bytes integer NOT NULL CHECK (input_bytes BETWEEN 0 AND 26214400),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 3),
  compute_ms integer NOT NULL CHECK (compute_ms BETWEEN 1 AND 120000),
  output_bytes integer NOT NULL CHECK (output_bytes BETWEEN 1 AND 8388608),
  duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 120000),
  lease_ms integer NOT NULL CHECK (lease_ms BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  creation_transaction xid8 NOT NULL DEFAULT pg_current_xact_id(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline timestamptz NOT NULL,
  finished_at timestamptz,
  cancel_requested_at timestamptz,
  result_digest text CHECK (result_digest ~ '^[0-9a-f]{64}$'),
  failure_code text CHECK (failure_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  UNIQUE(workspace_id,run_id), UNIQUE(workspace_id,request_key),
  CHECK ((state IN ('CANCELLED','ANALYSIS_COMPLETE','STOPPED','INDETERMINATE')) = (finished_at IS NOT NULL)),
  CHECK ((state = 'ANALYSIS_COMPLETE') = (result_digest IS NOT NULL)),
  CHECK (state NOT IN ('CANCEL_REQUESTED','CANCELLED') OR cancel_requested_at IS NOT NULL)
);
CREATE TABLE idempotency_tokens (
  workspace_id uuid NOT NULL,
  token text NOT NULL CHECK (token ~ '^[A-Za-z0-9_-]{1,100}$'),
  run_id uuid NOT NULL,
  request_key text NOT NULL CHECK (request_key ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(workspace_id,token),
  FOREIGN KEY(workspace_id,run_id) REFERENCES investigation_runs(workspace_id,run_id)
);
CREATE TABLE run_inputs (
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 0 AND 1999),
  role text NOT NULL CHECK (role IN ('base-contract','candidate-contract','source','mapping')),
  path text NOT NULL CHECK (length(path) BETWEEN 1 AND 500),
  digest text NOT NULL,
  byte_length integer NOT NULL CHECK (byte_length >= 0),
  PRIMARY KEY(run_id,position), UNIQUE(run_id,role,path),
  FOREIGN KEY(workspace_id,run_id) REFERENCES investigation_runs(workspace_id,run_id),
  FOREIGN KEY(workspace_id,digest) REFERENCES input_blobs(workspace_id,digest)
);
CREATE TABLE run_steps (
  workspace_id uuid NOT NULL,
  run_id uuid PRIMARY KEY,
  step_key text NOT NULL DEFAULT 'static-analysis-v1' CHECK (step_key = 'static-analysis-v1'),
  ready boolean NOT NULL DEFAULT false,
  generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  owner_token uuid,
  attempt_id uuid,
  lease_until timestamptz,
  heartbeat_at timestamptz,
  ready_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  failure_class text CHECK (failure_class ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  UNIQUE(run_id,step_key),
  FOREIGN KEY(workspace_id,run_id) REFERENCES investigation_runs(workspace_id,run_id),
  CHECK ((owner_token IS NULL) = (lease_until IS NULL)),
  CHECK (owner_token IS NULL OR attempt_id IS NOT NULL)
);
CREATE TABLE outbox_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  event_key text NOT NULL UNIQUE,
  payload_version integer NOT NULL DEFAULT 1 CHECK (payload_version = 1),
  generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
  ready_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts BETWEEN 0 AND 100),
  delivered_at timestamptz,
  FOREIGN KEY(workspace_id,run_id) REFERENCES investigation_runs(workspace_id,run_id),
  UNIQUE(workspace_id,event_id)
);
CREATE INDEX outbox_ready ON outbox_events(ready_at,event_id) WHERE delivered_at IS NULL;
CREATE INDEX steps_ready ON run_steps(ready_at,run_id) WHERE ready;
CREATE INDEX leases_expired ON run_steps(lease_until) WHERE owner_token IS NOT NULL;
CREATE TABLE inbox_receipts (
  workspace_id uuid NOT NULL,
  event_id uuid NOT NULL,
  handler text NOT NULL CHECK (handler = 'local-analysis-v1'),
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(event_id,handler),
  FOREIGN KEY(workspace_id,event_id) REFERENCES outbox_events(workspace_id,event_id)
);
CREATE TABLE budget_reservations (
  workspace_id uuid NOT NULL,
  run_id uuid PRIMARY KEY,
  bytes_reserved bigint NOT NULL CHECK (bytes_reserved >= 0),
  compute_reserved integer NOT NULL CHECK (compute_reserved >= 0),
  bytes_consumed bigint NOT NULL DEFAULT 0 CHECK (bytes_consumed >= 0 AND bytes_consumed <= bytes_reserved),
  compute_consumed integer NOT NULL DEFAULT 0 CHECK (compute_consumed >= 0 AND compute_consumed <= compute_reserved),
  compute_measured_ms bigint NOT NULL DEFAULT 0 CHECK (compute_measured_ms >= 0),
  bytes_released bigint NOT NULL DEFAULT 0 CHECK (bytes_released >= 0),
  compute_released integer NOT NULL DEFAULT 0 CHECK (compute_released >= 0),
  settled_at timestamptz,
  FOREIGN KEY(workspace_id,run_id) REFERENCES investigation_runs(workspace_id,run_id),
  CHECK (settled_at IS NULL OR bytes_consumed + bytes_released = bytes_reserved),
  CHECK (settled_at IS NULL OR compute_consumed + compute_released = compute_reserved)
);
CREATE TABLE run_artifacts (
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('result','report','diagnostic')),
  digest text NOT NULL,
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 0 AND 8388608),
  schema_version text NOT NULL DEFAULT '2' CHECK (schema_version = '2'),
  trust_origin text NOT NULL DEFAULT 'local-recomputed-static-analysis' CHECK (trust_origin = 'local-recomputed-static-analysis'),
  privacy_scope text NOT NULL DEFAULT 'private-local' CHECK (privacy_scope = 'private-local'),
  PRIMARY KEY(run_id,role),
  FOREIGN KEY(workspace_id,run_id) REFERENCES investigation_runs(workspace_id,run_id),
  FOREIGN KEY(workspace_id,digest) REFERENCES input_blobs(workspace_id,digest)
);
CREATE TABLE audit_events (
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 0),
  previous_state text,
  state text NOT NULL,
  state_version integer NOT NULL CHECK (state_version >= 0),
  actor text NOT NULL CHECK (actor IN ('operator','worker','coordinator')),
  reason text NOT NULL CHECK (reason ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  generation integer CHECK (generation >= 0),
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(run_id,sequence),
  UNIQUE(run_id,state_version),
  FOREIGN KEY(workspace_id,run_id) REFERENCES investigation_runs(workspace_id,run_id)
);
CREATE TABLE storage_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL,
  digest text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('DELETE_PENDING','DELETED','ORPHAN_REGISTERED')),
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(workspace_id,digest) REFERENCES input_blobs(workspace_id,digest)
);
CREATE FUNCTION immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER storage_audit_immutable BEFORE UPDATE OR DELETE ON storage_events FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER inputs_immutable BEFORE UPDATE OR DELETE ON run_inputs FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER tokens_immutable BEFORE UPDATE OR DELETE ON idempotency_tokens FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE TRIGGER artifacts_immutable BEFORE UPDATE OR DELETE ON run_artifacts FOR EACH ROW EXECUTE FUNCTION immutable_record();
CREATE FUNCTION guard_input_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM investigation_runs WHERE run_id=NEW.run_id AND workspace_id=NEW.workspace_id AND creation_transaction=pg_current_xact_id())
    OR NOT EXISTS(SELECT 1 FROM input_blobs WHERE workspace_id=NEW.workspace_id AND digest=NEW.digest AND byte_length=NEW.byte_length AND state='READY')
  THEN RAISE EXCEPTION 'INVALID_INPUT_BINDING' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER input_binding BEFORE INSERT ON run_inputs FOR EACH ROW EXECUTE FUNCTION guard_input_insert();
CREATE FUNCTION guard_run() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.workspace_id,NEW.run_id,NEW.request_key,NEW.input_set_digest,NEW.engine,NEW.policy_id,NEW.policy_hash,
      NEW.input_bytes,NEW.max_attempts,NEW.compute_ms,NEW.output_bytes,NEW.duration_ms,NEW.lease_ms,NEW.created_at,NEW.deadline,NEW.creation_transaction)
     IS DISTINCT FROM
     (OLD.workspace_id,OLD.run_id,OLD.request_key,OLD.input_set_digest,OLD.engine,OLD.policy_id,OLD.policy_hash,
      OLD.input_bytes,OLD.max_attempts,OLD.compute_ms,OLD.output_bytes,OLD.duration_ms,OLD.lease_ms,OLD.created_at,OLD.deadline,OLD.creation_transaction)
  THEN RAISE EXCEPTION 'IMMUTABLE_RUN_IDENTITY' USING ERRCODE='23514'; END IF;
  IF OLD.state IN ('ANALYSIS_COMPLETE','CANCELLED','STOPPED','INDETERMINATE') OR NEW.state_version <> OLD.state_version + 1 OR NOT (
    (OLD.state = 'QUEUED' AND NEW.state IN ('CLAIMED','CANCELLED','STOPPED','INDETERMINATE')) OR
    (OLD.state = 'CLAIMED' AND NEW.state IN ('ANALYZING','CANCEL_REQUESTED','QUEUED','STOPPED','INDETERMINATE')) OR
    (OLD.state = 'ANALYZING' AND NEW.state IN ('ANALYSIS_COMPLETE','CANCEL_REQUESTED','QUEUED','STOPPED','INDETERMINATE')) OR
    (OLD.state = 'CANCEL_REQUESTED' AND NEW.state = 'CANCELLED'))
  THEN RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514'; END IF;
  IF OLD.cancel_requested_at IS NOT NULL AND NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at
  THEN RAISE EXCEPTION 'IMMUTABLE_CANCEL_REQUEST' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER run_guard BEFORE UPDATE ON investigation_runs FOR EACH ROW EXECUTE FUNCTION guard_run();
CREATE FUNCTION guard_step() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.workspace_id,NEW.run_id,NEW.step_key) IS DISTINCT FROM (OLD.workspace_id,OLD.run_id,OLD.step_key) OR
    NEW.generation < OLD.generation OR NEW.attempts < OLD.attempts OR NEW.generation > OLD.generation + 1 OR
    (NEW.owner_token IS DISTINCT FROM OLD.owner_token AND NEW.owner_token IS NOT NULL AND NEW.generation <> OLD.generation + 1)
  THEN RAISE EXCEPTION 'INVALID_LEASE_GENERATION' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER step_guard BEFORE UPDATE ON run_steps FOR EACH ROW EXECUTE FUNCTION guard_step();
CREATE FUNCTION assert_manifest() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE b integer; c integer; s integer; m integer; BEGIN
  SELECT count(*) FILTER (WHERE role='base-contract'),count(*) FILTER (WHERE role='candidate-contract'),
    count(*) FILTER (WHERE role='source'),count(*) FILTER (WHERE role='mapping') INTO b,c,s,m
    FROM run_inputs WHERE run_id=NEW.run_id;
  IF b<>1 OR c<>1 OR s<1 OR s>256 OR m>1 THEN RAISE EXCEPTION 'INVALID_MANIFEST_CARDINALITY' USING ERRCODE='23514'; END IF;
  IF (SELECT sum(byte_length) FROM run_inputs WHERE run_id=NEW.run_id) <> NEW.input_bytes
  THEN RAISE EXCEPTION 'INVALID_MANIFEST_SIZE' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER run_manifest AFTER INSERT ON investigation_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_manifest();
CREATE FUNCTION assert_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM investigation_runs WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id
    AND state=NEW.state AND state_version=NEW.state_version) OR NEW.sequence<>NEW.state_version
  THEN RAISE EXCEPTION 'INVALID_AUDIT_BINDING' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_binding BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION assert_audit();
CREATE FUNCTION assert_run_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM audit_events WHERE run_id=NEW.run_id AND state_version=NEW.state_version AND state=NEW.state)
  THEN RAISE EXCEPTION 'MISSING_TRANSITION_AUDIT' USING ERRCODE='23514'; END IF;
  IF NEW.state = 'ANALYSIS_COMPLETE' AND (SELECT count(*) FROM run_artifacts WHERE run_id=NEW.run_id AND role IN ('result','report')) <> 2
  THEN RAISE EXCEPTION 'MISSING_RESULT_ARTIFACTS' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER run_evidence AFTER INSERT OR UPDATE ON investigation_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_run_evidence();
