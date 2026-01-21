import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';

import { isObjectPath, safeText, unpack, bestPixmapForSize, bytesToGBytes } from './utils.js';
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

    this._menuPath = null;
    this._privateIconTheme = null;

    this._sniProxy = null;
    this._propsChangedId = 0;

    this.actor = new St.Button({
      style_class: 'systray-item-button',
      can_focus: true,
      reactive: true,
      track_hover: true,
    });

    // tooltip (may or may not show on some shells; harmless)
    this.actor.reactive = true;
    this.actor.has_tooltip = true;
    this.actor.tooltip_text = '';

    this._icon = new St.Icon({
      icon_name: 'dialog-information-symbolic',
      icon_size: 24,
    });
    this.actor.set_child(this._icon);

    this.actor.x_expand = false;
    this.actor.y_expand = false;
    this.actor.x_align = Clutter.ActorAlign.CENTER;
    this.actor.y_align = Clutter.ActorAlign.CENTER;

    this._applyCellSize();
    this._settingsChangedId =
      this._settings?.connect?.('changed::cell-size', () => this._applyCellSize()) ?? 0;

    this._clickedId = this.actor.connect('clicked', () => {
      const [x, y] = global.get_pointer();
      this._callItemMethod('Activate', '(ii)', [x | 0, y | 0]);
    });

    this._pressId = this.actor.connect('button-press-event', (_a, event) => {
      const btn = event.get_button?.() ?? 0;
      if (btn !== 3)
        return Clutter.EVENT_PROPAGATE;

      // Prefer DBusMenu if provided
      if (isObjectPath(this._menuPath) && !this._menuUnsupported) {
        if (this._openingMenu)
          return Clutter.EVENT_STOP;

        if (!this._dbusMenu) {
          this._dbusMenu = new MinimalDbusMenu(
            this.busName,
            this._menuPath,
            this.actor,
            this._DBusMenuProxyClass
          );
        }

        this._openingMenu = true;
        this._dbusMenu.open().catch(() => { }).finally(() => {
          this._openingMenu = false;

          if (this._dbusMenu && this._dbusMenu.unsupported) {
            this._menuUnsupported = true;
            try { this._dbusMenu.destroy(); } catch { }
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
    try { this.actor.set_size(size, size); } catch { }
  }

  async init() {
    try {
      this._sniProxy = await Gio.DBusProxy.new_for_bus_async(
        Gio.BusType.SESSION,
        Gio.DBusProxyFlags.NONE,
        null,
        this.busName,
        this.objPath,
        'org.kde.StatusNotifierItem',
        null
      );

      this._propsChangedId = this._sniProxy.connect('g-properties-changed', () => {
        if (this._destroyed)
          return;

        this._refreshFromProperties(false).catch(() => { });
      });
    } catch {
      this._sniProxy = null;
      this._propsChangedId = 0;
    }

    await this._refreshFromProperties(true);
  }

  _applyPixmapIcon(iconPixmaps, desiredLogicalPx) {
    const themeCtx = St.ThemeContext.get_for_stage(global.stage);
    const scaleFactor = themeCtx.scale_factor;

    const best = bestPixmapForSize(iconPixmaps, desiredLogicalPx * scaleFactor);
    if (!best)
      return false;

    const { w, h, bytesU8, rowStride } = best;

    const content = new St.ImageContent({
      preferredWidth: w,
      preferredHeight: h,
    });

    const args = [];

    if (content.set_bytes.length === 6) {
      const backend = global.stage?.context?.get_backend?.();
      if (backend?.get_cogl_context)
        args.push(backend.get_cogl_context());
    }

    args.push(
      bytesToGBytes(bytesU8), 
      Cogl.PixelFormat.ARGB_8888,
      w,
      h,
      rowStride
    );

    content.set_bytes(...args);

    const scaled = desiredLogicalPx * scaleFactor;

    this._icon.set({
      content,
      width: scaled,
      height: scaled,
      contentGravity: Clutter.ContentGravity.RESIZE_ASPECT,
      fallbackIconName: null,
    });

    this._icon.gicon = null;
    this._icon.icon_name = null;

    return true;
  }

  _getGiconFromThemePath(iconName, themePath, sizePx) {
    if (!iconName || !themePath)
      return null;

    if (iconName.includes('.')) {
      const parts = iconName.split('.');
      const ext = parts[parts.length - 1].toLowerCase();
      if (ext === 'png' || ext === 'svg')
        iconName = parts.slice(0, -1).join('.');
    }

    if (!this._privateIconTheme)
      this._privateIconTheme = new St.IconTheme();

    this._privateIconTheme.set_search_path([themePath]);

    const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;

    const info = this._privateIconTheme.lookup_icon_for_scale(
      iconName,
      sizePx,
      scale,
      St.IconLookupFlags.GENERIC_FALLBACK
    );

    if (!info)
      return null;

    const filename = info.get_filename?.();
    if (!filename)
      return null;

    const file = Gio.File.new_for_path(filename);
    return new Gio.FileIcon({ file });
  }

  async _refreshFromProperties(isInitial = false) {
    if (this._destroyed)
      return;

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

    const newMenuPath = unpack(props.Menu) ?? null;
    if (newMenuPath !== this._menuPath) {
      this._menuPath = newMenuPath;

      if (this._dbusMenu) {
        try { this._dbusMenu.destroy(); } catch {}
        this._dbusMenu = null;
      }
      this._menuUnsupported = false; // new path might be valid even if old wasn't
    }

    const title = unpack(props.Title) ?? null;
    const iconName = unpack(props.IconName) ?? null;
    const iconPixmaps = unpack(props.IconPixmap) ?? null;
    const iconThemePath = unpack(props.IconThemePath) ?? null;

    //log(`SNI ${this.busName}${this.objPath} IconName="${iconName}" ThemePath="${iconThemePath}" Pixmaps=${Array.isArray(iconPixmaps) ? iconPixmaps.length : (iconPixmaps ? Object.values(iconPixmaps).length : 0)}`);

    const tip = title ? safeText(title) : safeText(`${this.busName}${this.objPath}`);
    this.actor.tooltip_text = tip;

    if (typeof iconThemePath === 'string' && iconThemePath.length > 0 &&
      typeof iconName === 'string' && iconName.length > 0) {
      const gicon = this._getGiconFromThemePath(iconName, iconThemePath, 24);
      if (gicon) {
        this._icon.icon_name = null;
        this._icon.gicon = gicon;
        this._icon.set({ content: null }); // ensure pixmap content not stuck
        return;
      }
    }

    if (typeof iconName === 'string' && iconName.length > 0) {
      try {
        const theme = St.IconTheme.get_default();
        const info = theme?.lookup_icon?.(iconName, 24, 0);
        if (info) {
          this._icon.gicon = null;
          this._icon.icon_name = iconName;
          this._icon.set({ content: null });
          return;
        }
      } catch { }
    }

    if (iconPixmaps && this._applyPixmapIcon(iconPixmaps, 24))
      return;

    this._icon.gicon = null;
    this._icon.icon_name = 'image-missing-symbolic';
    this._icon.set({ content: null });
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
          try { _conn.call_finish(res); } catch { }
        }
      );
    } catch { }
  }

  destroy() {
    if (this._destroyed)
      return;
    this._destroyed = true;

    if (this._settings && this._settingsChangedId) {
      try { this._settings.disconnect(this._settingsChangedId); } catch { }
      this._settingsChangedId = 0;
    }

    if (this._sniProxy && this._propsChangedId) {
      try { this._sniProxy.disconnect(this._propsChangedId); } catch { }
      this._propsChangedId = 0;
    }
    this._sniProxy = null;

    if (this.actor && this._clickedId) {
      try { this.actor.disconnect(this._clickedId); } catch { }
      this._clickedId = 0;
    }
    if (this.actor && this._pressId) {
      try { this.actor.disconnect(this._pressId); } catch { }
      this._pressId = 0;
    }

    if (this._dbusMenu) {
      try { this._dbusMenu.destroy(); } catch { }
      this._dbusMenu = null;
    }

    if (this.actor) {
      try { this.actor.destroy(); } catch { }
      this.actor = null;
    }

    this._privateIconTheme = null;
  }
}
