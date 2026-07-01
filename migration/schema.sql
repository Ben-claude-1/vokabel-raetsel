-- Vokabel-Rätsel: Schema-Dump aus Supabase (zdtwlxclgsrfskqqnved) für eigene Postgres-Migration
-- Generiert: 2026-04-25

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabelle: categories
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366f1'::text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (name)
);

-- Tabelle: chapters
CREATE TABLE IF NOT EXISTS public.chapters (
  id text NOT NULL,
  title text NOT NULL,
  color text DEFAULT '#0f766e'::text,
  icon text DEFAULT '📚'::text,
  words jsonb NOT NULL,
  source_image text,
  is_builtin boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  sentences jsonb DEFAULT '[]'::jsonb,
  parent_id text,
  PRIMARY KEY (id)
);

-- Tabelle: learn_sessions
CREATE TABLE IF NOT EXISTS public.learn_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  run_id uuid,
  started_at timestamptz DEFAULT now() NOT NULL,
  ended_at timestamptz,
  active_seconds integer DEFAULT 0 NOT NULL,
  correct_count integer DEFAULT 0 NOT NULL,
  wrong_count integer DEFAULT 0 NOT NULL,
  game text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- Tabelle: repeat_runs (Wiederholungsmodus — je Lauf 20 gelernte Vokabeln, Punkte 10/5/0)
-- RLS/Grants analog learn_sessions (anon+authenticated USING/CHECK true) live gepflegt.
CREATE TABLE IF NOT EXISTS public.repeat_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid NOT NULL,
  score integer DEFAULT 0 NOT NULL,
  max_score integer DEFAULT 0 NOT NULL,
  word_count integer DEFAULT 0 NOT NULL,
  correct_count integer DEFAULT 0 NOT NULL,
  hint1_count integer DEFAULT 0 NOT NULL,
  hint2_count integer DEFAULT 0 NOT NULL,
  items jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- Tabelle: lobbies
CREATE TABLE IF NOT EXISTS public.lobbies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  player_1 uuid,
  player_2 uuid,
  status text DEFAULT 'waiting'::text,
  session_id uuid,
  current_index integer DEFAULT 0,
  score_1 integer DEFAULT 0,
  score_2 integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (code)
);

-- Tabelle: lobby_answers
CREATE TABLE IF NOT EXISTS public.lobby_answers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lobby_id uuid,
  player_id uuid,
  word_index integer NOT NULL,
  answer text,
  correct boolean,
  submitted_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

-- Tabelle: ls_progress
CREATE TABLE IF NOT EXISTS public.ls_progress (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid,
  run_id uuid,
  data jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (player_id, run_id)
);

-- Tabelle: ls_runs
CREATE TABLE IF NOT EXISTS public.ls_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  player_id uuid,
  is_admin_run boolean DEFAULT false,
  word_count integer DEFAULT 0,
  sentence_count integer DEFAULT 0,
  words jsonb DEFAULT '[]'::jsonb,
  sentences jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  icon text,
  target_date date,
  target_pct integer DEFAULT 100,
  PRIMARY KEY (id)
);

-- Tabelle: players
CREATE TABLE IF NOT EXISTS public.players (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  password_hash text,
  is_admin boolean DEFAULT false,
  total_score integer DEFAULT 0,
  total_correct integer DEFAULT 0,
  total_wrong integer DEFAULT 0,
  puzzles_completed integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  PRIMARY KEY (id),
  UNIQUE (name)
);

-- Tabelle: puzzle_completions
CREATE TABLE IF NOT EXISTS public.puzzle_completions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid,
  chapter_id text NOT NULL,
  puzzle_label text,
  correct_count integer DEFAULT 0,
  total_count integer DEFAULT 0,
  completed_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

-- Tabelle: quiz_duels
CREATE TABLE IF NOT EXISTS public.quiz_duels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  player1_id uuid,
  player1_name text,
  player2_id uuid,
  player2_name text,
  rounds jsonb NOT NULL,
  round_wins_p1 jsonb DEFAULT '[]'::jsonb,
  round_wins_p2 jsonb DEFAULT '[]'::jsonb,
  current_round integer DEFAULT 0,
  whose_turn text DEFAULT 'p1'::text,
  status text DEFAULT 'waiting'::text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (code)
);

-- Tabelle: results
CREATE TABLE IF NOT EXISTS public.results (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid,
  session_id uuid,
  word text NOT NULL,
  clue text NOT NULL,
  chapter_id text,
  correct boolean NOT NULL,
  typed_answer text,
  attempts integer DEFAULT 0,
  check_count integer DEFAULT 0,
  completed_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

-- Tabelle: sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  image_name text,
  vocab_list jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

-- Tabelle: settings
CREATE TABLE IF NOT EXISTS public.settings (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (key)
);

-- Tabelle: word_categories
CREATE TABLE IF NOT EXISTS public.word_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  word text NOT NULL,
  clue text,
  chapter_id text,
  topic_id text,
  is_important boolean DEFAULT false,
  category_id uuid,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (word, chapter_id)
);

-- Tabelle: word_disputes
CREATE TABLE IF NOT EXISTS public.word_disputes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid,
  player_name text,
  run_id uuid,
  word text NOT NULL,
  clue text,
  typed_answer text NOT NULL,
  pot integer,
  chapter_id text,
  status text DEFAULT 'pending'::text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  admin_note text,
  dispute_type text DEFAULT 'dispute'::text,
  PRIMARY KEY (id)
);

-- Tabelle: word_progress
CREATE TABLE IF NOT EXISTS public.word_progress (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  player_id uuid,
  word text NOT NULL,
  clue text,
  chapter_id text,
  history jsonb DEFAULT '[]'::jsonb,
  last_seen timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (player_id, word)
);

-- Foreign keys
ALTER TABLE public.categories ADD CONSTRAINT categories_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.players(id);
ALTER TABLE public.chapters ADD CONSTRAINT chapters_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.chapters(id);
ALTER TABLE public.chapters ADD CONSTRAINT chapters_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.players(id);
ALTER TABLE public.lobbies ADD CONSTRAINT lobbies_player_2_fkey FOREIGN KEY (player_2) REFERENCES public.players(id);
ALTER TABLE public.lobbies ADD CONSTRAINT lobbies_player_1_fkey FOREIGN KEY (player_1) REFERENCES public.players(id);
ALTER TABLE public.lobbies ADD CONSTRAINT lobbies_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);
ALTER TABLE public.lobby_answers ADD CONSTRAINT lobby_answers_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);
ALTER TABLE public.lobby_answers ADD CONSTRAINT lobby_answers_lobby_id_fkey FOREIGN KEY (lobby_id) REFERENCES public.lobbies(id);
ALTER TABLE public.ls_progress ADD CONSTRAINT ls_progress_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ls_runs(id);
ALTER TABLE public.ls_progress ADD CONSTRAINT ls_progress_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);
ALTER TABLE public.ls_runs ADD CONSTRAINT ls_runs_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);
ALTER TABLE public.puzzle_completions ADD CONSTRAINT puzzle_completions_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);
ALTER TABLE public.quiz_duels ADD CONSTRAINT quiz_duels_player2_id_fkey FOREIGN KEY (player2_id) REFERENCES public.players(id);
ALTER TABLE public.quiz_duels ADD CONSTRAINT quiz_duels_player1_id_fkey FOREIGN KEY (player1_id) REFERENCES public.players(id);
ALTER TABLE public.results ADD CONSTRAINT results_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);
ALTER TABLE public.results ADD CONSTRAINT results_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);
ALTER TABLE public.sessions ADD CONSTRAINT sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.players(id);
ALTER TABLE public.word_categories ADD CONSTRAINT word_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);
ALTER TABLE public.word_progress ADD CONSTRAINT word_progress_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);

-- Indexes
CREATE UNIQUE INDEX categories_name_key ON public.categories USING btree (name);
CREATE INDEX idx_learn_sessions_player ON public.learn_sessions USING btree (player_id, started_at DESC);
CREATE INDEX idx_learn_sessions_run ON public.learn_sessions USING btree (run_id) WHERE (run_id IS NOT NULL);
CREATE INDEX idx_repeat_runs_player ON public.repeat_runs USING btree (player_id, created_at DESC);
CREATE UNIQUE INDEX lobbies_code_key ON public.lobbies USING btree (code);
CREATE UNIQUE INDEX ls_progress_player_id_run_id_key ON public.ls_progress USING btree (player_id, run_id);
CREATE UNIQUE INDEX players_name_key ON public.players USING btree (name);
CREATE UNIQUE INDEX quiz_duels_code_key ON public.quiz_duels USING btree (code);
CREATE UNIQUE INDEX word_categories_word_chapter_id_key ON public.word_categories USING btree (word, chapter_id);
CREATE UNIQUE INDEX word_progress_player_id_word_key ON public.word_progress USING btree (player_id, word);

-- Functions
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE result jsonb; BEGIN EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || query || ') t' INTO result; RETURN result; EXCEPTION WHEN OTHERS THEN EXECUTE query; RETURN jsonb_build_object('executed', true, 'note', SQLERRM); END; $function$
;

CREATE OR REPLACE FUNCTION public.sync_player_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ DECLARE c int := 0; w int := 0; BEGIN SELECT COALESCE(SUM(((CASE WHEN jsonb_typeof(data)='string' THEN (data#>>'{}')::jsonb ELSE data END)->>'totalCorrect')::int), 0), COALESCE(SUM(((CASE WHEN jsonb_typeof(data)='string' THEN (data#>>'{}')::jsonb ELSE data END)->>'totalWrong')::int), 0) INTO c, w FROM ls_progress WHERE player_id = NEW.player_id; UPDATE players SET total_correct = c, total_wrong = w WHERE id = NEW.player_id; RETURN NEW; END; $function$
;

-- Triggers
CREATE TRIGGER ls_progress_sync_stats AFTER INSERT ON public.ls_progress EXECUTE FUNCTION sync_player_stats();
CREATE TRIGGER ls_progress_sync_stats AFTER UPDATE ON public.ls_progress EXECUTE FUNCTION sync_player_stats();
-- Views
CREATE OR REPLACE VIEW public.word_stats AS
 SELECT player_id, word, clue, chapter_id,
    count(*) FILTER (WHERE (correct = true)) AS correct_count,
    count(*) FILTER (WHERE (correct = false)) AS wrong_count,
    count(*) AS total_attempts,
    max(completed_at) AS last_seen
   FROM results
  GROUP BY player_id, word, clue, chapter_id;

CREATE OR REPLACE VIEW public.leaderboard AS
 SELECT id, name, total_score, total_correct, total_wrong, puzzles_completed,
    round(CASE WHEN ((total_correct + total_wrong) > 0)
                    THEN (((total_correct)::numeric / ((total_correct + total_wrong))::numeric) * (100)::numeric)
                ELSE (0)::numeric END, 1) AS accuracy_pct,
    rank() OVER (ORDER BY total_score DESC) AS rank
   FROM players p
  WHERE (is_admin = false)
  ORDER BY total_score DESC;
