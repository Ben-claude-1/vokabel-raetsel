# Vokabel-Rätsel (Lern App)

Lern-App für Vokabeln (Leiterspiel, Wiederholung, Quiz, Kreuzworträtsel,
Grammatik, Klassenarbeit). React im Browser, Daten über PostgREST auf einer
lokalen PostgreSQL; ausgeliefert als statische Seite über GitHub Pages.

## Aufbau

```
index.html          nur noch Rahmen: React (CDN) + <script type="module" src="dist/main.js">
src/
  main.jsx          Einstiegspunkt (hängt <App/> in #root)
  app/Shell.jsx     Navigation, Bildschirm-Auswahl, Klassen-/Sprachwahl, Lernzeit-Tracking
  core/             Logik ohne Oberfläche
    config.js       Server-Adresse und Schlüssel
    api.js          sbGet/sbPost/sbPatch/sbDel + Login-Hash
    react.js        Hooks aus dem globalen React (CDN)
    theme.js        Farben, Knopf-Stil, Topf-/Spiel-Metadaten
    util.js         Mischen, Sortieren, Datums- und Dauer-Formate
    scope.js        Klasse/Sprache: Filter, Auswahl, Reihenfolge
    words.js        Antwortprüfung, Wortvarianten, Wortarten, Layouts
    leitner.js      Töpfe, Prozent, Tages-Log, Pflicht-Wiederholung, Kapitel-Runs
    grammar.js      Grammatik- und Klassenarbeits-Fragen
    crossword.js    Gitter-Erzeugung fürs Kreuzworträtsel
    store.js        lokaler Zwischenspeicher, Startdaten
  ui/               Bildschirme (ein Modul je Bereich)
    leiterspiel.jsx wiederholung.jsx progress.jsx trainer.jsx browse.jsx
    quiz.jsx crossword.jsx grammar.jsx klassenarbeit.jsx admin.jsx
    auth.jsx widgets.jsx
dist/               gebaute Pakete — wird ausgeliefert, liegt im Repo
```

## Bauen

```bash
npm run build      # nach jeder Änderung in src/ nötig, schreibt dist/
npm run watch      # baut bei jeder Dateiänderung neu (mit Sourcemaps)
```

`dist/` ist eingecheckt, damit GitHub Pages ohne Build-Schritt ausliefert.
**Wichtig:** Änderungen in `src/` wirken erst nach `npm run build` — sonst
liegt weiter der alte Stand in `dist/`.

Admin, Quiz, Klassenarbeit, Grammatik, Kreuzworträtsel und die Vokabelliste
werden erst beim Öffnen nachgeladen (eigene Pakete). Der Start lädt rund
300 KB statt vorher 565 KB Quelltext plus 3 MB Babel-Compiler im Browser.

## Datenbank

Schema und Migrationen unter `migration/`, Hilfsskripte unter `scripts/`
(z. B. `import_klasse6.py` für neue Vokabellisten, `sync_auto_runs.py` für die
Kapitel-Leiterspiele).
