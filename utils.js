import GLib from 'gi://GLib';
import St from 'gi://St';

export function readTextFile(gfile) {
  const [ok, bytes] = gfile.load_contents(null);
  if (!ok)
    throw new Error(`Failed to read file: ${gfile.get_path?.() ?? gfile.to_string()}`);

  if (typeof bytes === 'string')
    return bytes;

  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new TextDecoder('utf-8').decode(u8);
}

export function isObjectPath(p) {
  return typeof p === 'string' && p.length > 1 && p.startsWith('/');
}

export function safeText(s) {
  if (!s) return '';
  if (s.length > 80) return s.slice(0, 77) + '...';
  return s;
}

export function getTheme() {
  return St.ThemeContext.get_for_stage(global.stage).get_theme();
}

export function unpack(v) {
  if (v instanceof GLib.Variant)
    return v.deepUnpack();
  return v;
}

export function vunpack(v) {
  while (v instanceof GLib.Variant)
    v = v.deepUnpack();
  return v;
}

export function stripMnemonic(label) {
  if (!label)
    return '';
  const placeholder = '\u0000';
  return label
    .replace(/__/g, placeholder)
    .replace(/_/g, '')
    .replace(new RegExp(placeholder, 'g'), '_');
}

export function bestPixmapForSize(iconPixmaps, targetPx) {
  if (!iconPixmaps)
    return null;

  const list = Array.isArray(iconPixmaps) ? iconPixmaps : Object.values(iconPixmaps);
  if (!Array.isArray(list) || !list.length)
    return null;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const pm of list) {
    const w = (pm?.[0] ?? pm?.['0'] ?? 0) | 0;
    const h = (pm?.[1] ?? pm?.['1'] ?? 0) | 0;
    const bytesLike = pm?.[2] ?? pm?.['2'];

    if (!w || !h || !bytesLike)
      continue;

    const bytesU8 = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
    const rowStride = Math.floor(bytesU8.length / h); // many apps include padding
    if (rowStride < w * 4)
      continue;

    const maxDim = Math.max(w, h);
    const penalty = maxDim < targetPx ? 100000 : 0;
    const score = penalty + Math.abs(maxDim - targetPx);

    if (score < bestScore) {
      bestScore = score;
      best = { w, h, bytesU8, rowStride };
    }
  }

  return best;
}

export function bytesToGBytes(u8) {
  return GLib.Bytes.new(u8);
}

