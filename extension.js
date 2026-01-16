import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Extension from 'resource:///org/gnome/shell/extensions/extension.js';

import { getTheme, readTextFile } from './utils.js';
import { PopupGridHost } from './host.js';
import { StatusNotifierWatcherMinimal } from './watcher.js';

export default class SysTrayMinimalExtension extends Extension.Extension {
  enable() {
    // CSS
    this._cssFile = this.dir.get_child('stylesheet.css');
    getTheme().load_stylesheet(this._cssFile);

    // Load interface XML from files
    const ifaceDir = this.dir.get_child('interfaces');
    const watcherXml = readTextFile(ifaceDir.get_child('org.kde.StatusNotifierWatcher.xml'));
    const dbusMenuXml = readTextFile(ifaceDir.get_child('com.canonical.dbusmenu.xml'));

    // Create DBusMenu proxy wrapper from XML at runtime
    this._DBusMenuProxyClass = Gio.DBusProxy.makeProxyWrapper(dbusMenuXml);

    // UI
    this._hostButton = new PopupGridHost();
    Main.panel.addToStatusArea('systray-minimal', this._hostButton, 1, 'right');

    // Watcher
    this._watcher = new StatusNotifierWatcherMinimal(this._hostButton, watcherXml, this._DBusMenuProxyClass);
  }

  disable() {
    if (this._watcher) {
      this._watcher.destroy();
      this._watcher = null;
    }

    if (this._hostButton) {
      this._hostButton.destroy();
      this._hostButton = null;
    }

    if (this._cssFile) {
      try { getTheme().unload_stylesheet(this._cssFile); } catch {}
      this._cssFile = null;
    }

    this._DBusMenuProxyClass = null;
  }
}
