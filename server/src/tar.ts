/** One archive member: a file with its bytes, or a folder (name ending in `/`). */
export type TarEntry =
  | { type: "file"; name: string; mtime: Date; data: Uint8Array }
  | { type: "directory"; name: string; mtime: Date };

const BLOCK = 512;

/**
 * Formats a number as a NUL-terminated, zero-padded octal tar field.
 * Args:
 *   value: A non-negative whole number.
 *   width: The field's width in bytes, including the NUL.
 * Returns:
 *   The field's text.
 * Raises:
 *   RangeError: The value is not a non-negative whole number or needs more digits than the field holds.
 */
function octal(value: number, width: number): string {
  const digits = value.toString(8);
  if (!Number.isSafeInteger(value) || value < 0 || digits.length > width - 1) {
    throw new RangeError(`${value} does not fit a ${width}-byte tar field`);
  }
  return digits.padStart(width - 1, "0") + "\0";
}

function header(entry: TarEntry, size: number): Buffer {
  const name = Buffer.from(entry.name, "utf8");
  if (name.length === 0 || name.length > 100) throw new RangeError(`tar entry name must be 1–100 bytes: ${entry.name}`);
  const block = Buffer.alloc(BLOCK);
  name.copy(block, 0);
  block.write(octal(entry.type === "directory" ? 0o755 : 0o644, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii"); // uid
  block.write(octal(0, 8), 116, "ascii"); // gid
  block.write(octal(size, 12), 124, "ascii");
  block.write(octal(Math.floor(entry.mtime.getTime() / 1000), 12), 136, "ascii");
  block.fill(" ", 148, 156); // the checksum is summed with its own field as spaces
  block.write(entry.type === "directory" ? "5" : "0", 156, "ascii");
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  const sum = block.reduce((total, byte) => total + byte, 0);
  block.write(octal(sum, 7) + " ", 148, "ascii");
  return block;
}

/**
 * Builds an uncompressed POSIX ustar archive.
 * Args:
 *   entries: The members in archive order; each name is at most 100 UTF-8 bytes.
 * Returns:
 *   The archive: each header and its content padded to 512 bytes, then two zero blocks.
 * Raises:
 *   RangeError: A name is empty or over 100 bytes, or a size or mtime does not fit its header field.
 */
export function buildTar(entries: TarEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const data = entry.type === "file" ? entry.data : new Uint8Array(0);
    chunks.push(header(entry, data.length), Buffer.from(data), Buffer.alloc((BLOCK - (data.length % BLOCK)) % BLOCK));
  }
  chunks.push(Buffer.alloc(2 * BLOCK));
  return Buffer.concat(chunks);
}
