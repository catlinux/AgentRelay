// Ayuda detallada de los comandos de AgentRelay.

const COMMANDS = {
  use: {
    summary: 'Cambia el ejecutor, el modelo y el esfuerzo de razonamiento.',
    usage: ['agentrelay use [ejecutor] [modelo] [esfuerzo]', 'agentrelay use <perfil>', 'agentrelay use --save <nombre>', 'agentrelay use --list'],
    description: 'Configura qué ejecutor usará AgentRelay y con qué modelo y esfuerzo. Puedes hacer el cambio de forma interactiva, indicar los valores en la línea de comandos o aplicar y guardar perfiles.',
    options: [
      ['--save <nombre>', 'Guarda la configuración actual como perfil.'],
      ['--list', 'Lista los ejecutores instalados y sus modelos disponibles.'],
      ['--all', 'Con --list, muestra todos los modelos de OpenCode, no solo los del ranquing de hoy.'],
      ['--local, --project', 'Guarda el cambio en la configuración de este proyecto.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay use', 'Muestra el estado actual o inicia el selector interactivo.'],
      ['agentrelay use codex gpt-5.5 alto', 'Selecciona Codex, el modelo indicado y esfuerzo alto.'],
      ['agentrelay use barato', 'Aplica el perfil guardado llamado barato.'],
      ['agentrelay use --save barato', 'Guarda la selección actual como perfil barato.'],
      ['agentrelay use --list', 'Lista ejecutores y modelos.'],
      ['agentrelay use --list --all', 'Muestra todos los modelos de OpenCode.'],
    ],
  },
  run: {
    summary: 'Delega una tarea a un agente ejecutor.',
    usage: ['agentrelay run <tarea.json | ->'],
    description: 'Lee una tarea JSON de un archivo o de la entrada estándar si indicas -. La tarea puede incluir los campos opcionales effort y model para fijar el esfuerzo y el modelo de esa ejecución. En Windows, guarda el JSON en un archivo temporal fuera del repositorio y pasa su ruta.',
    options: [
      ['--self-review <modo>', 'Fuerza el modo de revisión propia de la tarea.'],
      ['--allow-dirty', 'Permite delegar aunque haya cambios sin confirmar.'],
      ['--cwd <dir>', 'Indica el repositorio de trabajo.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
      ['--json', 'Imprime el resultado en JSON.'],
      ['-q, --quiet', 'Muestra solo errores, avisos y resultados esenciales.'],
      ['-v, --verbose', 'Añade detalles para diagnosticar problemas.'],
    ],
    examples: [
      ['agentrelay run tarea.json', 'Delega la tarea descrita en tarea.json.'],
      ['agentrelay run -', 'Lee el JSON de la tarea desde la entrada estándar.'],
      ['agentrelay run tarea.json --allow-dirty', 'Delega aunque el repositorio tenga cambios sin confirmar.'],
    ],
  },
  show: {
    summary: 'Muestra el informe de una ejecución.',
    usage: ['agentrelay show [id]'],
    description: 'Muestra el informe de la ejecución indicada. Si omites el id, muestra la ejecución más reciente del repositorio.',
    options: [
      ['--json', 'Imprime el resultado en JSON.'],
      ['-q, --quiet', 'Muestra solo el id, el estado y la ruta del informe.'],
      ['-v, --verbose', 'Añade detalles para diagnosticar problemas.'],
      ['--cwd <dir>', 'Indica el repositorio de trabajo.'],
    ],
    examples: [
      ['agentrelay show', 'Muestra el informe de la última ejecución.'],
      ['agentrelay show 20261004-132748-bb5a', 'Muestra el informe de esa ejecución.'],
    ],
  },
  review: {
    summary: 'Registra la decisión del orquestador sobre una ejecución.',
    usage: ['agentrelay review <id> --decision <accept|fix|escalate|reject> [--feedback <texto>]'],
    description: 'Registra si aceptas el resultado, pides una corrección, escalas la tarea o la rechazas. Para pedir una corrección, incluye feedback con los problemas concretos.',
    options: [
      ['--decision <decisión>', 'Decisión requerida: accept, fix, escalate o reject.'],
      ['--feedback <texto>', 'Describe los problemas; es obligatorio con fix.'],
      ['--feedback-file <ruta>', 'Lee el feedback desde un archivo.'],
      ['--force', 'Acepta sin superar la validación final o corrige por encima del límite.'],
      ['--json', 'Imprime el resultado en JSON.'],
      ['-q, --quiet', 'Muestra solo errores, avisos y resultados esenciales.'],
      ['-v, --verbose', 'Añade detalles para diagnosticar problemas.'],
      ['--cwd <dir>', 'Indica el repositorio de trabajo.'],
    ],
    examples: [
      ['agentrelay review <id> --decision accept', 'Acepta el resultado de la ejecución.'],
      ['agentrelay review <id> --decision fix --feedback "Falta cubrir el caso vacío"', 'Solicita una corrección con feedback.'],
    ],
  },
  check: {
    summary: 'Repite las validaciones de una ejecución.',
    usage: ['agentrelay check [id]'],
    description: 'Vuelve a ejecutar las validaciones configuradas para la ejecución indicada. Si omites el id, usa la ejecución más reciente.',
    options: [
      ['--json', 'Imprime el resultado en JSON.'],
      ['-q, --quiet', 'Muestra solo el id, el estado y la ruta del informe.'],
      ['-v, --verbose', 'Añade detalles para diagnosticar problemas.'],
      ['--cwd <dir>', 'Indica el repositorio de trabajo.'],
    ],
    examples: [['agentrelay check', 'Repite las validaciones de la última ejecución.']],
  },
  list: {
    summary: 'Lista las ejecuciones del repositorio.',
    usage: ['agentrelay list'],
    description: 'Muestra el id, el estado, el número de intentos y el título de cada ejecución del repositorio actual.',
    options: [
      ['--json', 'Imprime la lista en JSON.'],
      ['--cwd <dir>', 'Indica el repositorio de trabajo.'],
    ],
    examples: [['agentrelay list', 'Lista las ejecuciones del repositorio actual.']],
  },
  status: {
    summary: 'Resume el estado del proyecto.',
    usage: ['agentrelay status [--write] [--json]'],
    description: 'Resume la configuración y el estado de AgentRelay en el proyecto. La opción write guarda o actualiza el resumen de estado del proyecto.',
    options: [
      ['--write', 'Escribe o actualiza el resumen de estado del proyecto.'],
      ['--json', 'Imprime el estado en JSON.'],
      ['--cwd <dir>', 'Indica el directorio del proyecto.'],
    ],
    examples: [
      ['agentrelay status', 'Muestra el estado del proyecto.'],
      ['agentrelay status --write', 'Actualiza el archivo de estado y muestra el resumen.'],
    ],
  },
  start: {
    summary: 'Prepara el proyecto para trabajar con AgentRelay.',
    usage: ['agentrelay start [--yes] [--with-config] [--fix]'],
    description: 'Prepara el repositorio, comprueba el entorno y muestra el estado y los siguientes pasos. Si hay cambios pendientes, puede pedir confirmación para crear un commit inicial.',
    options: [
      ['--yes', 'Aplica las acciones que normalmente requieren confirmación.'],
      ['--with-config', 'Crea además agentrelay.config.json.'],
      ['--fix', 'Pide aplicar los arreglos seguros que encuentre doctor.'],
      ['--cwd <dir>', 'Indica el directorio del proyecto.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay start', 'Prepara el proyecto y muestra los siguientes pasos.'],
      ['agentrelay start --yes', 'Prepara el proyecto aceptando las confirmaciones necesarias.'],
    ],
  },
  recover: {
    summary: 'Recupera ejecuciones interrumpidas.',
    usage: ['agentrelay recover [id]'],
    description: 'Sin id, lista las ejecuciones que parecen interrumpidas. Con un id, marca como interrumpida una ejecución cuyo proceso ya no está activo y reconstruye su informe.',
    options: [['--cwd <dir>', 'Indica el repositorio de trabajo.']],
    examples: [
      ['agentrelay recover', 'Lista las ejecuciones interrumpidas.'],
      ['agentrelay recover <id>', 'Recupera la ejecución indicada si su proceso terminó.'],
    ],
  },
  watch: {
    summary: 'Sigue en directo los eventos de las ejecuciones.',
    usage: ['agentrelay watch [id]'],
    description: 'Muestra los eventos nuevos de la ejecución indicada. Sin id, sigue las ejecuciones nuevas.',
    options: [['--cwd <dir>', 'Indica el repositorio de trabajo.']],
    examples: [
      ['agentrelay watch', 'Sigue en directo las ejecuciones nuevas.'],
      ['agentrelay watch <id>', 'Sigue en directo una ejecución concreta.'],
    ],
  },
  doctor: {
    summary: 'Comprueba el entorno y puede aplicar arreglos seguros.',
    usage: ['agentrelay doctor [--fix]'],
    description: 'Comprueba Node.js, Git, el repositorio, la configuración y el ejecutor. Con fix, pregunta antes de aplicar los arreglos seguros disponibles; yes evita la pregunta.',
    options: [
      ['--fix', 'Pregunta antes de aplicar arreglos seguros.'],
      ['--yes', 'Con --fix, aplica los arreglos sin preguntar.'],
      ['--cwd <dir>', 'Indica el directorio que se comprobará.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
      ['-q, --quiet', 'Reduce la salida a errores y avisos.'],
      ['-v, --verbose', 'Añade detalles para diagnosticar problemas.'],
    ],
    examples: [
      ['agentrelay doctor', 'Comprueba el entorno.'],
      ['agentrelay doctor --fix', 'Comprueba el entorno y pregunta antes de arreglar problemas seguros.'],
    ],
  },
  config: {
    summary: 'Muestra, localiza, crea o migra la configuración.',
    usage: ['agentrelay config [show|path|init|migrate [--dry-run]]'],
    description: 'Muestra la configuración efectiva por defecto, enseña las rutas de configuración, crea un archivo inicial o migra archivos de configuración antiguos. init escribe la configuración de usuario salvo que indiques project o local.',
    options: [
      ['--project', 'Con init, crea la configuración en el proyecto.'],
      ['--local', 'Alias obsoleto de project.'],
      ['--force', 'Con init, sobrescribe el archivo de configuración existente.'],
      ['--dry-run', 'Con migrate, informa de la migración sin aplicarla.'],
      ['--cwd <dir>', 'Indica el directorio del proyecto.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo al mostrarla.'],
    ],
    examples: [
      ['agentrelay config', 'Muestra la configuración efectiva.'],
      ['agentrelay config path', 'Muestra las rutas de configuración de usuario y proyecto.'],
      ['agentrelay config init --project', 'Crea un archivo de configuración en el proyecto.'],
      ['agentrelay config migrate --dry-run', 'Muestra qué migraría sin cambiar archivos.'],
    ],
  },
  login: {
    summary: 'Conecta una cuenta del ejecutor configurado o de OpenCode.',
    usage: ['agentrelay login [opencode] [--device]'],
    description: 'Sin argumento, inicia sesión con Codex usando el navegador o el código de dispositivo. Con opencode, abre el asistente de autenticación de OpenCode.',
    options: [
      ['--device', 'Usa el código de dispositivo.'],
      ['--browser', 'Fuerza el inicio de sesión con navegador.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay login', 'Inicia sesión con el método disponible.'],
      ['agentrelay login opencode', 'Abre el asistente para conectar una cuenta de OpenCode.'],
      ['agentrelay login --device', 'Inicia sesión usando el código de dispositivo.'],
    ],
  },
  setup: {
    summary: 'Instala las instrucciones globales y los comandos de Claude Code.',
    usage: ['agentrelay setup [opciones]'],
    description: 'Añade las instrucciones globales de AgentRelay a Claude Code y, por defecto, instala comandos y el hook de delegación. También puede retirar la instalación o instalar ejecutores opcionales.',
    options: [
      ['--uninstall', 'Retira las instrucciones, comandos y hook de Claude Code.'],
      ['--no-commands', 'No instala los comandos de Claude Code.'],
      ['--no-hook', 'No instala el hook de delegación de Claude Code.'],
      ['--yes', 'Aplica sin pedir confirmación.'],
      ['--login', 'Conecta la cuenta de ChatGPT sin preguntar.'],
      ['--executors <lista>', 'Instala ejecutores opcionales separados por comas.'],
      ['--claude-dir <dir>', 'Indica el directorio .claude; por defecto, ~/.claude.'],
      ['--cwd <dir>', 'Indica el directorio del proyecto al cargar la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay setup', 'Instala las instrucciones y la integración predeterminada de Claude Code.'],
      ['agentrelay setup --no-hook', 'Instala sin añadir el hook de delegación.'],
      ['agentrelay setup --uninstall --yes', 'Retira la integración sin pedir confirmación.'],
    ],
  },
  update: {
    summary: 'Actualiza AgentRelay desde su repositorio de instalación.',
    usage: ['agentrelay update [--check] [--yes]'],
    description: 'Comprueba si hay cambios disponibles y, si se confirma, actualiza el repositorio de instalación, instala dependencias y ejecuta setup y doctor. check solo muestra los cambios disponibles; yes aplica la actualización sin preguntar.',
    options: [
      ['--check', 'Muestra los cambios disponibles sin instalarlos.'],
      ['--yes', 'Aplica la actualización sin pedir confirmación.'],
    ],
    examples: [
      ['agentrelay update --check', 'Comprueba si hay una actualización disponible.'],
      ['agentrelay update --yes', 'Aplica la actualización sin pedir confirmación.'],
    ],
  },
  init: {
    summary: 'Prepara las instrucciones del proyecto y el repositorio git.',
    usage: ['agentrelay init [--yes] [--with-config]'],
    description: 'Prepara el directorio actual o el repositorio existente con las instrucciones de AgentRelay. Si no hay repositorio, inicializa Git y crea un commit inicial; con with-config también crea la configuración del proyecto.',
    options: [
      ['--yes', 'Aplica sin pedir confirmación.'],
      ['--with-config', 'Crea además agentrelay.config.json.'],
      ['--cwd <dir>', 'Indica el directorio que se preparará.'],
    ],
    examples: [
      ['agentrelay init', 'Prepara el directorio actual.'],
      ['agentrelay init --yes --with-config', 'Prepara el directorio y crea también la configuración.'],
    ],
  },
  executors: {
    summary: 'Instala ejecutores y revisa modelos gratuitos.',
    usage: ['agentrelay executors', 'agentrelay executors add <nombre>', 'agentrelay executors check [--force]'],
    description: 'Muestra cómo gestionar ejecutores, instala un ejecutor opcional o actualiza el ranquing de modelos gratuitos de OpenCode y el informe diario. La comprobación diaria se ejecuta como máximo una vez al día salvo que indiques force.',
    options: [
      ['add <nombre>', 'Instala el ejecutor opcional indicado.'],
      ['check [--force]', 'Actualiza el ranquing de modelos gratuitos de OpenCode y el informe diario; force repite la comprobación del día.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay executors', 'Muestra cómo ver o cambiar el ejecutor.'],
      ['agentrelay executors add opencode', 'Instala OpenCode como ejecutor opcional.'],
      ['agentrelay executors check --force', 'Repite la revisión diaria de modelos gratuitos.'],
    ],
  },
  rank: {
    summary: 'Muestra o calcula el ranquing de modelos gratuitos de OpenCode.',
    usage: ['agentrelay rank [--run] [--detach] [--max <N>] [--json]'],
    description: 'Sin opciones muestra el último ranquing guardado, o indica cómo calcularlo si aún no existe. Usa run para probar ahora los modelos gratuitos y guardar el resultado; detach inicia ese cálculo en segundo plano.',
    options: [
      ['--run', 'Calcula y guarda ahora el ranquing.'],
      ['--detach', 'Calcula el ranquing en segundo plano y vuelve enseguida.'],
      ['--max <N>', 'Limita el número de modelos probados.'],
      ['--json', 'Imprime el ranquing en JSON.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay rank', 'Muestra el último ranquing guardado.'],
      ['agentrelay rank --run', 'Calcula y guarda el ranquing ahora.'],
      ['agentrelay rank --run --max 4', 'Prueba como máximo cuatro modelos.'],
      ['agentrelay rank --detach', 'Inicia el cálculo en segundo plano.'],
    ],
  },
  set: {
    summary: 'Cambia un ajuste de configuración.',
    usage: ['agentrelay set <clave> <valor> [--local|--project]'],
    description: 'Cambia un ajuste conocido de AgentRelay en la configuración de usuario. Con local o project, guarda el ajuste en la configuración del proyecto.',
    options: [
      ['--local, --project', 'Guarda el ajuste en la configuración del proyecto.'],
      ['--cwd <dir>', 'Indica el directorio del proyecto.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo al calcular el valor efectivo.'],
    ],
    examples: [
      ['agentrelay set timeout 1800', 'Cambia el ajuste timeout a 1800.'],
      ['agentrelay set executor.type codex --local', 'Cambia el ejecutor solo para este proyecto.'],
    ],
  },
  unset: {
    summary: 'Restablece un ajuste de configuración.',
    usage: ['agentrelay unset <clave> [--local|--project]'],
    description: 'Elimina el valor guardado para un ajuste conocido para que vuelva a aplicarse el valor efectivo de las demás fuentes de configuración. Con local o project, modifica la configuración del proyecto.',
    options: [
      ['--local, --project', 'Restablece el ajuste en la configuración del proyecto.'],
      ['--cwd <dir>', 'Indica el directorio del proyecto.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo al calcular el valor efectivo.'],
    ],
    examples: [
      ['agentrelay unset executor.model', 'Restablece el modelo guardado en la configuración de usuario.'],
      ['agentrelay unset executor.model --local', 'Restablece el modelo guardado en la configuración del proyecto.'],
    ],
  },
  help: {
    summary: 'Muestra la ayuda general o la ayuda detallada de un comando.',
    usage: ['agentrelay help [comando]', 'agentrelay <comando> --help'],
    description: 'Muestra la lista de comandos disponibles o, si indicas uno, su descripción, uso, opciones y ejemplos. La ayuda funciona desde cualquier directorio.',
    options: [],
    examples: [
      ['agentrelay help', 'Muestra la ayuda general y cómo consultar la ayuda detallada.'],
      ['agentrelay help use', 'Muestra la ayuda detallada de use.'],
      ['agentrelay run --help', 'Muestra la ayuda detallada de run.'],
    ],
  },
};

export function commandNames() {
  return Object.keys(COMMANDS);
}

export function renderCommandHelp(name) {
  const command = COMMANDS[name];
  if (!command) return null;
  const options = [
    ...command.options,
    ['-h, --help', 'Muestra la ayuda de este comando.'],
  ];
  return [
    `agentrelay ${name}: ${command.summary}`,
    '',
    'Uso:',
    ...command.usage.map((line) => `  ${line}`),
    '',
    'Descripción:',
    `  ${command.description}`,
    '',
    'Opciones:',
    ...options.map(([option, description]) => `  ${option.padEnd(28)} ${description}`),
    '',
    'Ejemplos:',
    ...command.examples.flatMap(([example, description]) => [`  ${example}`, `    ${description}`]),
    '',
  ].join('\n');
}

export function renderHelpIndex() {
  const lines = ['Comandos de AgentRelay:', ''];
  for (const [name, command] of Object.entries(COMMANDS)) {
    lines.push(`  agentrelay ${name.padEnd(10)} ${command.summary}`);
  }
  lines.push('', 'Ayuda de un comando: agentrelay help <comando>', '');
  return lines.join('\n');
}
