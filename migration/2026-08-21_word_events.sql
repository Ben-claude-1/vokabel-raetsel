-- Ein Datensatz je Antwort, spielübergreifend — Grundlage für die
-- Tagesansicht "welche Vokabel wurde wo, richtig/falsch, in welchem Topf
-- geübt". `pot` ist nur bei Leiterspiel/Wiederholung gesetzt (Leitner-System);
-- andere Spiele liefern null.
CREATE TABLE IF NOT EXISTS word_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id),
  game text NOT NULL,
  run_id uuid,
  word text NOT NULL,
  clue text,
  correct boolean NOT NULL,
  pot integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_word_events_player_day ON word_events (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_word_events_player_game_day ON word_events (player_id, game, created_at DESC);

ALTER TABLE word_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY word_events_anon ON word_events
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY word_events_service ON word_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON word_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON word_events TO service_role;
