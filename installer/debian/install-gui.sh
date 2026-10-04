#!/usr/bin/env bash
set -euo pipefail

TITLE="Instalador de AgentRelay"
INSTALLER_FALLBACK="/usr/share/agentrelay-installer/install.sh"
DRY_RUN=false

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

if ! command -v zenity >/dev/null 2>&1; then
  printf 'Falta Zenity (sudo apt-get install -y zenity). También puedes usar directamente install.sh --help.\n' >&2
  exit 1
fi

if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  printf 'No hay una pantalla gráfica disponible. Inicia este asistente desde una sesión gráfica; también puedes usar directamente install.sh --help.\n' >&2
  exit 1
fi

show_error() {
  zenity --error --title="$TITLE" --text="$1" || true
}

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
if command -v git >/dev/null 2>&1; then
  if command -v node >/dev/null 2>&1; then
    if NODE_VERSION="$(node --version 2>/dev/null)" && [[ "$NODE_VERSION" =~ ^v?([0-9]+)\. ]]; then
      if ((10#${BASH_REMATCH[1]} >= 20)); then
        NEEDS_DEPS=false
      fi
    fi
  fi
fi

if [[ "$NEEDS_DEPS" == true ]]; then
  WELCOME_TEXT='Este asistente instalará Git y Node.js 20 o posterior si faltan, clonará AgentRelay desde GitHub y preparará el comando agentrelay en ~/.local/bin. Solo podría pedirte la contraseña de administrador (sudo) si falta Git o Node.js.'
else
  WELCOME_TEXT='Este asistente clonará AgentRelay desde GitHub y preparará el comando agentrelay en ~/.local/bin. Git y Node.js 20 o posterior ya están instalados, así que no se solicitará la contraseña de administrador.'
fi

if ! zenity --question --title="$TITLE" --text="$WELCOME_TEXT" --ok-label='Continuar' --cancel-label='Cancelar'; then
  exit 0
fi

if ! DESTINATION="$(zenity --file-selection --directory --title="$TITLE" --filename="${HOME%/}/")"; then
  exit 0
fi
if [[ -z "$DESTINATION" ]]; then
  exit 0
fi
INSTALL_DIR="${DESTINATION%/}/AgentRelay"

if ! EXECUTORS="$(zenity --list --checklist --multiple --title="$TITLE" --text='Codex con GPT-6 Luna se instala siempre. Puedes elegir otros ejecutores:' --column='Elegir' --column='Ejecutor' --column='Descripción' --print-column=2 --separator=, FALSE cline 'Cline (clave de API de cualquier proveedor)' FALSE opencode 'OpenCode (modelos gratuitos y de pago)')"; then
  exit 0
fi

LOGIN=false
if zenity --question --title="$TITLE" --text='¿Conectar ahora tu cuenta de ChatGPT? (se abrirá el navegador)' --ok-label='Sí' --cancel-label='No, más tarde'; then
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

LOG_FILE="$(mktemp)" || {
  show_error 'No se pudo crear un archivo temporal para guardar el registro.'
  exit 1
}
STATUS_FILE="$(mktemp)" || {
  rm -f -- "$LOG_FILE"
  show_error 'No se pudo crear un archivo temporal para controlar el progreso.'
  exit 1
}
ASKPASS_FILE="$(mktemp)" || {
  rm -f -- "$LOG_FILE" "$STATUS_FILE"
  show_error 'No se pudo crear un archivo temporal para pedir la contraseña.'
  exit 1
}
trap 'rm -f -- "$LOG_FILE" "$STATUS_FILE" "$ASKPASS_FILE"' EXIT
# install.sh se ejecuta sin terminal: sudo pide la contraseña a través de este ayudante gráfico.
printf '#!/bin/sh
exec zenity --password --title="Contraseña de administrador"
' > "$ASKPASS_FILE"
chmod 700 "$ASKPASS_FILE"
export SUDO_ASKPASS="$ASKPASS_FILE"

(
  if bash "$INSTALL_SCRIPT" "${INSTALL_ARGS[@]}"; then
    printf '0\n' > "$STATUS_FILE"
  else
    INSTALL_STATUS=$?
    printf '%s\n' "$INSTALL_STATUS" > "$STATUS_FILE"
  fi
) > "$LOG_FILE" 2>&1 &
INSTALL_PID=$!

if ! zenity --progress --pulsate --auto-close --no-cancel --title="$TITLE" --text='Instalando AgentRelay. Esto puede tardar unos minutos…' < <(
  while [[ ! -s "$STATUS_FILE" ]]; do
    printf '# Instalando AgentRelay…\n'
    sleep 0.2
  done
); then
  :
fi

wait "$INSTALL_PID" || true
INSTALL_STATUS="$(<"$STATUS_FILE")"
if [[ "$INSTALL_STATUS" == 0 ]]; then
  zenity --info --title="$TITLE" --text='Instalación terminada. Abre una terminal nueva y ejecuta: agentrelay doctor' || true
else
  zenity --text-info --title='Error de instalación de AgentRelay' --filename="$LOG_FILE" || true
fi
