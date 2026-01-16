# Windows 11 style system tray popup – GNOME Shell Extension

A minimal StatusNotifierItem (SNI/AppIndicator-style) host for GNOME Shell that collects tray icons into a popup grid (instead of showing them inline on the panel).

![alt text](https://github.com/bens4k/systray/blob/master/screenshots/s_open.png "Open")


## Install (local)

```bash
# 1) Clone
git clone https://github.com/bens4k/systray systray@ab
```

```bash
# 2) move to extensions foldler
mv systray@ab ~/.local/share/gnome-shell/extensions/
```

## Restart GNOME Shell

Xorg: `Alt + F2` → type `r` → Enter

Wayland: log out and log back in

```bash
# 3) Enable extension
gnome-extensions enable systray@ab
```

## Check logs

```bash
journalctl --user -f -o cat | grep -i systray
```