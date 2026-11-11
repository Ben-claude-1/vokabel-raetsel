-- Admin-Spieleransicht: was genau eingegeben wurde und aus welchem Topf.
-- answer   = Eingabe des Kindes (bei Paar-Zuordnung das zugeordnete Wort)
-- from_pot = Topf vor der Antwort (pot bleibt Topf danach)
-- verdict  = 'partial' (Tippfehler/Akzent), 'ai' (KI hat akzeptiert), 'helped', 'skipped'
ALTER TABLE word_events ADD COLUMN IF NOT EXISTS answer text;
ALTER TABLE word_events ADD COLUMN IF NOT EXISTS from_pot integer;
ALTER TABLE word_events ADD COLUMN IF NOT EXISTS verdict text;
CREATE INDEX IF NOT EXISTS idx_word_events_player_run ON word_events (player_id, run_id, created_at DESC);
NOTIFY pgrst, 'reload schema';
