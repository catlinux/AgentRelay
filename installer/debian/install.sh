#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_URL="https://github.com/catlinux/AgentRelay.git"
INSTALL_DIR="$HOME/AgentRelay"
EXECUTORS=""
BRANCH="main"
LOGIN=false
INSTALL_DEPS=false
DRY_RUN=false
NODE_SETUP_FILE=""

usage() {
  cat <<'EOF'
Uso: install.sh [opciones]

Opciones:
  --install-dir <ruta>  Directorio del clon (por defecto: $HOME/AgentRelay)
  --executors <lista>   Instalar cline y/o opencode, separados por comas
  --login               Conectar la cuenta de ChatGPT durante la instalación
  --branch <rama>       Rama que se clonará (por defecto: main)
  --install-deps        Instalar Git y Node.js 22 con sudo si hacen falta
  --dry-run             Mostrar los pasos sin cambiar el sistema
  --help                Mostrar esta ayuda
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

print_command() {
  local arg
  printf '[simulación]'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
}

run() {
  if [[ "$DRY_RUN" == true ]]; then
    print_command "$@"
    return 0
  fi
  if "$@"; then
    return 0
  else
    local status=$?
    printf 'Error: falló el comando:' >&2
    printf ' %q' "$@" >&2
    printf ' (código %s).\n' "$status" >&2
    exit 1
  fi
}

run_in_dir() {
  local directory="$1"
  shift
  if [[ "$DRY_RUN" == true ]]; then
    printf '[simulación] (cd %q &&' "$directory"
    printf ' %q' "$@"
    printf ')\n'
    return 0
  fi
  if ! (cd "$directory" && run "$@"); then
    fail "no se pudo ejecutar el comando dentro de $directory."
  fi
}

cleanup() {
  if [[ -n "$NODE_SETUP_FILE" && -f "$NODE_SETUP_FILE" ]]; then
    rm -f -- "$NODE_SETUP_FILE"
  fi
}
trap cleanup EXIT

while (($#)); do
  case "$1" in
    --install-dir|--executors|--branch)
      option="$1"
      (($# >= 2)) || fail "falta el valor de $option."
      value="$2"
      [[ -n "$value" ]] || fail "el valor de $option no puede estar vacío."
      case "$option" in
        --install-dir) INSTALL_DIR="$value" ;;
        --executors) EXECUTORS="$value" ;;
        --branch) BRANCH="$value" ;;
      esac
      shift 2
      ;;
    --login) LOGIN=true; shift ;;
    --install-deps) INSTALL_DEPS=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help) usage; exit 0 ;;
    *) fail "opción desconocida: $1 (usa --help para ver las opciones)." ;;
  esac
done

if [[ -n "$EXECUTORS" ]]; then
  normalized_executors=""
  IFS=',' read -r -a executor_list <<< "$EXECUTORS"
  for executor in "${executor_list[@]}"; do
    executor="${executor#"${executor%%[![:space:]]*}"}"
    executor="${executor%"${executor##*[![:space:]]}"}"
    case "$executor" in
      cline|opencode) ;;
      *) fail "ejecutor no válido: '$executor'. Los permitidos son cline y opencode." ;;
    esac
    if [[ ",$normalized_executors," != *",$executor,"* ]]; then
      if [[ -n "$normalized_executors" ]]; then
        normalized_executors+=","
      fi
      normalized_executors+="$executor"
    fi
  done
  EXECUTORS="$normalized_executors"
fi

[[ -n "$INSTALL_DIR" ]] || fail 'la ruta de instalación no puede estar vacía.'

printf '[1/6] Comprobando el sistema...\n'
HAS_APT=false
if command -v apt-get >/dev/null 2>&1; then
  HAS_APT=true
else
  printf 'Aviso: este script está pensado para Debian, Ubuntu y derivados (apt-get no está disponible).\n' >&2
  printf 'Instalación manual: instala Git y Node.js 20 o posterior; clona %s, ejecuta npm ci, npm_config_prefix="$HOME/.local" npm link y luego agentrelay setup --yes.\n' "$REPOSITORY_URL" >&2
fi

printf '[2/6] Comprobando Node.js y Git...\n'
HAS_GIT=false
HAS_NODE=false
if command -v git >/dev/null 2>&1; then HAS_GIT=true; fi
if command -v node >/dev/null 2>&1; then
  if node_version="$(node --version 2>/dev/null)"; then
    if [[ "$node_version" =~ ^v?([0-9]+)\. ]] && ((10#${BASH_REMATCH[1]} >= 20)); then
      HAS_NODE=true
    fi
  else
    fail 'no se pudo consultar la versión de Node.js.'
  fi
fi

if [[ "$HAS_GIT" != true || "$HAS_NODE" != true ]]; then
  if [[ "$INSTALL_DEPS" != true ]]; then
    if [[ "$HAS_GIT" != true ]]; then
      printf 'Falta Git. Instálalo con: sudo apt-get install -y git curl ca-certificates\n' >&2
    fi
    if [[ "$HAS_NODE" != true ]]; then
      printf 'Falta Node.js 20 o posterior. Para instalar Node.js 22 desde NodeSource:\n' >&2
      printf '  setup_file="$(mktemp)"\n' >&2
      printf '  curl -fsSL https://deb.nodesource.com/setup_22.x -o "$setup_file"\n' >&2
      printf '  sudo -E bash "$setup_file"\n' >&2
      printf '  sudo apt-get install -y nodejs\n' >&2
      printf '  rm -f -- "$setup_file"\n' >&2
    fi
    [[ "$HAS_APT" == true ]] || fail 'faltan dependencias y apt-get no está disponible; instálalas manualmente con los comandos indicados y vuelve a intentarlo.'
    exit 1
  fi
  [[ "$HAS_APT" == true ]] || fail 'no se pueden instalar las dependencias: apt-get no está disponible.'
  if [[ "$HAS_GIT" != true ]]; then
    run sudo apt-get install -y git curl ca-certificates
  fi
  if [[ "$HAS_NODE" != true ]]; then
    run sudo apt-get install -y curl ca-certificates
    if [[ "$DRY_RUN" == true ]]; then
      print_command curl -fsSL https://deb.nodesource.com/setup_22.x -o '<archivo-temporal>'
      print_command sudo -E bash '<archivo-temporal>'
    else
      if NODE_SETUP_FILE="$(mktemp)"; then
        :
      else
        fail 'no se pudo crear un archivo temporal para configurar Node.js.'
      fi
      run curl -fsSL https://deb.nodesource.com/setup_22.x -o "$NODE_SETUP_FILE"
      run sudo -E bash "$NODE_SETUP_FILE"
    fi
    run sudo apt-get install -y nodejs
  fi
  if [[ "$DRY_RUN" != true ]]; then
    command -v git >/dev/null 2>&1 || fail 'Git sigue sin estar disponible tras la instalación.'
    command -v node >/dev/null 2>&1 || fail 'Node.js sigue sin estar disponible tras la instalación.'
    node_version="$(node --version 2>/dev/null)" || fail 'no se pudo consultar la versión de Node.js tras la instalación.'
    [[ "$node_version" =~ ^v?([0-9]+)\. ]] && ((10#${BASH_REMATCH[1]} >= 20)) || fail 'se necesita Node.js 20 o posterior.'
  fi
fi

printf '[3/6] Preparando el clon en %s...\n' "$INSTALL_DIR"
if [[ -e "$INSTALL_DIR" || -L "$INSTALL_DIR" ]]; then
  [[ -d "$INSTALL_DIR" ]] || fail "la ruta existe y no es un directorio: $INSTALL_DIR"
  shopt -s nullglob dotglob
  contents=("$INSTALL_DIR"/*)
  shopt -u nullglob dotglob
  if ((${#contents[@]} == 0)); then
    run git clone --branch "$BRANCH" "$REPOSITORY_URL" "$INSTALL_DIR"
  else
    if [[ "$DRY_RUN" == true && "$HAS_GIT" != true ]]; then
      fail "no se puede verificar la carpeta existente durante la simulación porque Git no está instalado: $INSTALL_DIR"
    fi
    is_repository=false
    if git -C "$INSTALL_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      repository_root="$(git -C "$INSTALL_DIR" rev-parse --show-toplevel 2>/dev/null)" || fail "no se pudo identificar el repositorio en $INSTALL_DIR."
      install_root="$(cd "$INSTALL_DIR" && pwd -P)" || fail "no se pudo acceder a $INSTALL_DIR."
      if [[ "$repository_root" == "$install_root" ]]; then is_repository=true; fi
    fi
    [[ "$is_repository" == true ]] || fail "la carpeta no está vacía y no es un clon de AgentRelay: $INSTALL_DIR. No se ha modificado."
    origin_url=""
    if git -C "$INSTALL_DIR" remote get-url origin >/dev/null 2>&1; then
      origin_url="$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null)" || fail "no se pudo leer origin en $INSTALL_DIR."
    fi
    case "$origin_url" in
      https://github.com/catlinux/AgentRelay|https://github.com/catlinux/AgentRelay.git|git@github.com:catlinux/AgentRelay|git@github.com:catlinux/AgentRelay.git|ssh://git@github.com/catlinux/AgentRelay|ssh://git@github.com/catlinux/AgentRelay.git) ;;
      *) fail "la carpeta no tiene el origin esperado (https://github.com/catlinux/AgentRelay.git): $INSTALL_DIR. No se ha modificado." ;;
    esac
    working_tree_status="$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=all)" || fail "no se pudo comprobar el estado de $INSTALL_DIR."
    if [[ -n "$working_tree_status" ]]; then
      fail "el clon tiene cambios sin confirmar; no se modificó: $INSTALL_DIR"
    fi
    run git -C "$INSTALL_DIR" pull --ff-only
  fi
else
  run git clone --branch "$BRANCH" "$REPOSITORY_URL" "$INSTALL_DIR"
fi

printf '[4/6] Instalando dependencias npm y enlazando agentrelay...\n'
run_in_dir "$INSTALL_DIR" npm ci
run_in_dir "$INSTALL_DIR" env "npm_config_prefix=$HOME/.local" npm link
LOCAL_BIN="$HOME/.local/bin"
case ":${PATH:-}:" in
  *":$LOCAL_BIN:"*) ;;
  *) printf 'Aviso: %s no está en PATH. Añade esta línea a ~/.profile: export PATH="$HOME/.local/bin:$PATH"\n' "$LOCAL_BIN" >&2 ;;
esac

printf '[5/6] Ejecutando la configuración inicial...\n'
AGENTRELAY="$HOME/.local/bin/agentrelay"
setup_args=(setup --yes)
if [[ -n "$EXECUTORS" ]]; then setup_args+=(--executors "$EXECUTORS"); fi
if [[ "$LOGIN" == true ]]; then setup_args+=(--login); fi
run "$AGENTRELAY" "${setup_args[@]}"

printf '[6/6] Comprobando la instalación...\n'
run "$AGENTRELAY" doctor

printf 'Instalación preparada en %s.\n' "$INSTALL_DIR"
printf 'Comando: %s/agentrelay.\n' "$HOME/.local/bin"
if [[ "$DRY_RUN" == true ]]; then
  printf 'La simulación no cambió el sistema; ejecuta el script sin --dry-run para instalar.\n'
elif [[ "$LOGIN" != true ]]; then
  printf 'Pendiente: conecta tu cuenta cuando quieras con %s login.\n' "$AGENTRELAY"
else
  printf 'La configuración inicial y el diagnóstico han terminado.\n'
fi
