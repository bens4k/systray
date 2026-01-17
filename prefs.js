import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class SysTrayPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage({
      title: 'Layout',
      icon_name: 'view-grid-symbolic',
    });

    const group = new Adw.PreferencesGroup({
      title: 'Popup Grid',
      description: '',
    });

    group.add(this._spinRow(settings, 'cell-size', 'Cell size', 16, 96, 1));
    group.add(this._spinRow(settings, 'popup-padding', 'Popup padding', 0, 64, 1));
    group.add(this._spinRow(settings, 'spacing', 'Spacing', 0, 64, 1));
    group.add(this._spinRow(settings, 'extra-width', 'Extra width', 0, 64, 1));
    group.add(this._spinRow(settings, 'extra-height', 'Extra height', 0, 128, 1));

    page.add(group);
    window.add(page);
  }

  _spinRow(settings, key, title, min, max, step) {
    const row = new Adw.SpinRow({ title });

    const adj = new Gtk.Adjustment({
      lower: min,
      upper: max,
      step_increment: step,
      page_increment: step * 10,
      value: settings.get_int(key),
    });

    row.adjustment = adj;

    // UI -> settings
    row.connect('notify::value', () => {
      const v = Math.round(row.value);
      if (settings.get_int(key) !== v)
        settings.set_int(key, v);
    });

    // settings -> UI
    settings.connect(`changed::${key}`, () => {
      const v = settings.get_int(key);
      if (Math.round(row.value) !== v)
        row.value = v;
    });

    return row;
  }
}
