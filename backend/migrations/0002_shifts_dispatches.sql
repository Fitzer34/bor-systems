CREATE TYPE dispatch_status AS ENUM ('sent', 'acknowledged', 'completed');

CREATE TABLE shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  building_id uuid REFERENCES buildings(id) ON DELETE SET NULL,
  floor_id uuid REFERENCES floors(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shifts_user_idx ON shifts(user_id, starts_at);
CREATE INDEX shifts_active_idx ON shifts(starts_at, ends_at);

CREATE TABLE dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES zones(id) ON DELETE SET NULL,
  message text NOT NULL,
  status dispatch_status NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX dispatches_recipient_idx ON dispatches(recipient_user_id, status, sent_at);
