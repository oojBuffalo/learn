import { visit } from "unist-util-visit";
import { prosePassages } from "@study/shared";
import type { LoadedPackage, PackageError } from "@study/shared";
import { processor } from "./mathCheck.js";

/** The path the asset route will look up: it receives the URL percent-decoded. */
function decoded(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
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
    visit(tree, "definition", (node) => {
      definitions.set(node.identifier, node.url);
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
      if (!url.startsWith("assets/") || assets.has(url) || assets.has(decoded(url))) continue;
      errors.push({ file: passage.file, path: passage.path, message: `image references missing asset "${url}"` });
    }
  }

  return errors;
}
