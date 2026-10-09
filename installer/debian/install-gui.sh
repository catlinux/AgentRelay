#!/usr/bin/env bash
set -euo pipefail

TITLE="Instalador de AgentRelay"
INSTALLER_FALLBACK="/usr/share/agentrelay-installer/install.sh"
DRY_RUN=false
STATUS_FILE=""
ASKPASS_FILE=""
LOG_FILE=""

usage() {
  printf 'Uso: %s [--dry-run]\n' "${0##*/}"
}

while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Opción desconocida: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

zen() {
  zenity --width=520 --title="$TITLE" "$@" 2>/dev/null
}

escape_markup() {
  local value="$1"
  value="${value//&/\&amp;}"
  value="${value//</\&lt;}"
  value="${value//>/\&gt;}"
  printf '%s' "$value"
}

show_error() {
  zen --error --text="$1" || true
}

cleanup() {
  local temporary
  for temporary in "$STATUS_FILE" "$ASKPASS_FILE"; do
    if [[ -n "$temporary" ]]; then
      rm -f -- "$temporary"
    fi
  done
}
trap cleanup EXIT

if ! command -v zenity >/dev/null 2>&1; then
  printf 'Falta Zenity (sudo apt-get install -y zenity). También puedes usar directamente install.sh --help.\n' >&2
  exit 1
fi

if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  printf 'No hay una pantalla gráfica disponible. Inicia este asistente desde una sesión gráfica; también puedes usar directamente install.sh --help.\n' >&2
  exit 1
fi

SOURCE="${BASH_SOURCE[0]}"
while [[ -h "$SOURCE" ]]; do
  SOURCE_DIR="$(cd -P -- "$(dirname -- "$SOURCE")" >/dev/null 2>&1 && pwd)" || {
    show_error 'No se pudo localizar la carpeta del instalador.'
    exit 1
  }
  LINK_TARGET="$(readlink -- "$SOURCE")" || {
    show_error 'No se pudo resolver el enlace simbólico del instalador.'
    exit 1
  }
  if [[ "$LINK_TARGET" == /* ]]; then
    SOURCE="$LINK_TARGET"
  else
    SOURCE="$SOURCE_DIR/$LINK_TARGET"
  fi
done

SCRIPT_DIR="$(cd -P -- "$(dirname -- "$SOURCE")" >/dev/null 2>&1 && pwd)" || {
  show_error 'No se pudo localizar la carpeta del instalador.'
  exit 1
}

INSTALL_SCRIPT=""
if [[ -f "$SCRIPT_DIR/install.sh" ]]; then
  INSTALL_SCRIPT="$SCRIPT_DIR/install.sh"
elif [[ -f "$INSTALLER_FALLBACK" ]]; then
  INSTALL_SCRIPT="$INSTALLER_FALLBACK"
else
  show_error 'No se encontró install.sh junto al asistente ni en /usr/share/agentrelay-installer/.'
  exit 1
fi

NEEDS_DEPS=true
if command -v git >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  if NODE_VERSION="$(node --version 2>/dev/null)" && [[ "$NODE_VERSION" =~ ^v?([0-9]+)\. ]]; then
    if ((10#${BASH_REMATCH[1]} >= 20)); then
      NEEDS_DEPS=false
    fi
  fi
fi

INSTALL_DIR=""
CLONE_DIR="$(cd -P -- "$SCRIPT_DIR/../.." 2>/dev/null && pwd)" || CLONE_DIR=""
if [[ -n "$CLONE_DIR" ]] && command -v git >/dev/null 2>&1; then
  REPOSITORY_ROOT=""
  ORIGIN_URL=""
  if REPOSITORY_ROOT="$(git -C "$CLONE_DIR" rev-parse --show-toplevel 2>/dev/null)" &&
    [[ "$(cd -P -- "$REPOSITORY_ROOT" 2>/dev/null && pwd)" == "$CLONE_DIR" ]] &&
    ORIGIN_URL="$(git -C "$CLONE_DIR" remote get-url origin 2>/dev/null)"; then
    case "$ORIGIN_URL" in
      https://github.com/catlinux/AgentRelay|https://github.com/catlinux/AgentRelay.git|git@github.com:catlinux/AgentRelay|git@github.com:catlinux/AgentRelay.git|ssh://git@github.com/catlinux/AgentRelay|ssh://git@github.com/catlinux/AgentRelay.git)
        INSTALL_DIR="$CLONE_DIR"
        ;;
    esac
  fi
fi

if [[ -n "$INSTALL_DIR" ]]; then
  ESCAPED_INSTALL_DIR="$(escape_markup "$INSTALL_DIR")"
  WELCOME_TEXT="<b>AgentRelay ya está descargado en $ESCAPED_INSTALL_DIR.</b> Este asistente lo actualizará (descarga las novedades si no has cambiado archivos), instalará lo que falte y preparará el comando <b>agentrelay</b>.\n\nPuede pedirte la contraseña de administrador solo si faltan Git o Node.js."
else
  if [[ "$NEEDS_DEPS" == true ]]; then
    WELCOME_TEXT='Este asistente descargará <b>AgentRelay desde GitHub</b> e instalará Git y Node.js 20 o posterior si faltan. También preparará el comando <b>agentrelay</b>.\n\nPuede pedirte la contraseña de administrador solo si faltan Git o Node.js.'
  else
    WELCOME_TEXT='Este asistente descargará <b>AgentRelay desde GitHub</b> y preparará el comando <b>agentrelay</b>. Git y Node.js 20 o posterior ya están instalados.\n\nNo se solicitará la contraseña de administrador.'
  fi
fi

if ! zen --question --text="$WELCOME_TEXT" --ok-label='Continuar' --cancel-label='Cancelar'; then
  exit 0
fi

if [[ -z "$INSTALL_DIR" ]]; then
  if ! zen --info --text='<b>Elige la carpeta donde se instalará AgentRelay</b> (se creará una subcarpeta llamada AgentRelay dentro).' --ok-label='Elegir carpeta'; then
    exit 0
  fi
  if ! DESTINATION="$(zen --file-selection --directory --width=720 --height=480 --filename="${HOME%/}/")"; then
    exit 0
  fi
  if [[ -z "$DESTINATION" ]]; then
    exit 0
  fi
  INSTALL_DIR="${DESTINATION%/}/AgentRelay"
fi

EXECUTORS=""
if ! EXECUTORS="$(zen --list --checklist --multiple --height=360 --text='<b>Codex con GPT-6 Luna se instala siempre</b>: es el ejecutor por defecto y no hay que elegirlo.\n\nSi quieres, marca ejecutores <b>adicionales</b> (puedes cambiar de uno a otro cuando quieras con «agentrelay use»):' --column='Elegir' --column='Ejecutor' --column='Descripción' --print-column=2 --separator=, FALSE opencode 'OpenCode: modelos gratuitos (algunos sin clave) y de pago (DeepSeek, entre otros)')"; then
  exit 0
fi

LOGIN=false
if zen --question --text='¿Conectar ahora tu cuenta de ChatGPT? Se abrirá el navegador para que inicies sesión (necesario para usar Codex). Si ya tienes la sesión iniciada (por ejemplo desde VS Code) no hace falta.' --ok-label='Sí' --cancel-label='No, más tarde'; then
  LOGIN=true
fi

INSTALL_ARGS=(--install-dir "$INSTALL_DIR")
if [[ -n "$EXECUTORS" ]]; then
  INSTALL_ARGS+=(--executors "$EXECUTORS")
fi
if [[ "$LOGIN" == true ]]; then
  INSTALL_ARGS+=(--login)
fi
if [[ "$NEEDS_DEPS" == true ]]; then
  INSTALL_ARGS+=(--install-deps)
fi
if [[ "$DRY_RUN" == true ]]; then
  INSTALL_ARGS+=(--dry-run)
fi

INSTALL_ERROR=""

run_installation() {
  local state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/agentrelay"
  local latest_line=""
  local escaped_log=""

  if mkdir -p -- "$state_dir" 2>/dev/null && : > "$state_dir/install.log" 2>/dev/null; then
    LOG_FILE="$state_dir/install.log"
  else
    LOG_FILE="$(mktemp 2>/dev/null)" || {
      INSTALL_ERROR='No se pudo crear el registro de instalación.'
      return 1
    }
  fi

  STATUS_FILE="$(mktemp 2>/dev/null)" || {
    INSTALL_ERROR='No se pudo crear un archivo temporal para controlar el progreso.'
    return 1
  }
  ASKPASS_FILE="$(mktemp 2>/dev/null)" || {
    INSTALL_ERROR='No se pudo crear un archivo temporal para pedir la contraseña.'
    return 1
  }

  if ! printf '%s\n' '#!/bin/sh' 'exec zenity --width=520 --title="Contraseña de administrador" --password 2>/dev/null' > "$ASKPASS_FILE" || ! chmod 700 "$ASKPASS_FILE"; then
    INSTALL_ERROR='No se pudo preparar la solicitud gráfica de la contraseña.'
    return 1
  fi
  export SUDO_ASKPASS="$ASKPASS_FILE"

  (
    if bash "$INSTALL_SCRIPT" "${INSTALL_ARGS[@]}"; then
      printf '0\n' > "$STATUS_FILE"
    else
      install_status=$?
      printf '%s\n' "$install_status" > "$STATUS_FILE"
    fi
  ) > "$LOG_FILE" 2>&1 &
  local install_pid=$!

  zenity --width=520 --title="$TITLE" --progress --pulsate --no-cancel --text='Instalando AgentRelay…' 2>/dev/null < <(
    while [[ ! -s "$STATUS_FILE" ]]; do
      latest_line="$(awk 'NF { line = $0 } END { print line }' "$LOG_FILE" 2>/dev/null || true)"
      if [[ -z "$latest_line" ]]; then
        latest_line='Instalando AgentRelay…'
      fi
      if ((${#latest_line} > 90)); then
        latest_line="${latest_line:0:89}…"
      fi
      printf '# %s\n' "$latest_line"
      sleep 0.5
    done
  ) &
  local progress_pid=$!

  wait "$install_pid" || true
  kill "$progress_pid" 2>/dev/null || true
  wait "$progress_pid" 2>/dev/null || true
  if [[ ! -s "$STATUS_FILE" ]]; then
    INSTALL_ERROR='El proceso de instalación terminó sin informar de su resultado.'
    return 1
  fi
  local install_status
  IFS= read -r install_status < "$STATUS_FILE" || install_status=""
  if [[ "$install_status" != 0 ]]; then
    INSTALL_ERROR='La instalación no se completó.'
    return 1
  fi
  if [[ ! -r "$LOG_FILE" || ! -s "$LOG_FILE" ]]; then
    INSTALL_ERROR='La instalación terminó sin errores, pero el registro está vacío o no se puede leer.'
    return 1
  fi

  escaped_log="$(escape_markup "$LOG_FILE")"
  local success_text='<b>Instalación terminada.</b>\n\nAbre una terminal nueva y ejecuta:  <b>agentrelay doctor</b>\n\n<b>Cierra y abre de nuevo Claude Code</b>: las instrucciones de delegación solo se cargan en sesiones nuevas.'
  if [[ "$LOGIN" == true ]]; then
    success_text+="\n\nSi no se abrió el navegador para iniciar sesión en ChatGPT, ejecuta:  <b>agentrelay login</b>"
  fi
  if [[ ",$EXECUTORS," == *,opencode,* ]]; then
    success_text+="\n\nConecta OpenCode con: <b>agentrelay login opencode</b>"
  fi
  success_text+="\n\nRegistro: $escaped_log"
  zen --info --text="$success_text" || true
}

show_install_failure() {
  local message="$INSTALL_ERROR"
  local escaped_log=""
  if [[ -n "$LOG_FILE" ]]; then
    escaped_log="$(escape_markup "$LOG_FILE")"
    message="<b>La instalación no se completó.</b>\n\nRegistro: $escaped_log\n\n$INSTALL_ERROR"
    if [[ -r "$LOG_FILE" ]]; then
      zen --text-info --width=720 --height=480 --filename="$LOG_FILE" --title="La instalación no se completó (registro: $LOG_FILE)" || true
      return
    fi
  fi
  zen --error --text="$message" || true
}

if run_installation; then
  :
else
  show_install_failure
fi
