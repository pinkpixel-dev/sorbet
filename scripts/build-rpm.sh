#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/release/linux-unpacked"
ICON_DIR="$ROOT_DIR/assets/icons/png"
TARGET_ARCH="${1:-x64}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "Expected packaged app directory at $APP_DIR" >&2
  echo "Run electron-builder with the linux dir target before building the RPM." >&2
  exit 1
fi

if ! command -v rpmbuild >/dev/null 2>&1; then
  echo "rpmbuild is required to create an RPM package." >&2
  exit 1
fi

VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
PRODUCT_NAME="$(node -p "require('$ROOT_DIR/package.json').build.productName")"
DESCRIPTION="$(node -p "require('$ROOT_DIR/package.json').description")"
LICENSE_ID="$(node -p "require('$ROOT_DIR/package.json').license")"
HOMEPAGE="$(node -p "require('$ROOT_DIR/package.json').homepage")"
MAINTAINER="$(node -p "const author=require('$ROOT_DIR/package.json').author; typeof author === 'string' ? author : author.name + ' <' + author.email + '>'")"

case "$TARGET_ARCH" in
  x64|x86_64)
    RPM_ARCH="x86_64"
    ARTIFACT_ARCH="x86_64"
    ;;
  arm64|aarch64)
    RPM_ARCH="aarch64"
    ARTIFACT_ARCH="arm64"
    ;;
  *)
    echo "Unsupported RPM architecture: $TARGET_ARCH" >&2
    exit 1
    ;;
esac

TOPDIR="$(mktemp -d)"
BUILDROOT="$TOPDIR/BUILDROOT"
SPEC_DIR="$TOPDIR/SPECS"
RPM_OUT_DIR="$TOPDIR/RPMS/$RPM_ARCH"
APP_INSTALL_DIR="$BUILDROOT/opt/$PRODUCT_NAME"

cleanup() {
  rm -rf "$TOPDIR"
}

trap cleanup EXIT

mkdir -p "$APP_INSTALL_DIR" "$SPEC_DIR" "$RPM_OUT_DIR" "$BUILDROOT/usr/share/applications"
cp -a "$APP_DIR/." "$APP_INSTALL_DIR/"

for icon_path in "$ICON_DIR"/*.png; do
  size="$(basename "$icon_path" .png)"
  destination_dir="$BUILDROOT/usr/share/icons/hicolor/$size/apps"
  mkdir -p "$destination_dir"
  cp "$icon_path" "$destination_dir/sorbet.png"
done

cat > "$BUILDROOT/usr/share/applications/sorbet.desktop" <<EOF
[Desktop Entry]
Name=Sorbet
Comment=$DESCRIPTION
Exec=/opt/$PRODUCT_NAME/sorbet %U
Icon=sorbet
Terminal=false
Type=Application
Categories=Utility;System;TerminalEmulator;
StartupWMClass=sorbet
EOF

cat > "$SPEC_DIR/sorbet.spec" <<EOF
Name: Sorbet
Version: $VERSION
Release: 1%{?dist}
Summary: $DESCRIPTION
License: $LICENSE_ID
URL: $HOMEPAGE
BuildArch: $RPM_ARCH
Requires: gtk3, libnotify, nss, libXScrnSaver, libXtst, xdg-utils, at-spi2-core, libuuid

%description
$DESCRIPTION

%install
mkdir -p %{buildroot}
cp -a $BUILDROOT/. %{buildroot}/

%files
/opt/$PRODUCT_NAME
/usr/share/applications/sorbet.desktop
/usr/share/icons/hicolor

%post
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

%postun
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

%changelog
* $(LC_ALL=C date '+%a %b %d %Y') $MAINTAINER - $VERSION-1
- Automated Sorbet RPM build.
EOF

rpmbuild \
  -bb \
  --target "$RPM_ARCH" \
  --define "_topdir $TOPDIR" \
  --define "_build_id_links none" \
  "$SPEC_DIR/sorbet.spec"

mkdir -p "$ROOT_DIR/release"
cp "$RPM_OUT_DIR/"*.rpm "$ROOT_DIR/release/Sorbet-$VERSION-linux-$ARTIFACT_ARCH.rpm"

echo "Built RPM at $ROOT_DIR/release/Sorbet-$VERSION-linux-$ARTIFACT_ARCH.rpm"
