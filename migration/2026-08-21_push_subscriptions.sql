-- Web-Push-Abonnements pro Spieler:in. `anon` darf nur INSERT (Browser
-- meldet sich selbst an) — bewusst KEIN SELECT/DELETE für anon, sonst wären
-- alle Endpoints/Keys aller Spieler über den öffentlichen anon-Key
-- auslesbar. Der Push-Server liest/löscht direkt als DB-Owner (lokal auf dem
-- Mac Studio, nicht über PostgREST erreichbar).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_player_idx ON push_subscriptions(player_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_insert ON push_subscriptions
  FOR INSERT TO anon WITH CHECK (true);

GRANT INSERT ON push_subscriptions TO anon;
