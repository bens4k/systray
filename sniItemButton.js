import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { isObjectPath, safeText, unpack, pickBestPixmap, pixmapToFileIcon } from './utils.js';
import { MinimalDbusMenu } from './dbusMenu.js';

export class SniItemButton {
  constructor(busName, objPath, settings, DBusMenuProxyClass) {
    this.busName = busName;
    this.objPath = objPath;

    this._settings = settings;
    this._DBusMenuProxyClass = DBusMenuProxyClass;

    this._menuUnsupported = false;
    this._openingMenu = false;
    this._destroyed = false;

    this.actor = new St.Button({
      style_class: 'systray-item-button',
      can_focus: true,
      reactive: true,
      track_hover: true,
    });

    // tooltip
    this.actor.reactive = true;
    this.actor.has_tooltip = true;
    this.actor.tooltip_text = '';

    this._applyCellSize();
    this._settingsChangedId = this._settings?.connect?.('changed::cell-size', () => {
      this._applyCellSize();
    }) ?? 0;

    this.actor.x_expand = false;
    this.actor.y_expand = false;
    this.actor.x_align = Clutter.ActorAlign.CENTER;
    this.actor.y_align = Clutter.ActorAlign.CENTER;

    this._tmpIconFile = null;
    this._icon = new St.Icon({
      icon_name: 'dialog-information-symbolic',
      icon_size: 24,
    });
    this.actor.set_child(this._icon);

    this._clickedId = this.actor.connect('clicked', () => {
      const [x, y] = global.get_pointer();
      this._callItemMethod('Activate', '(ii)', [x | 0, y | 0]);
    });

    this._pressId = this.actor.connect('button-press-event', (_a, event) => {
      const btn = event.get_button?.() ?? 0;
      if (btn !== 3)
        return Clutter.EVENT_PROPAGATE;

      if (isObjectPath(this._menuPath) && !this._menuUnsupported) {
        if (this._openingMenu)
          return Clutter.EVENT_STOP;

        if (!this._dbusMenu)
          this._dbusMenu = new MinimalDbusMenu(
            this.busName,
            this._menuPath,
            this.actor,
            this._DBusMenuProxyClass
          );

        this._openingMenu = true;
        this._dbusMenu.open().catch(() => {}).finally(() => {
          this._openingMenu = false;

          if (this._dbusMenu && this._dbusMenu.unsupported) {
            this._menuUnsupported = true;
            this._dbusMenu = null;
          }
        });

        return Clutter.EVENT_STOP;
      }

      const [x, y] = global.get_pointer();
      this._callItemMethod('ContextMenu', '(ii)', [x | 0, y | 0]);
      return Clutter.EVENT_STOP;
    });
  }

  _applyCellSize() {
    const size = this._settings ? this._settings.get_int('cell-size') : 30;
    try { this.actor.set_size(size, size); } catch {}
  }

  async init() {
    await this._refreshFromProperties(true);
  }

  async _refreshFromProperties(isInitial = false) {
    let props;
    try {
      const res = await Gio.DBus.session.call(
        this.busName,
        this.objPath,
        'org.freedesktop.DBus.Properties',
        'GetAll',
        GLib.Variant.new('(s)', ['org.kde.StatusNotifierItem']),
        GLib.VariantType.new('(a{sv})'),
        Gio.DBusCallFlags.NONE,
        -1,
        null
      );
      props = res.deepUnpack()[0];
    } catch (e) {
      if (isInitial)
        logError(e, `GetAll failed for ${this.busName}${this.objPath}`);
      return;
    }

    this._menuPath = unpack(props.Menu) ?? null;

    const title = unpack(props.Title) ?? null;
    const iconName = unpack(props.IconName) ?? null;
    const iconPixmaps = unpack(props.IconPixmap) ?? null;
    const iconThemePath = unpack(props.IconThemePath) ?? null;

    const tip = title ? safeText(title) : safeText(`${this.busName}${this.objPath}`);
    this.actor.tooltip_text = tip;

    if (typeof iconThemePath === 'string' && iconThemePath.length > 0) {
      try {
        const theme = St.IconTheme.get_default();
        if (theme?.append_search_path)
          theme.append_search_path(iconThemePath);
      } catch {}
    }

    if (typeof iconName === 'string' && iconName.length > 0) {
      try {
        const theme = St.IconTheme.get_default();
        const info = theme?.lookup_icon?.(iconName, 24, 0);
        if (info) {
          this._icon.gicon = null;
          this._icon.icon_name = iconName;
          return;
        }
      } catch {}
    }

    const best = pickBestPixmap(iconPixmaps);
    if (best) {
      if (this._tmpIconFile) {
        try { this._tmpIconFile.delete(null); } catch {}
        this._tmpIconFile = null;
      }

      const fileIcon = pixmapToFileIcon(best);
      if (fileIcon) {
        this._tmpIconFile = fileIcon.file;
        this._icon.icon_name = null;
        this._icon.gicon = fileIcon;
        return;
      }
    }

    this._icon.gicon = null;
    this._icon.icon_name = 'image-missing-symbolic';
  }

  _callItemMethod(method, signature, args) {
    try {
      Gio.DBus.session.call(
        this.busName,
        this.objPath,
        'org.kde.StatusNotifierItem',
        method,
        GLib.Variant.new(signature, args),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (_conn, res) => {
          try { _conn.call_finish(res); } catch {}
        }
      );
    } catch {}
  }

  destroy() {
    if (this._destroyed)
      return;
    this._destroyed = true;

    if (this._settings && this._settingsChangedId) {
      try { this._settings.disconnect(this._settingsChangedId); } catch {}
      this._settingsChangedId = 0;
    }

    if (this.actor && this._clickedId) {
      try { this.actor.disconnect(this._clickedId); } catch {}
      this._clickedId = 0;
    }
    if (this.actor && this._pressId) {
      try { this.actor.disconnect(this._pressId); } catch {}
      this._pressId = 0;
    }

    if (this.actor) {
      this.actor.destroy();
      this.actor = null;
    }

    if (this._tmpIconFile) {
      try { this._tmpIconFile.delete(null); } catch {}
      this._tmpIconFile = null;
    }

    if (this._dbusMenu) {
      this._dbusMenu.destroy();
      this._dbusMenu = null;
    }
  }
}