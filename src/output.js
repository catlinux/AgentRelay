/** Salida común de la CLI para respetar los modos quiet y verbose. */
export function createOutput({ quiet = false, verbose = false, stdout = process.stdout, stderr = process.stderr } = {}) {
  if (quiet && verbose) throw new Error('--quiet y --verbose no se pueden usar a la vez');
  const write = (stream, text) => stream.write(`${text}\n`);
  return {
    quiet,
    verbose,
    info(text) { if (!quiet) write(stdout, text); },
    detail(text) { if (verbose) write(stdout, text); },
    result(text) { write(stdout, text); },
    warn(text) { write(stderr, `[aviso] ${text}`); },
    error(text) { write(stderr, text); },
  };
}
