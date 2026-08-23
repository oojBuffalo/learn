import AdmZip from "adm-zip";
import type { LoadedPackage, PackageError } from "@study/shared";
import { readPackageZip } from "./zip.js";

/**
 * Validate a package folder using the exact code path the import endpoint uses.
 * The folder is zipped in memory so authoring feedback cannot drift from import.
 */
export function readPackageFolder(dir: string): {
  pkg: LoadedPackage | null;
  errors: PackageError[];
} {
  const zip = new AdmZip();
  try {
    zip.addLocalFolder(dir);
  } catch {
    return {
      pkg: null,
      errors: [{ file: dir, path: "", message: "not a readable package folder" }],
    };
  }
  return readPackageZip(zip.toBuffer());
}
