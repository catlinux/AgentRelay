#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Uso: build-deb.sh [opciones]

Opciones:
  --version <x.y.z>   Versión del paquete (por defecto: package.json)
  --output-dir <ruta> Carpeta de salida (por defecto: .agentrelay/installer)
  --help              Mostrar esta ayuda
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

VERSION=""
OUTPUT_DIR=""
while (($#)); do
  case "$1" in
    --version|--output-dir)
      option="$1"
      (($# >= 2)) || fail "falta el valor de $option."
      value="$2"
      [[ -n "$value" ]] || fail "el valor de $option no puede estar vacío."
      case "$option" in
        --version) VERSION="$value" ;;
        --output-dir) OUTPUT_DIR="$value" ;;
      esac
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "opción desconocida: $1 (usa --help para ver las opciones)."
      ;;
  esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPOSITORY_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"

if [[ -z "$VERSION" ]]; then
  PACKAGE_JSON="$REPOSITORY_ROOT/package.json"
  [[ -r "$PACKAGE_JSON" ]] || fail "no se puede leer la versión: falta o no se puede leer $PACKAGE_JSON."
  VERSION="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$PACKAGE_JSON" | head -n 1)" || fail "no se pudo leer la versión de $PACKAGE_JSON."
  [[ -n "$VERSION" ]] || fail "no se pudo leer la versión de $PACKAGE_JSON."
fi

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "versión no válida: '$VERSION'. Usa el formato x.y.z (por ejemplo, 1.2.3)."
command -v dpkg-deb >/dev/null 2>&1 || fail 'Este script necesita dpkg-deb (Debian/Ubuntu): sudo apt-get install -y dpkg-dev'

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$REPOSITORY_ROOT/.agentrelay/installer"
fi
mkdir -p -- "$OUTPUT_DIR" || fail "no se pudo crear la carpeta de salida: $OUTPUT_DIR."
OUTPUT_DIR="$(cd -- "$OUTPUT_DIR" && pwd -P)" || fail "no se pudo acceder a la carpeta de salida: $OUTPUT_DIR."

TEMP_DIR="$(mktemp -d)" || fail 'no se pudo crear una carpeta temporal.'
trap 'rm -rf -- "$TEMP_DIR"' EXIT
PACKAGE_ROOT="$TEMP_DIR/package"

install -D -m 0755 "$REPOSITORY_ROOT/installer/debian/install.sh" "$PACKAGE_ROOT/usr/share/agentrelay-installer/install.sh"
install -D -m 0755 "$REPOSITORY_ROOT/installer/debian/install-gui.sh" "$PACKAGE_ROOT/usr/share/agentrelay-installer/install-gui.sh"

cat > "$TEMP_DIR/agentrelay-installer" <<'EOF'
#!/bin/sh
exec bash /usr/share/agentrelay-installer/install-gui.sh "$@"
EOF
install -D -m 0755 "$TEMP_DIR/agentrelay-installer" "$PACKAGE_ROOT/usr/bin/agentrelay-installer"

cat > "$TEMP_DIR/control.in" <<'EOF'
Package: agentrelay-installer
Version: @VERSION@
Section: devel
Priority: optional
Architecture: all
Depends: bash, zenity, git, curl, ca-certificates
Maintainer: CatLinux <noreply@users.noreply.github.com>
Homepage: https://github.com/catlinux/AgentRelay
Description: Asistente gráfico para instalar AgentRelay
 Este asistente instala AgentRelay en la carpeta personal del usuario.
EOF
sed "s/@VERSION@/$VERSION/" "$TEMP_DIR/control.in" > "$TEMP_DIR/control"
install -D -m 0644 "$TEMP_DIR/control" "$PACKAGE_ROOT/DEBIAN/control"

cat > "$TEMP_DIR/agentrelay-installer.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Instalar AgentRelay
Comment=Instala AgentRelay en tu carpeta personal
Exec=agentrelay-installer
Terminal=false
Categories=Development;Utility;
EOF
install -D -m 0644 "$TEMP_DIR/agentrelay-installer.desktop" "$PACKAGE_ROOT/usr/share/applications/agentrelay-installer.desktop"

OUTPUT_FILE="$OUTPUT_DIR/agentrelay-installer_${VERSION}_all.deb"
dpkg-deb --root-owner-group --build "$PACKAGE_ROOT" "$OUTPUT_FILE"

printf 'Paquete creado: %s\n' "$OUTPUT_FILE"
printf 'Instálalo con: sudo apt install %s\n' "$OUTPUT_FILE"
