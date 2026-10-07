import { DEFAULT_CONFIG } from './config.js';
import { POLICY } from './policy.js';

const value = (item) => JSON.stringify(item);

// Divide un texto en líneas de comentario de como máximo `width` caracteres.
function wrap(text, prefix, width = 92) {
  const lines = [];
  let current = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (current && `${prefix}${current} ${word}`.length > width) {
      lines.push(`${prefix}${current}`);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(`${prefix}${current}`);
  return lines;
}

// Una opción: explicación, valores válidos, valor por defecto y consejo en
// líneas separadas, seguidas de la opción comentada con su valor por defecto.
const option = (key, current, explanation, valid, tip, indent = '') => [
  '',
  ...wrap(explanation, `${indent}// `),
  ...wrap(`Valores válidos: ${valid}.`, `${indent}//   `),
  `${indent}//   Por defecto: ${value(current)}.`,
  ...wrap(`Consejo: ${tip}`, `${indent}//   `),
  `${indent}// "${key}": ${value(current)},`,
];

export function configTemplate({ scope } = {}) {
  const user = scope === 'user';
  const lines = [
    user
      ? '// Configuración personal de AgentRelay. Ubicación global: ~/.agentrelay/config.json (o AGENTRELAY_HOME/config.json).'
      : '// Configuración específica del proyecto. Los valores comentados conservan sus valores predeterminados.',
    ...(user ? ['// Para ajustes del proyecto, usa agentrelay.config.json; contiene preferencias personales y nunca debe confirmarse en git.'] : []),
    '// Todo lo que está comentado (//) conserva su valor por defecto: descomenta solo lo que quieras cambiar.',
    '{',
  ];

  if (user) {
    lines.push('', '  // ── Ejecutor: el agente que hace el trabajo ──');
    lines.push('  // codex (por defecto) usa tu cuenta de ChatGPT: conéctala una vez con "agentrelay login".');
    lines.push('  // cline se instala con "agentrelay executors add cline" y usa el proveedor que configures.');
    lines.push('  // "executor": {');
    lines.push(...option('apiFallback', DEFAULT_CONFIG.executor.apiFallback, 'Permite usar el perfil de API de pago si se agota la cuota gratuita de ChatGPT.', 'booleano', 'desactívalo con agentrelay set executor.apiFallback false si no quieres este respaldo.', '    '));
    lines.push(...option('type', DEFAULT_CONFIG.executor.type, 'Tipo de ejecutor: codex usa la cuenta ChatGPT; cline permite configurar proveedor y modelo.', 'codex o cline', 'usa codex para iniciar sesión con agentrelay login.', '    '));
    lines.push(...option('command', DEFAULT_CONFIG.executor.command, 'Comando ejecutable del proveedor seleccionado.', 'texto o lista de textos', 'usa una lista cuando el ejecutable requiera argumentos.', '    '));
    lines.push(...option('provider', DEFAULT_CONFIG.executor.provider, 'Proveedor del modelo, principalmente para Cline.', 'texto o null', 'elige el proveedor configurado en Cline.', '    '));
    lines.push(...option('model', DEFAULT_CONFIG.executor.model, 'Identificador del modelo; Codex usa gpt-6-luna por defecto.', 'texto o null', 'ajústalo solo si quieres otro modelo disponible.', '    '));
    lines.push(...option('thinking', DEFAULT_CONFIG.executor.thinking, 'Esfuerzo de razonamiento enviado al ejecutor.', 'null, low, medium, high, xhigh o max; none (Cline; Codex lo ignora)', 'bajo = low, medio = medium, alto = high, extremo = xhigh; max es el máximo. null conserva el esfuerzo predeterminado del ejecutor. Usa low en tareas sencillas y high en tareas difíciles.', '    '));
    lines.push(...option('timeoutSeconds', DEFAULT_CONFIG.executor.timeoutSeconds, 'Tiempo máximo de ejecución del agente, en segundos.', 'número positivo', 'auméntalo para tareas largas.', '    '));
    lines.push(...option('network', DEFAULT_CONFIG.executor.network, 'Permite al ejecutor Codex acceder a internet desde su sandbox (consultar páginas y APIs).', 'booleano', 'desactívalo con agentrelay set executor.network false si no quieres que el ejecutor use la red. Cline no tiene sandbox y no lo necesita.', '    '));
    lines.push(...option('extraArgs', DEFAULT_CONFIG.executor.extraArgs, 'Argumentos adicionales enviados al comando del ejecutor.', 'lista de textos', 'añade solo opciones que admita el ejecutor.', '    '));
    lines.push('  // },');
  }

  lines.push('', '  // ── Política ──');
  if (!user) {
    const defaults = POLICY;
    lines.push('  // Política específica del proyecto; cada valor sustituye el de la política por defecto.');
    lines.push('  // "policy": {');
    lines.push(...option('review', defaults.review, 'Cuándo debe intervenir el orquestador.', 'on-failure, selective o always', 'usa selective para revisar ante señales de riesgo.', '    '));
    lines.push(...option('maxRetries', defaults.maxRetries, 'Número máximo de reintentos automáticos.', 'entero mayor o igual que 0', 'reduce el valor si quieres limitar ejecuciones.', '    '));
    lines.push(...option('autoFix', defaults.autoFix, 'Indica si AgentRelay corrige automáticamente fallos de validación.', 'booleano', 'desactívalo si prefieres revisar cada fallo manualmente.', '    '));
    lines.push(...option('requireValidation', defaults.requireValidation, 'Indica si se deben exigir validaciones objetivas.', 'booleano', 'actívalo en proyectos con pruebas automatizadas.', '    '));
    lines.push('  // Self-review usa claves trivial, normal y complex, con valores none, inline o pass.');
    lines.push('  // "selfReview": {');
    for (const complexity of ['trivial', 'normal', 'complex']) lines.push(...option(complexity, defaults.selfReview[complexity], `Modo de self-review para tareas ${complexity}.`, 'none, inline o pass', 'usa pass cuando quieras una segunda pasada de revisión.', '      '));
    lines.push('  // },');
    lines.push(...option('skipPassMaxFiles', defaults.skipPassMaxFiles, 'Máximo de archivos para omitir una pasada redundante si las validaciones pasan.', 'entero mayor o igual que 0', 'sube el umbral para evitar pasadas en cambios pequeños.', '    '));
    lines.push('  // },');
  }

  lines.push('', '  // ── Validaciones ──');
  if (user) {
    lines.push('  // "validation": {');
    lines.push(...option('timeoutSeconds', DEFAULT_CONFIG.validation.timeoutSeconds, 'Tiempo máximo de las validaciones, en segundos.', 'número positivo', 'auméntalo si las pruebas suelen tardar.', '    '));
    lines.push('  // },');
  } else {
    lines.push('  // "validation": {');
    lines.push(...option('commands', DEFAULT_CONFIG.validation.commands, 'Comandos ejecutados en todas las tareas del proyecto.', 'lista de textos', 'incluye aquí las pruebas estándar del repositorio.', '    '));
    lines.push(...option('timeoutSeconds', DEFAULT_CONFIG.validation.timeoutSeconds, 'Tiempo máximo de las validaciones, en segundos.', 'número positivo', 'auméntalo si las pruebas suelen tardar.', '    '));
    lines.push('  // },');
    lines.push('', '  // ── Informes ──');
    lines.push('  // "report": {');
    lines.push(...option('maxDiffChars', DEFAULT_CONFIG.report.maxDiffChars, 'Límite de caracteres del diff incluido en el informe.', 'entero positivo', 'auméntalo si los informes omiten cambios grandes.', '    '));
    lines.push(...option('maxOutputChars', DEFAULT_CONFIG.report.maxOutputChars, 'Límite de caracteres de salida incluidos en el informe.', 'entero positivo', 'auméntalo si los logs útiles quedan truncados.', '    '));
    lines.push('  // },');
  }
  lines.push('}', '');
  return lines.join('\n');
}
