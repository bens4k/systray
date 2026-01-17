import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GdkPixbuf from 'gi://GdkPixbuf';

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

export function tupleGet(t, i) {
  if (Array.isArray(t))
    return t[i];
  if (t && typeof t === 'object') {
    if (t[i] !== undefined) return t[i];
    const k = String(i);
    if (t[k] !== undefined) return t[k];
  }
  return undefined;
}

export function toU8(bytesLike) {
  if (!bytesLike)
    return null;

  if (bytesLike instanceof GLib.Variant) {
    try {
      if (bytesLike.get_type_string?.() === 'ay') {
        const b = bytesLike.get_data_as_bytes();
        const data = b.get_data();
        return data instanceof Uint8Array ? data : null;
      }
    } catch {}

    try {
      const v = bytesLike.deepUnpack();
      if (v instanceof Uint8Array) return v;
      if (v instanceof ArrayBuffer) return new Uint8Array(v);
      if (Array.isArray(v)) return new Uint8Array(v);
    } catch {
      return null;
    }
  }

  if (bytesLike && typeof bytesLike.get_data === 'function') {
    const data = bytesLike.get_data();
    return data instanceof Uint8Array ? data : null;
  }

  if (bytesLike instanceof Uint8Array)
    return bytesLike;
  if (bytesLike instanceof ArrayBuffer)
    return new Uint8Array(bytesLike);
  if (Array.isArray(bytesLike))
    return new Uint8Array(bytesLike);

  return null;
}

export function pickBestPixmap(iconPixmaps) {
  const arr = unpack(iconPixmaps);
  if (!arr)
    return null;

  const list = Array.isArray(arr) ? arr : Object.values(arr);
  if (!Array.isArray(list) || list.length === 0)
    return null;

  let best = null;
  let bestArea = -1;

  for (const entry of list) {
    const pm = unpack(entry);

    const w = unpack(tupleGet(pm, 0)) | 0;
    const h = unpack(tupleGet(pm, 1)) | 0;
    const bytes = toU8(tupleGet(pm, 2));

    if (!w || !h || !bytes)
      continue;

    const area = w * h;
    if (area > bestArea) {
      bestArea = area;
      best = [w, h, bytes];
    }
  }

  return best; // [w,h,Uint8Array]
}

export function convertOrder(src, order /* 'ARGB'|'BGRA'|'RGBA' */) {
  const dst = new Uint8Array(src.length);

  for (let i = 0; i + 3 < src.length; i += 4) {
    let a, r, g, b;

    switch (order) {
      case 'ARGB':
        a = src[i + 0]; r = src[i + 1]; g = src[i + 2]; b = src[i + 3];
        break;
      case 'BGRA':
        b = src[i + 0]; g = src[i + 1]; r = src[i + 2]; a = src[i + 3];
        break;
      case 'RGBA':
      default:
        r = src[i + 0]; g = src[i + 1]; b = src[i + 2]; a = src[i + 3];
        break;
    }

    dst[i + 0] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = a;
  }

  return dst;
}

export function savePngToTempFile(pngBytesU8) {
  const dir = GLib.get_tmp_dir();
  const name = `systray-${GLib.uuid_string_random()}.png`;
  const path = GLib.build_filenamev([dir, name]);
  const file = Gio.File.new_for_path(path);

  file.replace_contents(
    pngBytesU8,
    null,
    false,
    Gio.FileCreateFlags.REPLACE_DESTINATION,
    null
  );

  return file;
}

export function pixmapToFileIcon(pixmapTriple) {
  try {
    const [w, h, src] = pixmapTriple;
    const expected = w * h * 4;
    if (!src || src.length < expected)
      return null;

    const raw = (src.length === expected) ? src : src.subarray(0, expected);
    const ordersToTry = ['ARGB', 'BGRA', 'RGBA'];

    for (const order of ordersToTry) {
      try {
        const rgba = (order === 'RGBA') ? raw : convertOrder(raw, order);
        const bytes = GLib.Bytes.new(rgba);

        const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
          bytes,
          GdkPixbuf.Colorspace.RGB,
          true,
          8,
          w,
          h,
          w * 4
        );

        const out = pixbuf.save_to_bufferv('png', [], []);
        const pngBytes = Array.isArray(out)
          ? (out.length === 2 ? out[1] : out[0])
          : null;

        if (!pngBytes)
          continue;

        const file = savePngToTempFile(pngBytes);
        return new Gio.FileIcon({ file });
      } catch {}
    }

    return null;
  } catch (e) {
    logError(e, 'Failed to convert IconPixmap to FileIcon');
    return null;
  }
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
