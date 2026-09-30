/** Indica si este entorno puede abrir el navegador de inicio de sesión. */
export function canOpenBrowser({ platform = process.platform, env = process.env } = {}) {
  const ssh = Boolean(env.SSH_CONNECTION || env.SSH_TTY);
  if (platform === 'win32') return { ok: true, reason: null };
  if (platform === 'darwin') {
    return ssh ? { ok: false, reason: 'sesión SSH' } : { ok: true, reason: null };
  }
  if (env.WSL_DISTRO_NAME) return { ok: true, reason: null };
  if (ssh) return { ok: false, reason: 'sesión SSH' };
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return { ok: false, reason: 'sin entorno gráfico' };
  return { ok: true, reason: null };
}
