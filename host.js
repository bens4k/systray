import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { CELL_SIZE } from './constants.js';

export const PopupGridHost = GObject.registerClass(
class PopupGridHost extends PanelMenu.Button {
  _init() {
    super._init(0.0, 'SysTray');

    this._panelIcon = new St.Icon({
      icon_name: 'pan-up-symbolic',
      style_class: 'system-status-icon',
    });
    this.add_child(this._panelIcon);

    this._openStateId = this.menu.connect('open-state-changed', (_m, isOpen) => {
      this._panelIcon.icon_name = isOpen ? 'pan-down-symbolic' : 'pan-up-symbolic';
    });

    this._cell = CELL_SIZE;
    this._pad = 8;
    this._spacing = 6;
    this._maxCols = 4;

    this._buttons = [];

    this._rowsBox = new St.BoxLayout({
      vertical: true,
      x_expand: true,
      y_expand: true,
      style: `spacing: ${this._spacing}px;`,
    });

    this.menu.box.add_child(this._rowsBox);
    this.menu.box.set_style(`padding: ${this._pad}px;`);

    this._syncPopupSize();
  }

  destroy() {
    if (this._openStateId) {
      try { this.menu.disconnect(this._openStateId); } catch {}
      this._openStateId = 0;
    }
    super.destroy();
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

    const EXTRA_W = 2;
    const EXTRA_H = 10;

    const w = this._pad * 2 + gridW + EXTRA_W;
    const h = this._pad * 2 + gridH + EXTRA_H;

    this.menu.box.set_style(`padding: ${this._pad}px;`);
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
