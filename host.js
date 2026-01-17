import St from 'gi://St';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export const PopupGridHost = GObject.registerClass(
class PopupGridHost extends PanelMenu.Button {
  _init(settings) {
    super._init(0.0, 'SysTray');
    this._settings = settings;

    this._maxCols = 4; // keep as-is (not user-configurable per your request)
    this._buttons = [];

    this._panelIcon = new St.Icon({
      icon_name: 'pan-up-symbolic',
      style_class: 'system-status-icon',
    });
    this.add_child(this._panelIcon);

    this._openStateId = this.menu.connect('open-state-changed', (_m, isOpen) => {
      this._panelIcon.icon_name = isOpen ? 'pan-down-symbolic' : 'pan-up-symbolic';

      // When opening, apply sizing after allocation settles
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._syncPopupSize();
        return GLib.SOURCE_REMOVE;
      });
    });

    this._rowsBox = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
    });
    this.menu.box.add_child(this._rowsBox);

    this._readLayoutSettings();

    // Live updates
    this._settingsChangedId = this._settings.connect('changed', () => {
      this._readLayoutSettings();
      this._applyCellSizeToAllButtons();
      this._rebuildRows();
    });

    this._syncPopupSize();
  }

  destroy() {
    if (this._openStateId) {
      try { this.menu.disconnect(this._openStateId); } catch {}
      this._openStateId = 0;
    }
    if (this._settingsChangedId) {
      try { this._settings.disconnect(this._settingsChangedId); } catch {}
      this._settingsChangedId = 0;
    }
    super.destroy();
  }

  _readLayoutSettings() {
    this._cell = this._settings.get_int('cell-size');
    this._pad = this._settings.get_int('popup-padding');
    this._spacing = this._settings.get_int('spacing');
    this._extraW = this._settings.get_int('extra-width');
    this._extraH = this._settings.get_int('extra-height');

    this.menu.box.set_style(`padding: ${this._pad}px;`);
  }

  _applyCellSizeToAllButtons() {
    for (const btn of this._buttons) {
      try { btn.set_size(this._cell, this._cell); } catch {}
    }
  }

  _rebuildRows() {
    for (const child of this._rowsBox.get_children())
      this._rowsBox.remove_child(child);

    let row = null;
    this._buttons.forEach((btn, idx) => {
      const p = btn.get_parent?.();
      if (p) p.remove_child(btn);

      if (idx % this._maxCols === 0) {
        row = new St.BoxLayout({
          vertical: false,
          x_expand: true,
          style: `spacing: ${this._spacing}px;`,
        });
        this._rowsBox.add_child(row);
      }

      row.add_child(btn);
    });

    this._syncPopupSize();
  }

  _syncPopupSize() {
    const count = this._buttons.length;

    const cols = Math.max(1, Math.min(this._maxCols, count || 1));
    const rows = Math.max(1, Math.ceil((count || 1) / cols));

    const gridW = cols * this._cell + (cols - 1) * this._spacing;
    const gridH = rows * this._cell + (rows - 1) * this._spacing;

    const w = this._pad * 2 + gridW + this._extraW;
    const h = this._pad * 2 + gridH + this._extraH;

    this._rowsBox.set_size(gridW, gridH);
    this.menu.box.set_size(w, h);
    this.menu.actor.set_size(w, h);

    this.menu.box.queue_relayout();
    this.menu.actor.queue_relayout();
    this._rowsBox.queue_relayout();
  }

  addButton(button) {
    if (!button) return;

    button.set_size(this._cell, this._cell);

    if (!this._buttons.includes(button))
      this._buttons.push(button);

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
