import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const projectRoot = path.resolve(import.meta.dirname, '..');
const executable = path.join(projectRoot, 'release', 'linux-unpacked', 'knot');

if (!fs.existsSync(executable)) {
  console.error(`❌ Packaged executable not found at: ${executable}`);
  console.error('Please run "npm run package" before running this verification script.');
  process.exit(1);
}

// 1. Prepare completely isolated temporary environment (protects user's real ~/.config/knot)
const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knot-stability-test-'));
const isolatedBridgeDir = path.join(isolatedDir, 'bridge', 'v1');
fs.mkdirSync(isolatedBridgeDir, { recursive: true });

console.log('================================================================');
console.log('🔬 KNOT PACKAGED APPLICATION RUNTIME STABILITY AUDIT (60s)');
console.log('================================================================');
console.log(`Executable:          ${executable}`);
console.log(`Isolated Config Dir: ${isolatedDir}`);
console.log(`User Config Preserved: ~/.config/knot (UNTOUCHED)`);

const env = {
  ...process.env,
  XDG_CONFIG_HOME: isolatedDir,
  XDG_DATA_HOME: isolatedDir,
  KNOT_BRIDGE_ROOT: isolatedBridgeDir,
  ELECTRON_ENABLE_LOGGING: '1',
};

// Launch the packaged executable
const appArgs = [`--user-data-dir=${isolatedDir}`];
const proc = spawn(executable, appArgs, {
  cwd: projectRoot,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logLinesCount = 0;
let recentLogs = [];

proc.stdout.on('data', (d) => {
  const text = d.toString();
  const lines = text.split('\n').filter(Boolean);
  logLinesCount += lines.length;
  for (const l of lines) {
    recentLogs.push(`[STDOUT] ${l}`);
    if (recentLogs.length > 50) recentLogs.shift();
  }
});

proc.stderr.on('data', (d) => {
  const text = d.toString();
  const lines = text.split('\n').filter(Boolean);
  logLinesCount += lines.length;
  for (const l of lines) {
    recentLogs.push(`[STDERR] ${l}`);
    if (recentLogs.length > 50) recentLogs.shift();
  }
});

// Helper: Discover all descendant processes of the root process
function getProcessTreePids(rootPid) {
  const pids = new Set([rootPid]);
  let added = true;
  while (added) {
    added = false;
    for (const pid of Array.from(pids)) {
      try {
        const out = execSync(`pgrep -P ${pid}`, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (out) {
          for (const line of out.split('\n')) {
            const childPid = parseInt(line.trim(), 10);
            if (childPid && !pids.has(childPid)) {
              pids.add(childPid);
              added = true;
            }
          }
        }
      } catch {
        // leaf process
      }
    }
  }
  return Array.from(pids);
}

// Helper: Read CPU ticks (utime + stime) from /proc/<pid>/stat
function getPidCpuTicks(pid) {
  try {
    const statStr = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const closingParen = statStr.lastIndexOf(')');
    if (closingParen === -1) return null;
    const rest = statStr.slice(closingParen + 2).split(' ');
    // rest[11] is utime (14th field), rest[12] is stime (15th field)
    const utime = parseInt(rest[11], 10);
    const stime = parseInt(rest[12], 10);
    return utime + stime;
  } catch {
    return null;
  }
}

// Helper: Read RSS in MB from /proc/<pid>/status
function getPidRssMb(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
    const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
    if (match) {
      return parseInt(match[1], 10) / 1024;
    }
    return 0;
  } catch {
    return 0;
  }
}

console.log('\n⏳ Waiting 8 seconds for application startup & warm-up...');
await new Promise((resolve) => setTimeout(resolve, 8000));

const initialPids = getProcessTreePids(proc.pid);
console.log(`\n✅ Application initialized. Active process tree (PIDs: ${initialPids.join(', ')}):`);
for (const pid of initialPids) {
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ').slice(0, 80);
    const rss = getPidRssMb(pid).toFixed(1);
    console.log(`   - PID ${pid}: ${rss} MB RSS | ${cmd}`);
  } catch {
    // Process may have exited
  }
}

// Measurement configuration: 60 seconds total sampling (30 samples x 2.0s)
const TOTAL_SAMPLE_SECONDS = 60;
const SAMPLE_INTERVAL_MS = 2000;
const TOTAL_SAMPLES = Math.floor((TOTAL_SAMPLE_SECONDS * 1000) / SAMPLE_INTERVAL_MS);

console.log(`\n📈 Starting continuous multi-sample CPU & Memory sampling for ${TOTAL_SAMPLE_SECONDS} seconds...`);
console.log(`   Sampling rate: every ${SAMPLE_INTERVAL_MS / 1000}s (${TOTAL_SAMPLES} total intervals)\n`);
console.log('Interval | Elapsed | Total CPU % | Total RSS (MB) | Active PIDs | Log Activity');
console.log('---------+---------+-------------+----------------+-------------+-------------');

const sampleResults = [];
let prevSnapshot = new Map();
let prevTime = Date.now();
let prevLogCount = logLinesCount;

// Populate initial tick snapshot
for (const pid of getProcessTreePids(proc.pid)) {
  const ticks = getPidCpuTicks(pid);
  if (ticks !== null) {
    prevSnapshot.set(pid, ticks);
  }
}

const startTime = Date.now();

for (let i = 1; i <= TOTAL_SAMPLES; i++) {
  await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS));

  const now = Date.now();
  const deltaSec = (now - prevTime) / 1000;
  prevTime = now;

  const currentPids = getProcessTreePids(proc.pid);
  let totalDeltaTicks = 0;
  let totalRss = 0;
  const currentSnapshot = new Map();

  for (const pid of currentPids) {
    const ticks = getPidCpuTicks(pid);
    const rss = getPidRssMb(pid);
    totalRss += rss;

    if (ticks !== null) {
      currentSnapshot.set(pid, ticks);
      const prevTicks = prevSnapshot.get(pid);
      if (prevTicks !== undefined && ticks >= prevTicks) {
        totalDeltaTicks += ticks - prevTicks;
      }
    }
  }

  prevSnapshot = currentSnapshot;

  // CPU% across whole tree: (deltaTicks / 100 Hz) / deltaSec * 100 = deltaTicks / deltaSec
  const cpuPercent = totalDeltaTicks / deltaSec;
  const logDelta = logLinesCount - prevLogCount;
  prevLogCount = logLinesCount;

  sampleResults.push({
    sampleIndex: i,
    elapsedSec: Math.round((now - startTime) / 1000),
    cpuPercent,
    totalRss,
    pidCount: currentPids.length,
    logDelta,
  });

  const elapsedStr = `${sampleResults[sampleResults.length - 1].elapsedSec}s`.padStart(5);
  const cpuStr = `${cpuPercent.toFixed(1)}%`.padStart(8);
  const rssStr = `${totalRss.toFixed(1)} MB`.padStart(11);
  const pidsStr = `${currentPids.length} processes`.padStart(11);
  const logStr = `${logDelta} lines`.padStart(10);

  console.log(`   #${String(i).padStart(2)}   |  ${elapsedStr}  |   ${cpuStr}  |  ${rssStr}   | ${pidsStr} | ${logStr}`);
}

// 7. Calculate aggregate metrics
const cpuValues = sampleResults.map((s) => s.cpuPercent);
const rssValues = sampleResults.map((s) => s.totalRss);
const logDeltas = sampleResults.map((s) => s.logDelta);

const avgCpu = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
const peakCpu = Math.max(...cpuValues);
const minCpu = Math.min(...cpuValues);

const avgRss = rssValues.reduce((a, b) => a + b, 0) / rssValues.length;
const peakRss = Math.max(...rssValues);

const totalIdleLogs = logDeltas.reduce((a, b) => a + b, 0);

console.log('\n================================================================');
console.log('📊 60-SECOND RUNTIME STABILITY MEASUREMENT RESULTS');
console.log('================================================================');
console.log(`Sample Duration:       ${TOTAL_SAMPLE_SECONDS} seconds (${sampleResults.length} intervals)`);
console.log(`Average CPU Usage:     ${avgCpu.toFixed(2)}% (Target: < 5.0%)`);
console.log(`Peak CPU Usage:        ${peakCpu.toFixed(2)}%`);
console.log(`Min CPU Usage:         ${minCpu.toFixed(2)}%`);
console.log(`Average Tree Memory:   ${avgRss.toFixed(1)} MB RSS`);
console.log(`Peak Tree Memory:      ${peakRss.toFixed(1)} MB RSS`);
console.log(`Log Activity (idle):   ${totalIdleLogs} lines emitted during 60s idle phase`);

if (avgCpu >= 5.0) {
  console.error(`\n❌ FAIL: Average CPU usage (${avgCpu.toFixed(2)}%) exceeds the 5.0% idle stability threshold!`);
  proc.kill('SIGKILL');
  process.exit(1);
} else {
  console.log(`\n✅ PASS: Idle CPU usage settled cleanly at ${avgCpu.toFixed(2)}% average (< 5.0% threshold).`);
}

// 8. Test Graceful Shutdown
console.log('\n🛑 Testing graceful application shutdown via SIGINT...');
const shutdownStartTime = Date.now();
const allTrackedPids = getProcessTreePids(proc.pid);

const shutdownPromise = new Promise((resolve, reject) => {
  proc.on('exit', (code, signal) => {
    const duration = Date.now() - shutdownStartTime;
    console.log(`✅ Main process exited with code ${code}, signal ${signal} in ${duration}ms`);
    resolve({ code, signal, duration });
  });

  setTimeout(() => {
    reject(new Error('Process failed to exit gracefully within 5000ms!'));
  }, 5000);
});

proc.kill('SIGINT');

let shutdownDuration = 0;
try {
  const res = await shutdownPromise;
  shutdownDuration = res.duration;
} catch (err) {
  console.error(`❌ ${err.message}`);
  proc.kill('SIGKILL');
  process.exit(1);
}

// 9. Verify No Orphaned Child Processes
console.log('\n🔍 Verifying zero orphaned child processes...');
await new Promise((resolve) => setTimeout(resolve, 1000));

let orphanedCount = 0;
for (const pid of allTrackedPids) {
  try {
    process.kill(pid, 0); // throws if process does not exist
    console.error(`❌ Orphaned process detected! PID ${pid} is still running!`);
    orphanedCount++;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  } catch {
    // Expected: process is dead
  }
}

if (orphanedCount > 0) {
  console.error(`❌ FAIL: Found ${orphanedCount} orphaned child process(es)!`);
  process.exit(1);
} else {
  console.log('✅ PASS: All tracked child processes terminated cleanly. Zero orphaned processes.');
}

// 10. Clean up isolated temporary test directory
try {
  fs.rmSync(isolatedDir, { recursive: true, force: true });
  console.log(`✅ Cleaned up isolated test directory: ${isolatedDir}`);
} catch {
  // ignore
}

console.log('\n================================================================');
console.log('🎉 RUNTIME STABILITY & PROCESS LIFECYCLE AUDIT COMPLETE: ALL PASSED');
console.log('================================================================\n');

process.exit(0);
