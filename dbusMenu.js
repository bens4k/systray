import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { vunpack, stripMnemonic } from './utils.js';

export class MinimalDbusMenu {
  constructor(busName, menuPath, sourceActor, DBusMenuProxyClass) {
    this._busName = busName;
    this._menuPath = menuPath;
    this._sourceActor = sourceActor;
    this._DBusMenuProxyClass = DBusMenuProxyClass;

    this._proxy = null;
    this._menu = null;
    this._menuManager = null;
    this._layoutUpdatedId = 0;

    this._destroyed = false;
    this._unsupported = false;

    this._idleRebuildId = 0;
  }

  get unsupported() {
    return this._unsupported;
  }

  async open() {
    if (this._destroyed || this._unsupported)
      return;

    if (!this._proxy) {
      this._proxy = new this._DBusMenuProxyClass(Gio.DBus.session, this._busName, this._menuPath);

      this._layoutUpdatedId = this._proxy.connectSignal('LayoutUpdated', () => {
        if (this._destroyed || this._unsupported)
          return;

        if (this._idleRebuildId)
          return;

        this._idleRebuildId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._idleRebuildId = 0;

          if (this._destroyed || this._unsupported)
            return GLib.SOURCE_REMOVE;

          const wasOpen = !!this._menu?.isOpen;
          if (wasOpen) {
            try { this._menu.close(); } catch {}

            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
              if (this._destroyed || this._unsupported)
                return GLib.SOURCE_REMOVE;
              this._rebuild().catch(() => {});
              return GLib.SOURCE_REMOVE;
            });

            return GLib.SOURCE_REMOVE;
          }

          this._rebuild().catch(() => {});
          return GLib.SOURCE_REMOVE;
        });
      });
    }

    if (!this._menu) {
      this._menu = new PopupMenu.PopupMenu(this._sourceActor, 0.5, St.Side.TOP);
      this._menu.actor.add_style_class_name('systray-dbusmenu');
      Main.uiGroup.add_child(this._menu.actor);
      this._menu.actor.hide();

      this._menuManager = new PopupMenu.PopupMenuManager(this._sourceActor);
      this._menuManager.addMenu(this._menu);
    }

    await this._rebuild();

    if (!this._destroyed && !this._unsupported && this._menu)
      this._menu.open();
  }

  async _rebuild() {
    if (this._destroyed || !this._menu || !this._proxy)
      return;

    if (this._menu.isOpen)
      return;

    this._menu.removeAll();

    let layoutRaw;
    try {
      const [_rev, l] = await this._proxy.GetLayoutAsync(
        0,
        -1,
        ['label', 'enabled', 'visible', 'type']
      );
      layoutRaw = l;
    } catch (e) {
      const msg = e?.message ?? String(e);

      if (msg.includes('UnknownMethod') || msg.includes("doesn't exist") || msg.includes('UnknownObject')) {
        log(`DBusMenu not supported at ${this._busName}${this._menuPath}: ${msg}`);
        this._unsupported = true;
        this.destroy();
        return;
      }

      if (msg.includes('ServiceUnknown') || msg.includes('NoReply') || msg.includes('disconnected')) {
        this.destroy();
        return;
      }

      logError(e, 'DBusMenu GetLayout failed');
      this.destroy();
      return;
    }

    const layout = vunpack(layoutRaw);

    const build = (node, menuSection) => {
      const children = node?.[2] ?? [];
      for (const childRaw of children) {
        const child = vunpack(childRaw);

        const cid = child?.[0];
        const cprops = child?.[1] ?? {};
        const cchildren = child?.[2] ?? [];

        const ctype = (vunpack(cprops.type) ?? '').toString();
        const cvisible = vunpack(cprops.visible);
        const cenabled = vunpack(cprops.enabled);
        const clabel = (vunpack(cprops.label) ?? '').toString();

        if (cvisible === false)
          continue;

        if (ctype === 'separator') {
          menuSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
          continue;
        }

        const isSubmenu = cchildren.length > 0 && (ctype === 'submenu' || ctype === '');
        const labelText = stripMnemonic(clabel.length ? clabel : '(unnamed)');

        if (isSubmenu) {
          const sub = new PopupMenu.PopupSubMenuMenuItem(labelText);
          sub.setSensitive(cenabled !== false);
          menuSection.addMenuItem(sub);
          build(child, sub.menu);
          continue;
        }

        const item = new PopupMenu.PopupMenuItem(labelText);
        item.setSensitive(cenabled !== false);
        item.connect('activate', () => {
          try {
            this._proxy.EventRemote(
              cid,
              'clicked',
              GLib.Variant.new('v', GLib.Variant.new('s', '')),
              0
            );
          } catch (e2) {
            logError(e2, 'DBusMenu EventRemote failed');
          }
        });
        menuSection.addMenuItem(item);
      }
    };

    build(layout, this._menu);
  }

  destroy() {
    if (this._destroyed)
      return;
    this._destroyed = true;

    if (this._idleRebuildId) {
      try { GLib.source_remove(this._idleRebuildId); } catch {}
      this._idleRebuildId = 0;
    }

    if (this._proxy && this._layoutUpdatedId) {
      try { this._proxy.disconnectSignal(this._layoutUpdatedId); } catch {}
      this._layoutUpdatedId = 0;
    }

    if (this._menu) {
      try { this._menu.close(); } catch {}
      try { this._menu.destroy(); } catch {}
      this._menu = null;
    }

    this._proxy = null;
    this._menuManager = null;
  }
}
