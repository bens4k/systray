# System Tray Popup – GNOME Shell Extension

A minimal StatusNotifierItem (SNI/AppIndicator-style) host for GNOME Shell that collects tray icons into a popup grid (instead of showing them inline on the panel).

## Requirements

- GNOME Shell with GJS (typical GNOME installation)
- Apps that expose tray icons via StatusNotifierItem (e.g. qBittorrent, etc.)

## Install (local)

```bash
# 1) Clone
git clone <your-repo-url> systray-popup
cd systray-popup

# 2) Copy to local extensions directory
# Make sure the folder name matches metadata.json "uuid"
UUID="systray@ab"
mkdir -p ~/.local/share/gnome-shell/extensions/"$UUID"
cp -r ./* ~/.local/share/gnome-shell/extensions/"$UUID"/
```

## Restart GNOME Shell

Xorg: `Alt + F2` → type `r` → Enter
Wayland: log out and log back in

## Then enable the extension
```bash
gnome-extensions enable systray@ab
```

## Check logs

```bash
journalctl --user -f -o cat | grep -i systray
```