-- Rollen für PostgREST (analog zu Supabase: anon_role + service_role)
-- Wird beim ersten Container-Start ausgeführt.

CREATE ROLE anon_role NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- App-User: bekommt anon_role und service_role per JWT zugewiesen
CREATE ROLE vokabel_app LOGIN PASSWORD :'app_password';
GRANT anon_role TO vokabel_app;
GRANT service_role TO vokabel_app;

-- Schema-Rechte
GRANT USAGE ON SCHEMA public TO anon_role, service_role;
GRANT ALL ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon_role;
