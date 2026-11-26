import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import electronPath from 'electron';

function startProduction() {
  const mainPath = path.resolve(import.meta.dirname, '../dist/main/index.js');
  const rendererPath = path.resolve(import.meta.dirname, '../dist/renderer/index.html');
  const preloadPath = path.resolve(import.meta.dirname, '../dist/preload/index.cjs');

  if (!fs.existsSync(mainPath) || !fs.existsSync(rendererPath) || !fs.existsSync(preloadPath)) {
    console.log('[Knot Start] Build artifacts missing. Running npm run build first...');
    execSync('npm run build', { stdio: 'inherit' });
  }

  console.log('[Knot Start] Launching Knot desktop application...');
  const proc = spawn(electronPath, ['.'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  });

  proc.on('close', (code) => {
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    if (!proc.killed) proc.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    if (!proc.killed) proc.kill('SIGTERM');
  });
}

startProduction();
