#!/usr/bin/env node
/**
 * Levanta/baja el back REAL para los e2e del front. Solo EJECUTA el back (no lo modifica).
 *
 *   npm run e2e:stack -- up     # db-test (compose "okr-e2e-front") + migrate deploy + seed + API ts-node :3000
 *   npm run e2e:stack -- down   # frena la API y hace `compose down -v`
 *   npm run e2e:stack -- run    # up + `playwright test` (args extra se pasan) + down (siempre)
 *
 * IA: además levanta `e2e/helpers/agent-stub.mjs` (agente de mentira, contrato v1, :AGENT_PORT) y le pasa a la
 * API AI_ENABLED=true + AGENT_URL + secreto compartido. El back habla HTTP+HMAC con el stub, no con NVIDIA.
 *
 * Nunca usa `nest start`/`build`: la API corre con ts-node para no tocar `dist/`.
 * Variables: E2E_BACK_DIR (default ../okr-platform-back), DB_TEST_PORT (default 55434), API_PORT (3000),
 * AGENT_PORT (8089, agente stub de IA).
 * Las credenciales del admin salen de e2e/helpers/admin.json (única fuente de verdad, la usan los specs).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUB_DEFAULTS } from '../e2e/helpers/agent-stub.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACK_ROOT = resolve(ROOT, process.env.E2E_BACK_DIR ?? '../okr-platform-back');
const BACK_APP = resolve(BACK_ROOT, 'okr-platform');
const PROJECT = 'okr-e2e-front';
const DB_PORT = process.env.DB_TEST_PORT ?? '55434';
const API_PORT = process.env.API_PORT ?? '3000';
const PID_FILE = resolve(ROOT, '.e2e-api.pid');
const AGENT_PID_FILE = resolve(ROOT, '.e2e-agent.pid');
const AGENT_PORT = process.env.AGENT_PORT ?? String(STUB_DEFAULTS.port);
const admin = JSON.parse(readFileSync(resolve(ROOT, 'e2e/helpers/admin.json'), 'utf8'));

const backEnv = {
  ...process.env,
  DB_TEST_PORT: DB_PORT,
  DATABASE_URL: `postgresql://postgres:postgres@localhost:${DB_PORT}/okr-platform-test?schema=public`,
  PORT: API_PORT,
  FRONT_ORIGIN: 'http://localhost:3001',
  JWT_ACCESS_SECRET: 'test-secret-solo-para-e2e-0123456789abcdef',
  LOGIN_THROTTLE_LIMIT: '1000',
  SEED_ADMIN_EMAIL: admin.email,
  SEED_ADMIN_PASSWORD: admin.password,
  SEED_ADMIN_NAME: admin.name,
  AI_ENABLED: 'true',
  AGENT_URL: `http://127.0.0.1:${AGENT_PORT}`,
  AGENT_SHARED_SECRET: STUB_DEFAULTS.secret,
  AGENT_TIMEOUT_MS: '5000',
  AI_THROTTLE_LIMIT: '1000',
  ASSISTANT_ENABLED: 'true',
  ASSISTANT_AGENT_TIMEOUT_MS: '30000',
};

const shell = process.platform === 'win32';
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell, ...opts });
  if (r.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(' ')} (código ${r.status})`);
}
const compose = (...args) =>
  run('docker', ['compose', '-p', PROJECT, ...args], { cwd: BACK_ROOT, env: backEnv });

async function waitFor(url, label, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout esperando ${label} (${url})`);
}

function waitDb() {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      'docker',
      ['compose', '-p', PROJECT, 'exec', '-T', 'db-test', 'pg_isready', '-U', 'postgres'],
      { cwd: BACK_ROOT, env: backEnv, shell },
    );
    if (r.status === 0) return;
    spawnSync(
      process.platform === 'win32' ? 'ping' : 'sleep',
      process.platform === 'win32' ? ['-n', '2', '127.0.0.1'] : ['1'],
      { stdio: 'ignore' },
    );
  }
  throw new Error('La base e2e no quedó lista.');
}

async function up() {
  // Una API vieja en el puerto haría que los tests corran contra otra base sin avisar.
  const busy = await fetch(`http://localhost:${API_PORT}/health`).then(
    () => true,
    () => false,
  );
  if (busy)
    throw new Error(
      `Ya hay algo escuchando en :${API_PORT}. Frená esa API antes de levantar el stack e2e.`,
    );
  if (!existsSync(BACK_APP)) throw new Error(`No encuentro el back en ${BACK_APP}`);
  compose('up', '-d', 'db-test');
  waitDb();
  run('npx', ['prisma', 'migrate', 'deploy'], { cwd: BACK_APP, env: backEnv });
  run('npx', ['prisma', 'db', 'seed'], { cwd: BACK_APP, env: backEnv });
  // Agente de IA de mentira (antes de la API: el back solo lo llama bajo demanda, pero así ya está listo).
  const agent = spawn(
    process.execPath,
    [
      resolve(ROOT, 'e2e/helpers/agent-stub.mjs'),
      '--port',
      AGENT_PORT,
      '--fixtures',
      resolve(BACK_APP, 'test/fixtures/agent'),
    ],
    { env: process.env, stdio: 'ignore', windowsHide: true },
  );
  agent.unref();
  writeFileSync(AGENT_PID_FILE, String(agent.pid));
  await waitFor(`http://127.0.0.1:${AGENT_PORT}/health`, 'el agente stub');
  // node + bin de ts-node directo (sin npx/shell): el PID guardado es el del proceso real y se baja de verdad.
  const tsNode = resolve(BACK_APP, 'node_modules/ts-node/dist/bin.js');
  const api = spawn(process.execPath, [tsNode, '-r', 'tsconfig-paths/register', 'src/main.ts'], {
    cwd: BACK_APP,
    env: backEnv,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true,
  });
  api.unref();
  writeFileSync(PID_FILE, String(api.pid));
  await waitFor(`http://localhost:${API_PORT}/health`, 'la API');
  console.log(
    `Stack e2e listo: API :${API_PORT}, db :${DB_PORT}, agente stub :${AGENT_PORT}, admin ${admin.email}`,
  );
}

function killPidFile(file) {
  if (!existsSync(file)) return;
  const pid = readFileSync(file, 'utf8').trim();
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-Number(pid));
    } catch {
      try {
        process.kill(Number(pid));
      } catch {}
    }
  }
  rmSync(file, { force: true });
}

function stopApi() {
  killPidFile(PID_FILE);
  killPidFile(AGENT_PID_FILE);
}

function down() {
  stopApi();
  compose('down', '-v');
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'up') await up();
  else if (command === 'down') down();
  else if (command === 'run') {
    let code = 1;
    try {
      await up();
      code =
        spawnSync('npx', ['playwright', 'test', ...rest], { stdio: 'inherit', shell, cwd: ROOT })
          .status ?? 1;
    } finally {
      down();
    }
    process.exit(code);
  } else {
    console.error('Uso: npm run e2e:stack -- up | down | run [args de playwright]');
    process.exit(2);
  }
} catch (error) {
  console.error(error.message);
  if (command === 'up') down();
  process.exit(1);
}
