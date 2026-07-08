// Diagnostic: run chromium directly to capture the REAL failure reason.
// whatsapp-web.js/puppeteer swallow chromium's fatal stderr. This does not.
const { execSync } = require('child_process');
const run = (label, cmd) => {
    console.log(`\n===== ${label} =====`);
    try {
        console.log(execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (e) {
        console.log('EXIT STATUS:', e.status, 'SIGNAL:', e.signal);
        console.log('STDOUT:', e.stdout);
        console.log('STDERR:', e.stderr);
    }
};

run('CHROMIUM PATH', 'which chromium; ls -la /usr/bin/chromium*');
run('CHROMIUM VERSION', '/usr/bin/chromium --version');
run('LDD MISSING LIBS', 'ldd /usr/bin/chromium 2>&1 | grep "not found" || echo "no missing libs"');
run('FREE MEMORY', 'cat /proc/meminfo | head -3; echo "---cgroup limit---"; cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo unknown');
run('HEADLESS LAUNCH (real stderr)', '/usr/bin/chromium --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --dump-dom about:blank 2>&1 | head -50');
console.log('\n===== DIAG DONE =====\n');
