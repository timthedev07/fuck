import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

function canonicaliseClasses(classAttr?: string): string[] {
  if (!classAttr) return [];
  return classAttr.split(/\s+/).filter(Boolean).sort();
}

/**
 * Strip inline styles + canonicalise class names
 */
export function normaliseDOM($: CheerioAPI) {
  $("*").each((_, el) => {
    const element = el as Element;

    // Remove inline styles
    $(element).removeAttr("style");

    // Canonicalise class list
    const classAttr = $(element).attr("class");
    if (classAttr) {
      const canonical = canonicaliseClasses(classAttr);
      $(element).attr("class", canonical.join(" "));
    }
  });
}
