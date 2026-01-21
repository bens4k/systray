import St from 'gi://St';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export const PopupGridHost = GObject.registerClass(
  class PopupGridHost extends PanelMenu.Button {
    _init(settings) {
      super._init(0.0, 'SysTray');
      this._settings = settings;
      this._buttons = [];

      this._panelIcon = new St.Icon({
        icon_name: 'pan-up-symbolic',
        style_class: 'system-status-icon',
      });
      this.add_child(this._panelIcon);

      this._openStateId = this.menu.connect('open-state-changed', (_m, isOpen) => {
        this._panelIcon.icon_name = isOpen ? 'pan-down-symbolic' : 'pan-up-symbolic';

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._syncPopupSize();
          return GLib.SOURCE_REMOVE;
        });
      });

      this._rowsBox = new St.BoxLayout({
        vertical: true,
        x_expand: false,
        y_expand: false,
        x_align: Clutter.ActorAlign.START,
        y_align: Clutter.ActorAlign.START,
      });

      this.menu.box.add_child(this._rowsBox);

      // setting updates
      this._settingsChangedId = this._settings.connect('changed', () => {
        this._readLayoutSettings();
        this._applyCellSizeToAllButtons();
        this._rebuildRows();

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._syncPopupSize();
          return GLib.SOURCE_REMOVE;
        });
      });

      this._readLayoutSettings();
      this._syncPopupSize();
    }

    destroy() {
      if (this._openStateId) {
        try { this.menu.disconnect(this._openStateId); } catch { }
        this._openStateId = 0;
      }
      if (this._settingsChangedId) {
        try { this._settings.disconnect(this._settingsChangedId); } catch { }
        this._settingsChangedId = 0;
      }
      super.destroy();
    }

    _readLayoutSettings() {
      this._maxCols = this._settings.get_int('max-columns');
      this._cell = this._settings.get_int('cell-size');
      this._pad = this._settings.get_int('popup-padding');
      this._spacing = this._settings.get_int('spacing');
    }

    _applyCellSizeToAllButtons() {
      const cell = Math.max(1, this._cell);
      for (const btn of this._buttons) {
        try { btn.set_size(cell, cell); } catch { }
      }
    }

    _rebuildRows() {
      for (const child of this._rowsBox.get_children())
        this._rowsBox.remove_child(child);

      const cell = Math.max(1, this._cell);
      const spacing = Math.max(0, this._spacing);

      this._rowsBox.set_style(`spacing:${spacing}px;`);

      let row = null;
      let col = 0;

      for (const btn of this._buttons) {
        const p = btn.get_parent?.();
        if (p) p.remove_child(btn);

        try { btn.set_size(cell, cell); } catch { }

        if (!row || col >= this._maxCols) {
          row = new St.BoxLayout({ vertical: false, x_expand: false, y_expand: false });
          row.set_style(`spacing:${spacing}px;`);
          this._rowsBox.add_child(row);
          col = 0;
        }

        row.add_child(btn);
        col++;
      }

      this._syncPopupSize();
    }

    _syncPopupSize() {
      const spacing = Math.max(0, this._spacing);
      const pad = Math.max(0, this._pad);

      this.menu.box.set_style(`padding:${pad}px;`);
      this._rowsBox.set_style(`spacing:${spacing}px;`);

      this._rowsBox.x_expand = false;
      this._rowsBox.y_expand = false;

      this.menu.box.x_align = Clutter.ActorAlign.START;
      this.menu.box.y_align = Clutter.ActorAlign.START;

      this.menu.actor.queue_relayout();
      this.menu.box.queue_relayout();
      this._rowsBox.queue_relayout();
    }

    addButton(button) {
      if (!button) return;

      if (!this._buttons.includes(button))
        this._buttons.push(button);

      this._applyCellSizeToAllButtons();
      this._rebuildRows();
    }

    removeButton(button) {
      if (!button) return;

      const idx = this._buttons.indexOf(button);
      if (idx !== -1)
        this._buttons.splice(idx, 1);

      const p = button.get_parent?.();
      if (p) p.remove_child(button);

      this._rebuildRows();
    }
  });
