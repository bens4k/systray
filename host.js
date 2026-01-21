import St from 'gi://St';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

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
      this.menu.actor.set_style(`min-width:0px;`);

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

    _syncPopupWidthToContent() {
      if (!this.menu.isOpen || !this.menu.actor.mapped)
        return;

      this._rowsBox.set_width(-1);
      this.menu.box.set_width(-1);
      this.menu.actor.set_width(-1);

      this._rowsBox.queue_relayout();
      this.menu.box.queue_relayout();
      this.menu.actor.queue_relayout();

      let [, natW] = this.menu.actor.get_preferred_width(-1);

      let borderW = 0;
      try {
        const node = this.menu.box.get_theme_node();
        borderW =
          node.get_length('border-left-width') +
          node.get_length('border-right-width');
      } catch { }

      if (natW <= 0) {
        const n = this._buttons.length;
        const cols = Math.max(1, Math.min(this._maxCols, n));
        const cell = Math.max(1, this._cell);
        const spacing = Math.max(0, this._spacing);
        const pad = Math.max(0, this._pad);
        natW = cols * cell + (cols - 1) * spacing + pad * 2 + borderW;
      } else {
        natW = natW + borderW;
      }

      const targetW = Math.ceil(natW) + 2;

      this.menu.actor.set_width(targetW);
      this.menu.box.set_width(targetW);
      this.menu.actor.queue_relayout();
    }

    _syncPopupSize() {
      const spacing = Math.max(0, this._spacing);
      const pad = Math.max(0, this._pad);

      this.menu.actor.set_style('min-width: 0px;');
      this.menu.box.set_style(`padding:${pad}px; min-width: 0px;`);

      this._rowsBox.set_style(`spacing:${spacing}px;`);

      this.menu.actor.x_expand = false;
      this.menu.box.x_expand = false;
      this._rowsBox.x_expand = false;

      this.menu.box.x_align = Clutter.ActorAlign.START;
      this._rowsBox.x_align = Clutter.ActorAlign.START;

      global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
        this._syncPopupWidthToContent();
        return GLib.SOURCE_REMOVE;
      });
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
