import { createServer, build } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import electronPath from 'electron';

async function startDev() {
  console.log('[Knot Dev] Building main process and preload script...');

  // Build main and preload for development
  await build({
    configFile: path.resolve(import.meta.dirname, '../vite.main.config.ts'),
    mode: 'development',
  });

  await build({
    configFile: path.resolve(import.meta.dirname, '../vite.preload.config.ts'),
    mode: 'development',
  });

  console.log('[Knot Dev] Starting Vite dev server for renderer...');

  const server = await createServer({
    configFile: path.resolve(import.meta.dirname, '../vite.config.ts'),
    server: {
      port: 5173,
    },
  });

  await server.listen();

  const protocol = server.config.server.https ? 'https' : 'http';
  const host = server.config.server.host || 'localhost';
  const port = server.config.server.port || 5173;
  const devServerUrl = `${protocol}://${host}:${port}`;

  console.log(`[Knot Dev] Vite dev server ready at ${devServerUrl}`);
  console.log('[Knot Dev] Launching Electron desktop window...');

  const electronProcess = spawn(electronPath, ['.'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: devServerUrl,
    },
    stdio: 'inherit',
  });

  const cleanup = async () => {
    try {
      if (!electronProcess.killed) {
        electronProcess.kill('SIGINT');
      }
      await server.close();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  electronProcess.on('close', async (code) => {
    console.log(`[Knot Dev] Electron exited with code ${code}`);
    await cleanup();
  });

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

startDev().catch((err) => {
  console.error('[Knot Dev] Startup failed:', err);
  process.exit(1);
});
