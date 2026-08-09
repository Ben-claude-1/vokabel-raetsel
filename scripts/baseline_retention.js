#!/usr/bin/env node
// Baseline vor dem Umbau der Leitner-Logik (10.08.2026).
//
// Rechnet aus ls_progress zwei Dinge aus, an denen sich alle späteren
// Änderungen messen lassen:
//   1. Behaltenskurve  — Erstversuch-Trefferquote nach Abstand in Tagen (Feld g/f1)
//   2. Topf-Struktur   — wie viele Wörter stehen wo, und wie schnell kamen sie dahin
//
// Rein lesend. Aufruf: node scripts/baseline_retention.js [> baseline.json]

const fs = require('fs');
const https = require('https');

const jwts = JSON.parse(fs.readFileSync('/Users/ben/.local/etc/vokabel/jwts.json', 'utf8'));
const SVC = jwts.service_role;
const HOST = 'mac-studio.taild5562c.ts.net';

function get(path) {
  return new Promise((resolve, reject) => {
    https.request({
      hostname: HOST, port: 443, method: 'GET', path: '/rest/v1/' + path,
      headers: { apikey: SVC, Authorization: 'Bearer ' + SVC, Accept: 'application/json' },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(body.slice(0, 200))); }
      });
    }).on('error', reject).end();
  });
}

// data ist ein jsonb-String (doppelt kodiert) — siehe Memory ls_progress_double_encoded
function parseData(d) {
  if (!d) return {};
  if (typeof d === 'object') return d;
  try { var p = JSON.parse(d); return typeof p === 'string' ? JSON.parse(p) : p; } catch (e) { return {}; }
}

// Abstands-Klassen für die Behaltenskurve
const BUCKETS = [
  { label: '1 Tag', min: 1, max: 1 },
  { label: '2-3 Tage', min: 2, max: 3 },
  { label: '4-7 Tage', min: 4, max: 7 },
  { label: '8-14 Tage', min: 8, max: 14 },
  { label: '15-30 Tage', min: 15, max: 30 },
  { label: '> 30 Tage', min: 31, max: 99999 },
];

function bucketOf(gap) {
  return BUCKETS.find(b => gap >= b.min && gap <= b.max) || null;
}

(async function main() {
  const players = await get('players?select=id,name,total_score');
  const runs = await get('ls_runs?select=id,name,word_count,grade,language');
  const runById = Object.fromEntries(runs.map(r => [r.id, r]));
  const rows = await get('ls_progress?select=player_id,run_id,data,updated_at');

  const out = { generated: new Date().toISOString(), players: [] };

  for (const p of players) {
    const mine = rows.filter(r => r.player_id === p.id);
    if (!mine.length) continue;

    const curve = BUCKETS.map(b => ({ label: b.label, first: 0, firstCor: 0 }));
    const potTotals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let sameDayClimb = 0, totalLearned = 0;
    const perRun = [];
    let answersAll = 0, firstAll = 0, firstCorAll = 0;

    for (const row of mine) {
      const d = parseData(row.data);
      const run = runById[row.run_id];
      const pots = d.pots || {};
      const counts = {};
      for (let i = 1; i <= 6; i++) { counts[i] = (pots[i] || []).length; potTotals[i] += counts[i]; }

      // Behaltenskurve aus den Tages-Logs
      const days = d.days || {};
      let runFirst = 0, runFirstCor = 0, runAns = 0;
      // Aufstiegs-Tempo: an welchem Tag wurde ein Wort erstmals "gelernt",
      // und wurde es am selben Tag überhaupt erst zum ersten Mal gesehen?
      const firstSeenDay = {};
      Object.keys(days).sort().forEach(k => {
        const day = days[k];
        if (!day) return;
        runAns += day.a || 0;
        runFirst += day.a1 || 0;
        runFirstCor += day.c1 || 0;
        const w = day.w || {};
        Object.keys(w).forEach(word => {
          if (firstSeenDay[word] === undefined) firstSeenDay[word] = k;
          const rec = w[word];
          if (rec.g != null && rec.f1 != null) {
            const b = bucketOf(rec.g);
            if (b) {
              const slot = curve.find(c => c.label === b.label);
              slot.first++;
              if (rec.f1) slot.firstCor++;
            }
          }
        });
        (day.l || []).forEach(word => {
          totalLearned++;
          if (firstSeenDay[word] === k) sameDayClimb++;
        });
      });

      answersAll += runAns; firstAll += runFirst; firstCorAll += runFirstCor;
      perRun.push({
        run: run ? run.name : row.run_id,
        grade: run ? run.grade : null,
        language: run ? run.language : null,
        words: Object.values(counts).reduce((a, b) => a + b, 0),
        pots: counts,
        answers: runAns,
        firstAttempts: runFirst,
        firstAttemptPct: runFirst ? Math.round(runFirstCor / runFirst * 100) : null,
        updated: row.updated_at ? row.updated_at.slice(0, 10) : null,
      });
    }

    out.players.push({
      name: p.name,
      score: p.total_score,
      runs: perRun.sort((a, b) => (b.answers || 0) - (a.answers || 0)),
      potTotals,
      answersAll,
      firstAttemptPctAll: firstAll ? Math.round(firstCorAll / firstAll * 100) : null,
      firstAttemptsAll: firstAll,
      retentionCurve: curve.map(c => ({
        gap: c.label, n: c.first,
        pct: c.first ? Math.round(c.firstCor / c.first * 100) : null,
      })),
      learnedTotal: totalLearned,
      learnedSameDayAsFirstContact: sameDayClimb,
    });
  }

  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FEHLER:', e.message); process.exit(1); });
