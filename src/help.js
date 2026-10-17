// Ayuda detallada de los comandos de AgentRelay.

const COMMANDS = {
  use: {
    summary: 'Cambia el ejecutor, el modelo y el esfuerzo de razonamiento.',
    usage: ['agentrelay use [ejecutor] [modelo] [esfuerzo]', 'agentrelay use <perfil>', 'agentrelay use --save <nombre>', 'agentrelay use --list'],
    description: 'Configura qué ejecutor usará AgentRelay y con qué modelo y esfuerzo. Puedes hacer el cambio de forma interactiva, indicar los valores en la línea de comandos o aplicar y guardar perfiles.',
    options: [
      ['--save <nombre>', 'Guarda la configuración actual como perfil.'],
      ['--list', 'Lista los ejecutores instalados y sus modelos disponibles.'],
      ['--all', 'Con --list, muestra todos los modelos de OpenCode, no solo los de freeOrder y paidOrder.'],
      ['--local, --project', 'Guarda el cambio en la configuración de este proyecto.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay use', 'Muestra el estado actual o inicia el selector interactivo.'],
      ['agentrelay use codex gpt-5.5 alto', 'Selecciona Codex, el modelo indicado y esfuerzo alto.'],
      ['agentrelay use barato', 'Aplica el perfil guardado llamado barato.'],
      ['agentrelay use --save barato', 'Guarda la selección actual como perfil barato.'],
      ['agentrelay use deepseek-flash-go', 'Atajo con nombre claro: luna-chatgpt, luna-go, deepseek-flash-go, deepseek-pro-go, deepseek-flash-api, deepseek-pro-api.'],
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
    summary: 'Conecta una cuenta del ejecutor o configura el respaldo por API de pago.',
    usage: ['agentrelay login [antigravity | gemini | opencode | --api [--remove]] [--device]'],
    description: 'Sin argumento, inicia sesión con Codex usando el navegador o el código de dispositivo. Con antigravity, abre Antigravity CLI (agy) para iniciar sesión con tu cuenta de Google: es la segunda IA gratuita del enrutado. Con gemini, abre Gemini CLI para iniciar sesión con tu cuenta de Google. Con opencode, abre el asistente de autenticación de OpenCode. Con --api, guarda una clave de OpenAI en un perfil separado que solo se usa si se agota la cuota gratuita de ChatGPT.',
    options: [
      ['--device', 'Usa el código de dispositivo.'],
      ['--browser', 'Fuerza el inicio de sesión con navegador.'],
      ['--api', 'Configura el respaldo por API leyendo la clave desde stdin o el terminal.'],
      ['--remove', 'Con --api, elimina el perfil de respaldo sin tocar la sesión de ChatGPT.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay login', 'Inicia sesión con el método disponible.'],
      ['agentrelay login antigravity', 'Conecta tu cuenta de Google en Antigravity (Gemini y Claude con cuota semanal gratuita).'],
      ['agentrelay login gemini', 'Conecta tu cuenta de Google en Gemini CLI (desde junio de 2026, solo con licencia de empresa).'],
      ['agentrelay login opencode', 'Abre el asistente para conectar una cuenta de OpenCode.'],
      ['agentrelay login --device', 'Inicia sesión usando el código de dispositivo.'],
      ['agentrelay login --api', 'Guarda una clave para usarla solo si se agota la cuota gratuita de ChatGPT.'],
      ['printenv OPENAI_API_KEY | agentrelay login --api', 'Lee la clave de API desde la entrada estándar sin mostrarla.'],
    ],
  },
  setup: {
    summary: 'Instala las instrucciones globales y los comandos de Claude Code.',
    usage: ['agentrelay setup [opciones]'],
    description: 'Añade las instrucciones globales de AgentRelay a Claude Code y, por defecto, instala comandos y el hook de delegación. Ofrece conectar la cuenta de ChatGPT. También puede retirar la instalación o instalar ejecutores opcionales.',
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
    summary: 'Instala ejecutores opcionales.',
    usage: ['agentrelay executors', 'agentrelay executors add <nombre>'],
    description: 'Instala un ejecutor opcional como OpenCode. Para ver o cambiar de ejecutor usa "agentrelay use".',
    options: [
      ['add <nombre>', 'Instala el ejecutor opcional indicado.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay executors', 'Muestra cómo ver o cambiar el ejecutor.'],
      ['agentrelay executors add opencode', 'Instala OpenCode como ejecutor opcional.'],
    ],
  },
  orden: {
    summary: 'Muestra o cambia el orden en que el enrutado automático prueba las IA.',
    usage: ['agentrelay orden', 'agentrelay orden gratis <modelo> [<modelo> …]', 'agentrelay orden pago <nombre> [<nombre> …]', 'agentrelay orden reset'],
    description: 'Con el enrutado automático cada tarea prueba primero Luna con la cuenta de ChatGPT (si hay cuota), después los gratuitos de OpenCode Go y por último las IA de pago. Sin argumentos muestra ese orden con el estado de cada una. gratis fija los gratuitos de OpenCode Go (nombres como cat-jam o longcat-2.5-preview). pago acepta nombres claros: luna-go, luna-api, deepseek-flash-go, deepseek-pro-go, deepseek-flash-api y deepseek-pro-api; la lista de pago queda exactamente con los nombres indicados, en ese orden (por defecto solo DeepSeek Flash de Go). Cada gratuita se prueba dos veces seguidas antes de saltar; la de pago hasta tres veces ante fallos pasajeros (con pausas) y, si sigue fallando, la tarea se detiene y se pregunta qué IA usar. Solo cambia tu configuración de usuario.',
    options: [
      ['gratis <modelo> …', 'Gratuitos de OpenCode Go, en ese orden (deben terminar en -free).'],
      ['pago <nombre> …', 'IA de pago (por defecto DeepSeek Flash de Go). Varios nombres = lista exacta; si falla la última, se detiene y se pregunta.'],
      ['reset', 'Vuelve al orden por defecto (gratuitos y pago).'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay orden', 'Muestra el orden actual y el estado de cada IA.'],
      ['agentrelay orden pago deepseek-pro-go', 'La IA de pago pasa a ser DeepSeek Pro por tu suscripción de Go.'],
      ['agentrelay orden pago deepseek-flash-go luna-go', 'DeepSeek Flash y, solo si falla, Luna, ambas por OpenCode Go.'],
      ['agentrelay orden gratis cat-jam longcat-2.5-preview', 'Solo esos dos gratuitos de Go, en ese orden.'],
    ],
  },
  evaluar: {
    summary: 'Prueba los modelos gratuitos de OpenCode Go y propone el orden de routing.freeOrder.',
    usage: ['agentrelay evaluar [--models a,b] [--runs N] [--no-apply]', 'agentrelay evaluar --revert'],
    description: 'Solo se ejecuta cuando lo pides. Descubre los modelos opencode-go/*-free de tu cuenta de OpenCode Go (nunca los de pago), les hace resolver cuatro tareas pequeñas en una carpeta temporal, las corrige con pruebas que el modelo no ve y propone un ranking. Por defecto aplica el resultado reescribiendo solo routing.freeOrder en tu configuración de usuario, y guarda el valor anterior para poder deshacerlo.',
    options: [
      ['--models <a,b>', 'Evalúa solo esos modelos; deben ser ids -free que estén en tu cuenta.'],
      ['--runs <N>', 'Repeticiones por modelo, de 1 a 3 (por defecto 1); con más de una se usa la media.'],
      ['--no-apply', 'Solo muestra la propuesta, sin cambiar la configuración.'],
      ['--revert', 'Restaura el routing.freeOrder anterior a la última evaluación aplicada.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay evaluar --no-apply', 'Evalúa y muestra la propuesta sin aplicarla.'],
      ['agentrelay evaluar', 'Evalúa y aplica el nuevo routing.freeOrder.'],
      ['agentrelay evaluar --runs 2', 'Repite cada tarea dos veces y usa la media.'],
      ['agentrelay evaluar --revert', 'Deshace el último cambio aplicado.'],
    ],
  },
  cuenta: {
    summary: 'Muestra, añade y cambia las cuentas gratuitas de Luna y Gemini.',
    usage: ['agentrelay cuenta', 'agentrelay cuenta <número>', 'agentrelay cuenta nueva <luna|gemini>', 'agentrelay cuenta quitar <número>'],
    description: 'Lista numerada de tus cuentas de ChatGPT (Luna) y de Google (Gemini), con su correo, lo que queda de cuota y cuál está en uso; en un terminal pregunta qué número usar. Elegir una cuenta con la sesión caducada abre el inicio de sesión. Cada cuenta extra guarda su sesión en una carpeta propia de AgentRelay y tiene su propio registro de cuota. Las sesiones de OpenCode no se tocan. Revisa las condiciones de cada servicio antes de usar varias cuentas.',
    options: [
      ['--device', 'Con una cuenta de Luna, inicia sesión con el código de dispositivo.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay cuenta', 'Muestra las cuentas numeradas y pregunta cuál usar.'],
      ['agentrelay cuenta 2', 'Usa la cuenta número 2.'],
      ['agentrelay cuenta nueva gemini', 'Entra con otra cuenta de Google y la deja en uso.'],
    ],
  },
  cuota: {
    summary: 'Muestra cuánto queda de cada IA gratuita y cuándo se renueva.',
    usage: ['agentrelay cuota [--json]'],
    description: 'Consulta en directo, sin gastar peticiones, la cuota de Luna (cuenta de ChatGPT: sus ventanas de uso, por ejemplo 30 días en el plan gratuito) y de Gemini (cuenta de Google: cuota diaria por modelo), con el porcentaje que queda y la hora de renovación. También muestra las IA marcadas como agotadas por el último error.',
    options: [
      ['--json', 'Imprime el estado en JSON.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay cuota', 'Muestra lo que queda de Luna y Gemini y cuándo se renueva.'],
    ],
  },
  providers: {
    summary: 'Muestra qué proveedores de modelos están conectados.',
    usage: ['agentrelay providers [--json]'],
    description: 'Lista los proveedores conectados por OpenCode o mediante variables de entorno, junto con su nivel, límites y política de datos conocida. Para los demás muestra cómo conectarlos.',
    options: [
      ['--json', 'Imprime la lista en JSON.'],
      ['--cwd <dir>', 'Indica el directorio desde el que se carga la configuración.'],
      ['--config <archivo>', 'Usa un archivo de configuración alternativo.'],
    ],
    examples: [
      ['agentrelay providers', 'Muestra los proveedores y cómo conectar los que faltan.'],
      ['agentrelay providers --json', 'Imprime los datos de proveedores en JSON.'],
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
