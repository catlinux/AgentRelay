// Ejecución de procesos externos.
// Es la única capa que conoce las diferencias entre Windows y Linux/macOS.

import { spawn } from 'node:child_process';

export const IS_WINDOWS = process.platform === 'win32';

// Caracteres que cmd.exe interpreta aunque estén entre comillas.
const UNSAFE_WINDOWS_ARG = /["%^&|<>!\r\n]/;

/**
 * Cita un argumento para la línea de comandos de cmd.exe.
 * Solo acepta argumentos sin metacaracteres: preferimos fallar a arriesgarnos
 * a una inyección de comandos.
 */
export function quoteWindowsArg(arg) {
  const value = String(arg);
  if (UNSAFE_WINDOWS_ARG.test(value)) {
    throw new Error(`Argumento no admitido en Windows (contiene metacaracteres de cmd): ${value}`);
  }
  return /[\s()]/.test(value) || value === '' ? `"${value}"` : value;
}

/**
 * Ejecuta un programa con argumentos.
 * En Windows se usa cmd.exe para poder lanzar shims de npm (.cmd), con los
 * argumentos citados de forma segura; en el resto, spawn directo sin shell.
 * Con `windowsShell: false` también se lanza directamente en Windows
 * (solo para ejecutables reales, como git.exe).
 */
export function runProcess(command, args = [], options = {}) {
  const { windowsShell = true, ...rest } = options;
  options = rest;
  if (IS_WINDOWS && windowsShell) {
    const line = [command, ...args].map(quoteWindowsArg).join(' ');
    return spawnAndCollect(line, [], { ...options, shell: true });
  }
  return spawnAndCollect(command, args, { ...options, shell: false });
}

/** Ejecuta un proceso con la terminal conectada, sin capturar ni limitar su salida. */
export function runInteractive(command, args = [], { cwd, env } = {}) {
  installSignalHandlers();
  const windows = IS_WINDOWS;
  let executable = command;
  let argv = args;
  let shell = false;
  if (windows) {
    executable = [command, ...args].map(quoteWindowsArg).join(' ');
    argv = [];
    shell = true;
  }
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, argv, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        shell,
        windowsHide: true,
        stdio: 'inherit',
      });
    } catch (error) {
      resolve({ code: null, error });
      return;
    }
    activeChildren.add(child);
    child.once('error', (error) => {
      activeChildren.delete(child);
      resolve({ code: null, error });
    });
    child.once('close', (code) => {
      activeChildren.delete(child);
      resolve({ code, error: null });
    });
  });
}

/** Ejecuta una línea de comandos escrita por el usuario (validaciones). */
export function runShell(commandLine, options = {}) {
  return spawnAndCollect(commandLine, [], { ...options, shell: true });
}

// En Unix los hijos van en su propio grupo de procesos y no reciben el Ctrl+C
// del terminal: al interrumpir AgentRelay hay que terminarlos explícitamente.
const activeChildren = new Set();
let signalHandlersInstalled = false;

function installSignalHandlers() {
  if (signalHandlersInstalled || IS_WINDOWS) return;
  signalHandlersInstalled = true;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      for (const child of activeChildren) killTree(child);
      // Si otro código gestiona la señal (p. ej. watch), le dejamos terminar.
      if (process.listenerCount(signal) === 0) process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
}

function spawnAndCollect(command, args, { cwd, env, timeoutMs, shell, onStdout } = {}) {
  installSignalHandlers();
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        shell,
        windowsHide: true,
        // En Unix, un grupo de procesos propio permite terminar también a los hijos.
        detached: !IS_WINDOWS,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ code: null, stdout, stderr, timedOut, error, durationMs: 0 });
      return;
    }

    activeChildren.add(child);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      activeChildren.delete(child);
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, durationMs: Date.now() - started, ...result });
    };

    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          killTree(child);
        }, timeoutMs)
      : null;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; if (onStdout) onStdout(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish({ code: null, error }));
    child.on('close', (code) => finish({ code }));
  });
}

/** Termina un proceso y sus descendientes. */
export function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (IS_WINDOWS) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* el proceso ya no existe */ }
  }
}
