const SB_URL = localStorage.getItem('sb_url') || "https://mac-studio.taild5562c.ts.net";

const SB_KEY = localStorage.getItem('sb_key') || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTc3NzEyMjQ2OSwiZXhwIjoxOTM0ODAyNDY5fQ.jzXBjrLedWlHB0l-TRKvrWlxkod6d5Ox8dbMbqV2LMU";

const HG = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

var HW_POST = { "Content-Type": "application/json", apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

export { SB_URL, SB_KEY, HG, HW_POST };
