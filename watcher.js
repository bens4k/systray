import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { BUS_NAME, OBJ_PATH, DEFAULT_ITEM_OBJECT_PATH } from './constants.js';
import { SniItemButton } from './sniItemButton.js';

export class StatusNotifierWatcherMinimal {
  constructor(hostButton, watcherIfaceXml, DBusMenuProxyClass, settings) {
    this._settings = settings;
    this._hostButton = hostButton;
    this._watcherIfaceXml = watcherIfaceXml;
    this._DBusMenuProxyClass = DBusMenuProxyClass;

    this._items = new Map();

    this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(this._watcherIfaceXml, this);
    this._dbusImpl.export(Gio.DBus.session, OBJ_PATH);

    this._nameOwnerSubId = Gio.DBus.session.signal_subscribe(
      'org.freedesktop.DBus',
      'org.freedesktop.DBus',
      'NameOwnerChanged',
      '/org/freedesktop/DBus',
      null,
      Gio.DBusSignalFlags.NONE,
      this._onNameOwnerChanged.bind(this)
    );

    this._ownNameId = Gio.DBus.session.own_name(
      BUS_NAME,
      Gio.BusNameOwnerFlags.NONE,
      this._onAcquired.bind(this),
      this._onLost.bind(this)
    );
  }

  get RegisteredStatusNotifierItems() {
    return [...this._items.values()].map(v => `${v.busName}${v.objPath}`);
  }
  get IsStatusNotifierHostRegistered() { return true; }
  get ProtocolVersion() { return 0; }

  _onAcquired() {}
  _onLost() {}

  _emitItemsChanged() {
    try {
      this._dbusImpl.emit_property_changed(
        'RegisteredStatusNotifierItems',
        GLib.Variant.new('as', this.RegisteredStatusNotifierItems)
      );
    } catch {}
  }

  _removeItemByKey(key) {
    const entry = this._items.get(key);
    if (!entry)
      return;

    try { this._hostButton.removeButton(entry.button.actor); } catch {}
    try { entry.button.destroy(); } catch {}

    this._items.delete(key);
    this._emitItemsChanged();
  }

  _onNameOwnerChanged(_conn, _sender, _path, _iface, _signal, params) {
    const [name, _oldOwner, newOwner] = params.deepUnpack();
    if (newOwner !== '')
      return;

    for (const [key, entry] of this._items.entries()) {
      if (entry.busName === name || entry.senderUnique === name)
        this._removeItemByKey(key);
    }
  }

  async RegisterStatusNotifierItemAsync(params, invocation) {
    try {
      const [service] = params;

      let busName, objPath;
      if (service?.startsWith('/')) {
        busName = invocation.get_sender();
        objPath = service;
      } else {
        busName = service;
        objPath = DEFAULT_ITEM_OBJECT_PATH;
      }

      if (!busName || !objPath) {
        invocation.return_dbus_error('org.gnome.gjs.JSError.ValueError', 'Invalid registration');
        return;
      }

      const key = `${busName}::${objPath}`;
      if (this._items.has(key)) {
        invocation.return_value(null);
        return;
      }

      const senderUnique = invocation.get_sender();

      const button = new SniItemButton(busName, objPath, this._settings, this._DBusMenuProxyClass);
      this._items.set(key, { busName, senderUnique, objPath, button });

      this._hostButton.addButton(button.actor);

      button.init().catch(e => logError(e, `SNI init failed for ${busName}${objPath}`));

      try {
        this._dbusImpl.emit_signal(
          'StatusNotifierItemRegistered',
          GLib.Variant.new('(s)', [busName])
        );
      } catch {}

      this._emitItemsChanged();
      invocation.return_value(null);
    } catch (e) {
      logError(e, 'RegisterStatusNotifierItemAsync failed');
      try {
        invocation.return_dbus_error('org.gnome.gjs.JSError.Error', String(e?.message ?? e));
      } catch {}
    }
  }

  async RegisterStatusNotifierHostAsync(_params, invocation) {
    invocation.return_value(null);
  }

  async StatusNotifierItemUnregisteredAsync(_params, invocation) {
    invocation.return_value(null);
  }

  destroy() {
    try { this._dbusImpl.unexport(); } catch {}

    if (this._ownNameId) {
      Gio.DBus.session.unown_name(this._ownNameId);
      this._ownNameId = 0;
    }

    if (this._nameOwnerSubId) {
      try { Gio.DBus.session.signal_unsubscribe(this._nameOwnerSubId); } catch {}
      this._nameOwnerSubId = 0;
    }

    for (const { button } of this._items.values()) {
      try { button.destroy(); } catch {}
    }
    this._items.clear();
  }
}
