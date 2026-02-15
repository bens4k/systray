# Windows style system tray – GNOME Shell Extension

A minimal StatusNotifierItem (SNI/AppIndicator-style) host for GNOME Shell that collects tray icons into a popup grid.

![alt text](https://github.com/bens4k/systray/blob/master/screenshots/img1.png "screenshot 1")


## Supported Gnome versions

Only tested in Gnome 49.


## Install (local)

### (1) Clone repo

```bash
git clone https://github.com/bens4k/systray systray@ab
```

### (2) Move to extensions folder

```bash
mv systray@ab ~/.local/share/gnome-shell/extensions/
```

### (3) Restart GNOME Shell

- Xorg: `Alt + F2` → type `r` → `Enter`
- Wayland: log out and log back in

### (4) Enable extension
```bash
gnome-extensions enable systray@ab
```
<!-- 
### Check logs

```bash
journalctl --user -f -o cat | grep -i systray
``` -->

## Known issues

- Button tooltips not working

## Next

- Add inline icons
- Drag & drop (reorder + move between inline & popup)
