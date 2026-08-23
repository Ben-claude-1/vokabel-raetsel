# Migration: Supabase → eigene Postgres + PostgREST

> **Historisch** — der Umzug ist längst abgeschlossen, das Supabase-Projekt ist abgeschaltet.
> `data.sql`/`data_*.json` sind ein einmaliger Snapshot vom 25.04.2026 und veraltet.
> Für eine echte Wiederherstellung siehe `CREDENTIALS.md` → „Cluster-Reset (Notfall)".

Dieses Verzeichnis enthält alle Artefakte, um die Vokabel-App von Supabase auf eine selbst-gehostete Postgres+PostgREST-Lösung umzuziehen. Code-Änderungen am Frontend sind minimal: nur `SB_URL` und `SB_KEY` werden ausgetauscht.

## Inhalt

| Datei | Zweck |
|-------|-------|
| `schema.sql` | DDL aller Tabellen, FKs, Indexe, Funktionen, Trigger (10 KB) |
| `data.sql` | Bulk-INSERTs aller 443 Live-Zeilen (~830 KB) |
| `data_*.json` | Rohdaten je Tabelle (für Diff/Backup) |
| `docker-compose.yml` | Postgres 16 + PostgREST 12.2 |
| `init/00_roles.sql` | Rollen-Setup (`anon_role`, `service_role`, `vokabel_app`) |
| `.env.example` | Vorlage für Passwörter und JWT-Secret |

## Voraussetzungen

- Docker + Docker Compose
- `openssl` (für JWT-Secret)
- Hosting (eines davon):
  - **VPS** (Hetzner CX11 ~5 €/Monat, Ubuntu)
  - **Eigener Mac/Server zuhause** + Cloudflare Tunnel oder Tailscale Funnel
  - **Managed Postgres** (Neon/Railway): dann nur PostgREST selbst hosten

## Ablauf

### 1. `.env` befüllen
```bash
cd migration
cp .env.example .env
# PG_PASSWORD und APP_PASSWORD: openssl rand -base64 24
# JWT_SECRET: openssl rand -base64 48
nano .env
```

### 2. Container starten
```bash
docker compose up -d postgres
docker compose logs -f postgres   # warten bis healthy
```

### 3. Schema importieren
```bash
docker compose exec -T postgres psql -U vokabel_admin -d vokabel < schema.sql
```

### 4. Daten importieren
```bash
docker compose exec -T postgres psql -U vokabel_admin -d vokabel < data.sql
```

### 5. RLS aktivieren (oder bewusst aus lassen)
Die App geht aktuell davon aus, dass der `anon`-User in fast alle Tabellen schreiben/lesen darf (so ist Supabase derzeit auch konfiguriert). Wenn du es so willst:
```sql
-- nichts zu tun, RLS wurde aus dem Dump nicht übernommen → Tabellen sind offen für anon_role
```
Wenn du strenger werden willst, später Policies pro Tabelle setzen.

### 6. PostgREST starten
```bash
docker compose up -d postgrest
curl -i http://localhost:3000/players?limit=1
# sollte HTTP 401 → "JWT expected" liefern (RLS-Tabellen erfordern Auth) — ok
```

### 7. JWTs erzeugen
Mit dem `JWT_SECRET` aus `.env` zwei JWTs signieren:
```bash
JWT_SECRET=$(grep ^JWT_SECRET .env | cut -d= -f2-)
python3 - <<EOF
import jwt, time
print("ANON:", jwt.encode({"role":"anon_role","iat":int(time.time())}, "$JWT_SECRET", algorithm="HS256"))
print("SERVICE:", jwt.encode({"role":"service_role","iat":int(time.time())}, "$JWT_SECRET", algorithm="HS256"))
EOF
```
(braucht `pip install pyjwt`)

### 8. Frontend-Code umstellen
In `index.html` (zwei Zeilen am Anfang):
```js
var SB_URL = "https://api.deine-domain.de";   // PostgREST-Endpunkt
var SB_KEY = "<ANON_JWT von oben>";
```

### 9. Smoke-Test
- Login als admin → Tab 📚 lädt Kapitel?
- Leiterspiel-Run startet?
- learn_sessions wird beim Login geschrieben?

### 10. DNS + HTTPS
Empfehlung: Caddy als Reverse-Proxy vor PostgREST, automatisches Let's Encrypt:
```caddyfile
api.deine-domain.de {
  reverse_proxy localhost:3000
  header Access-Control-Allow-Origin *
}
```

### 11. Cutover
- Alten Supabase-Tab in Supabase-Dashboard auf „Pause" setzen (Notbremse)
- 24 h beobachten
- Wenn alles läuft: GitHub Pages-Build mit neuen Keys pushen
- Supabase-Projekt nach 7 Tagen löschen (oder als Backup laufen lassen)

## Bekannte Stolpersteine

1. **`ls_progress.data` ist als JSON-String gespeichert (nicht als Objekt)**. Das Frontend erwartet das so — beim Import werden die Werte 1:1 übernommen, daher kein Konflikt.
2. **`exec_sql` RPC** ist im Dump enthalten und auch in der Ziel-DB nutzbar — aber bedenke: deren Privileg ist `SECURITY DEFINER`, prüfe nach Migration ob `service_role` weiterhin EXECUTE-recht hat.
3. **`gen_random_uuid()`** braucht die `pgcrypto`-Extension (im Schema-Dump bereits aktiviert).
4. **Trigger `ls_progress_sync_stats`** läuft mit `SECURITY INVOKER` (default). Stelle sicher, dass `vokabel_app` UPDATE-Recht auf `players` hat (über anon_role bereits gegeben).
5. **CORS:** PostgREST setzt per Env `PGRST_SERVER_CORS_ALLOWED_ORIGINS=*`. Falls du strenger willst, auf GitHub-Pages-Origin einschränken.

## Rückzugsplan

Falls etwas schief geht:
1. Frontend-Code zurück auf Supabase-URL/Key
2. Eigene Postgres läuft weiter, Daten sind nicht verloren
3. Nochmal Diff `data.sql` vs. aktueller Supabase-Stand prüfen
4. Erneuter Versuch
