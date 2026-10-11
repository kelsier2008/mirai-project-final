-- 011: Mirai platform update. Additive only; safe to run more than once.
-- Club lifecycle, plan drafts, schedule history for rescheduling, grading
-- status, session history metadata, email delivery and reminder hygiene.

-- ---------- Clubs: deactivation and decision trail ----------
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approval_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS ix_clubs_campus_active ON clubs (campus_id, is_active);

-- ---------- Club days: start/end time and reschedule tracking ----------
ALTER TABLE club_days
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_version INT NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'club_days_time_order') THEN
    ALTER TABLE club_days ADD CONSTRAINT club_days_time_order
      CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time);
  END IF;
END $$;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_version INT NOT NULL DEFAULT 1;

-- Previous and new schedule for every reschedule of a club day or event.
CREATE TABLE IF NOT EXISTS schedule_changes (
  id BIGSERIAL PRIMARY KEY,
  entity TEXT NOT NULL CHECK (entity IN ('club_day', 'event')),
  entity_id BIGINT NOT NULL,
  version INT NOT NULL,
  previous JSONB NOT NULL,
  current JSONB NOT NULL,
  reason TEXT,
  changed_by BIGINT REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity, entity_id, version)
);
CREATE INDEX IF NOT EXISTS ix_schedule_changes_entity
  ON schedule_changes (entity, entity_id, changed_at DESC);

-- ---------- Activity plans: drafts and a submission/decision trail ----------
ALTER TABLE activity_plans DROP CONSTRAINT IF EXISTS activity_plans_status_check;
ALTER TABLE activity_plans ADD CONSTRAINT activity_plans_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected'));
ALTER TABLE activity_plans ALTER COLUMN body DROP NOT NULL;
ALTER TABLE activity_plans
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT;

-- ---------- Grading: explicit evaluation status ----------
ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'graded',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluations_status_check') THEN
    ALTER TABLE evaluations ADD CONSTRAINT evaluations_status_check
      CHECK (status IN ('graded', 'resubmission_requested'));
  END IF;
END $$;

-- ---------- Check-in session history ----------
ALTER TABLE checkin_sessions
  ADD COLUMN IF NOT EXISTS opened_by BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS closed_by BIGINT REFERENCES users(id);

-- ---------- Notifications: cancellation, email channel and preferences ----------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ix_notifications_created ON notifications (send_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_notifications_club_day
  ON notifications (((payload->>'club_day_id'))) WHERE payload ? 'club_day_id';

ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_channel_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_channel_check
  CHECK (channel IN ('whatsapp', 'email'));
ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_status_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT true;

-- ---------- Dashboard rollup: expose registry state (columns appended) ----------
DROP VIEW IF EXISTS v_club_stats;
CREATE VIEW v_club_stats AS
SELECT c.id AS club_id, c.name AS club_name, c.campus_id, c.advisor_id, c.capacity,
  (SELECT count(*) FROM club_memberships m
     WHERE m.club_id = c.id AND m.status = 'approved') AS members,
  (SELECT count(*) FROM club_days d
     WHERE d.club_id = c.id AND d.status <> 'planned') AS club_days,
  (SELECT max(d.day_date) FROM club_days d
     WHERE d.club_id = c.id AND d.status <> 'planned') AS last_club_day,
  (SELECT count(*) FROM attendance a
     JOIN checkin_sessions s ON s.id = a.session_id
     JOIN club_days d ON d.id = s.club_day_id
     WHERE d.club_id = c.id) AS attendance_records,
  (SELECT count(*) FROM submissions sb
     JOIN club_days d ON d.id = sb.club_day_id
     WHERE d.club_id = c.id) AS submissions,
  (SELECT round(avg((SELECT sum(x.value::numeric) FROM jsonb_each_text(e.scores) AS x)), 2)
     FROM evaluations e
     JOIN submissions sb ON sb.id = e.submission_id
     JOIN club_days d ON d.id = sb.club_day_id
     WHERE d.club_id = c.id) AS avg_score,
  (SELECT count(*) FROM certificates ce
     JOIN club_days d ON d.id = ce.ref_id
     WHERE ce.ref_type = 'club_day' AND ce.revoked_at IS NULL AND d.club_id = c.id) AS certificates,
  c.approval_status,
  c.is_active
FROM clubs c;
