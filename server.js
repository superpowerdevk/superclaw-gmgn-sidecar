const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// ─── Write GMGN credentials to ~/.config/gmgn/.env on boot ───
const configDir = path.join(process.env.HOME || '/root', '.config', 'gmgn');
const envFile = path.join(configDir, '.env');

function bootstrapCredentials() {
  const apiKey = process.env.GMGN_API_KEY;
  const privateKey = process.env.GMGN_PRIVATE_KEY;
  if (!apiKey || !privateKey) {
    console.error('FATAL: GMGN_API_KEY and GMGN_PRIVATE_KEY env vars required');
    process.exit(1);
  }
  fs.mkdirSync(configDir, { recursive: true });
  // Render env vars store newlines literally — convert \n back to real newlines for PEM
  const pem = privateKey.replace(/\\n/g, '\n');
  const content = `GMGN_API_KEY=${apiKey}\nGMGN_PRIVATE_KEY="${pem.replace(/\n/g, '\\n')}"\n`;
  fs.writeFileSync(envFile, content, { mode: 0o600 });
  console.log(`Wrote credentials to ${envFile}`);
}

bootstrapCredentials();

// ─── Shared runner ───
function runGmgnCli(args, res) {
  const cmd = `gmgn-cli ${args} --raw`;
  console.log(`> ${cmd}`);
  exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('gmgn-cli error:', stderr);
      return res.status(500).json({ error: 'gmgn-cli failed', detail: stderr, code: err.code });
    }
    try {
      const json = JSON.parse(stdout);
      res.json(json);
    } catch (e) {
      res.status(500).json({ error: 'Invalid JSON from gmgn-cli', raw: stdout.slice(0, 500) });
    }
  });
}

// ─── Routes ───
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'superclaw-gmgn-sidecar',
    sources: ['gmgn'],
    uptime: process.uptime(),
  });
});

// Trending tokens: /trending/sol?interval=1h&limit=50
app.get('/trending/:chain', (req, res) => {
  const { chain } = req.params;
  const interval = req.query.interval || '1h';
  const limit = req.query.limit || '50';
  runGmgnCli(`market trending --chain ${chain} --interval ${interval} --limit ${limit}`, res);
});

// Trenches: /trenches/sol?limit=50
app.get('/trenches/:chain', (req, res) => {
  const { chain } = req.params;
  const limit = req.query.limit || '50';
  const types = ['new_creation', 'near_completion', 'completed'];
  const typeArgs = types.map((t) => `--type ${t}`).join(' ');
  runGmgnCli(`market trenches --chain ${chain} ${typeArgs} --limit ${limit}`, res);
});

// Token info: /token/sol/:address
app.get('/token/:chain/:address', (req, res) => {
  const { chain, address } = req.params;
  runGmgnCli(`token info --chain ${chain} --address ${address}`, res);
});

app.listen(PORT, () => {
  console.log(`SuperClaw GMGN sidecar listening on :${PORT}`);
});
