const SB_URL = localStorage.getItem('sb_url') || "https://mac-studio.taild5562c.ts.net";

// Tailnet-only (Serve :5461, kein Funnel): antwortet nur, wenn das Gerät im Tailnet ist
// und sagt, welcher Spieler zur Tailscale-Identität gehört. Siehe scripts/edge-proxy/server.js.
const WHOAMI_URL = localStorage.getItem('whoami_url') || "https://mac-studio.taild5562c.ts.net:5461/whoami";

const SB_KEY = localStorage.getItem('sb_key') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTc3NzEyMjQ2OSwiZXhwIjoxOTM0ODAyNDY5fQ.jzXBjrLedWlHB0l-TRKvrWlxkod6d5Ox8dbMbqV2LMU";

const HG = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

var HW_POST = { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

export { WHOAMI_URL, SB_URL, SB_KEY, HG, HW_POST };
