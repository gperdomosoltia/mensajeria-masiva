// Diagnostic: capture chromium's REAL failure with exit signal (no head piping).
const { spawnSync } = require('child_process');
const { execSync } = require('child_process');

const show = (label, cmd) => {
    console.log(`\n===== ${label} =====`);
    try { console.log(execSync(cmd, { encoding: 'utf8' })); }
    catch (e) { console.log('ERR status:', e.status, 'signal:', e.signal, '\nout:', e.stdout, '\nerr:', e.stderr); }
};

show('WRAPPER CONTENTS', 'cat /usr/bin/chromium');
show('REAL BINARY SEARCH', 'ls -la /usr/lib/chromium/ 2>&1 | head -20; echo "---"; find / -name "chrome" -o -name "chromium" 2>/dev/null | grep -vE "wwebjs|node_modules" | head');

// Launch real binary directly, capture exact signal/code + full stderr (NO pipe).
const launch = (label, bin, args) => {
    console.log(`\n===== ${label}: ${bin} =====`);
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 30000 });
    console.log('status:', r.status, 'signal:', r.signal, 'error:', r.error && r.error.message);
    console.log('STDOUT:', (r.stdout || '').slice(0, 800));
    console.log('STDERR:', (r.stderr || '').slice(0, 2000));
};

const flags = ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--dump-dom', 'about:blank'];
launch('WRAPPER LAUNCH', '/usr/bin/chromium', flags);
launch('REAL BINARY LAUNCH', '/usr/lib/chromium/chromium', flags);
launch('OLD HEADLESS MODE', '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--dump-dom', 'about:blank']);

console.log('\n===== DIAG DONE =====\n');
