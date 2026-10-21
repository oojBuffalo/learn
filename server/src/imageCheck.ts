import { visit } from "unist-util-visit";
import { prosePassages } from "@study/shared";
import type { LoadedPackage, PackageError } from "@study/shared";
import { processor } from "./mathCheck.js";

/**
 * The stored path the asset route will look up for an image destination.
 *
 * The browser drops any query or fragment and sends the path percent-encoded; the
 * route hands it back fully decoded. So `assets/a%23b.png` is the file `a#b.png`,
 * and `assets/a%20b.png` is `a b.png`, never a file literally named `a%20b.png`.
 */
function lookupKey(url: string): string {
  const path = url.split(/[?#]/, 1)[0]!;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Report every image that points at an asset the package does not contain.
 *
 * Parsing with the renderer's own grammar is what keeps this honest: balanced
 * parentheses and titles in a destination, reference-style images, and image syntax
 * shown inside code all come out the way the learner's browser will see them.
 *
 * Args:
 *   pkg: The loaded package, already past schema and reference validation.
 *
 * Returns:
 *   One error per missing asset reference, in the importer's error shape.
 */
export function validateImages(pkg: LoadedPackage): PackageError[] {
  const errors: PackageError[] = [];
  const assets = new Set(pkg.assets.map((a) => a.path));

  for (const passage of prosePassages(pkg)) {
    if (passage.mode === "plain" || !passage.text.includes("![")) continue;
    const tree = processor.parse(passage.text);

    const definitions = new Map<string, string>();
    // The first definition of a label wins, as it does in the renderer.
    visit(tree, "definition", (node) => {
      if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    });

    const urls: string[] = [];
    visit(tree, (node) => {
      if (node.type === "image") urls.push((node as unknown as { url: string }).url);
      if (node.type === "imageReference") {
        const url = definitions.get((node as unknown as { identifier: string }).identifier);
        if (url !== undefined) urls.push(url);
      }
    });

    for (const url of urls) {
      if (!url.startsWith("assets/") || assets.has(lookupKey(url))) continue;
      errors.push({ file: passage.file, path: passage.path, message: `image references missing asset "${url}"` });
    }
  }

  return errors;
}
