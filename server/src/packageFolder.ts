import AdmZip from "adm-zip";
import { statSync } from "node:fs";
import type { LoadedPackage, PackageError } from "@study/shared";
import { readPackageZip } from "./zip.js";

type FolderResult = { pkg: LoadedPackage | null; errors: PackageError[] };

// `file` is formatted as a location inside the package, so a folder-level
// problem must not report the filesystem path there. `(folder)` follows the
// `(zip)` convention readPackageZip already uses for archive-level failures.
function folderError(message: string): FolderResult {
  return { pkg: null, errors: [{ file: "(folder)", path: "", message }] };
}

/**
 * Validate a package folder using the exact code path the import endpoint uses.
 * The folder is zipped in memory so authoring feedback cannot drift from import.
 */
export function readPackageFolder(dir: string): FolderResult {
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    return folderError("package directory does not exist");
  }
  if (!stat.isDirectory()) return folderError("package path is not a directory");

  const zip = new AdmZip();
  try {
    zip.addLocalFolder(dir);
  } catch {
    return folderError("package directory could not be read");
  }
  return readPackageZip(zip.toBuffer());
}
