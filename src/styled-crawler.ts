import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import axios from "axios";
import postcss from "postcss";
import safeParser from "postcss-safe-parser";

const BASE_URL = "https://mybus.com.ua";
const OUTPUT_DIR = "./out";

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Fetch external CSS file
async function fetchCSS(url: string) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (err) {
    console.error("Failed to fetch CSS:", url);
    return "";
  }
}

// Parse CSS and extract class-based rules
function extractCSSClasses(cssContent: string) {
  const root = safeParser(cssContent);
  const classRules: Record<string, string[]> = {};

  root.walkRules((rule) => {
    // Basic extraction - this can be improved to handle complex selectors if needed
    // For now, we store rules by their full selector to capture more than just simple classes
    const selector = rule.selector.trim();

    // Naively mapping class names to rules for the simple case
    // This is imperfect but better than just ignoring complex selectors completely
    const classMatches = selector.match(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g);

    const declarations = rule.nodes
      .filter((node) => node.type === "decl")
      .map((node) => `${(node as any).prop}: ${(node as any).value}`)
      .join("; ");

    if (classMatches) {
      classMatches.forEach((cls) => {
        const className = cls.replace(/^\./, "");
        if (!classRules[className]) classRules[className] = [];
        classRules[className].push(declarations);
      });
    }
  });

  return classRules;
}

async function extractPage(url: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle" });

  // Step 1: Extract all <link rel="stylesheet"> and <style> tags
  const stylesheets = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll("link[rel='stylesheet'], style"),
    );
    return links
      .map((link) => {
        if (link.tagName.toLowerCase() === "link") {
          return { type: "external", href: link.getAttribute("href") };
        }
        if (link.tagName.toLowerCase() === "style") {
          return { type: "inline", content: link.innerHTML };
        }
        return null;
      })
      .filter(Boolean);
  });

  // Step 2: Fetch external CSS and parse class rules
  const externalStyles: Record<string, Record<string, string[]>> = {};
  for (const sheet of stylesheets) {
    if (!sheet) continue;
    if (sheet.type === "external" && sheet.href) {
      let href = sheet.href;
      // Fix relative URLs
      if (!href.startsWith("http")) {
        href = new URL(href, BASE_URL).toString();
      }
      const cssContent = await fetchCSS(href);
      externalStyles[href] = extractCSSClasses(cssContent);
    }
  }

  // Step 3: Include inline <style> rules
  const inlineStyles: Record<string, string[]> = {};
  for (const sheet of stylesheets) {
    if (!sheet) continue;
    if (sheet.type === "inline" && sheet.content) {
      Object.assign(inlineStyles, extractCSSClasses(sheet.content));
    }
  }

  // Step 4: Extract HTML elements with computed styles
  const domData = await page.evaluate(() => {
    interface StyledElement {
      tag: string;
      text: string; // Direct text content only
      attributes: Record<string, string>;
      classes: string[];
      styles: Record<string, string>;
      children: StyledElement[];
    }

    function extractElement(el: Element): StyledElement {
      const computed = window.getComputedStyle(el);
      const styles: Record<string, string> = {};

      // List of important CSS properties to extract
      // Getting ALL properties (array iteration) creates massive JSON files
      // So we pick a very comprehensive list of visual properties
      const properties: string[] = [
        "display",
        "position",
        "top",
        "right",
        "bottom",
        "left",
        "float",
        "clear",
        "z-index",
        "overflow",
        "overflow-x",
        "overflow-y",

        "width",
        "height",
        "min-width",
        "min-height",
        "max-width",
        "max-height",
        "margin-top",
        "margin-right",
        "margin-bottom",
        "margin-left",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "box-sizing",

        "flex-direction",
        "flex-wrap",
        "flex-flow",
        "justify-content",
        "align-items",
        "align-content",
        "order",
        "flex-grow",
        "flex-shrink",
        "flex-basis",
        "align-self",
        "grid-template-columns",
        "grid-template-rows",
        "grid-gap",
        "gap",

        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "line-height",
        "text-align",
        "text-decoration",
        "text-transform",
        "letter-spacing",
        "white-space",
        "color",

        "background-color",
        "background-image",
        "background-size",
        "background-position",
        "background-repeat",

        "border-top-width",
        "border-right-width",
        "border-bottom-width",
        "border-left-width",
        "border-top-style",
        "border-right-style",
        "border-bottom-style",
        "border-left-style",
        "border-top-color",
        "border-right-color",
        "border-bottom-color",
        "border-left-color",
        "border-radius",
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-right-radius",
        "border-bottom-left-radius",

        "box-shadow",
        "opacity",
        "visibility",
        "cursor",
        "transform",
        "transition",
      ];

      for (const prop of properties) {
        const value = computed.getPropertyValue(prop);
        if (
          value &&
          value !== "none" &&
          value !== "normal" &&
          value !== "auto" &&
          value !== "0px" &&
          value !== "rgba(0, 0, 0, 0)" &&
          value !== "transparent"
        ) {
          styles[prop] = value;
        }
        // Keep some critical layout properties even if 'auto' or 'none' or '0px' to ensure structure is preserved
        if (
          [
            "display",
            "position",
            "width",
            "height",
            "font-size",
            "color",
            "background-color",
          ].includes(prop)
        ) {
          styles[prop] = value;
        }
      }

      const attributes: Record<string, string> = {};
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name !== "class" && attr.name !== "style") {
          attributes[attr.name] = attr.value;
        }
      });

      // Get direct text content, filtering out child text
      let text = "";
      el.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent?.trim() + " ";
        }
      });

      return {
        tag: el.tagName.toLowerCase(),
        text: text.trim(),
        attributes,
        classes: Array.from(el.classList),
        styles,
        children: Array.from(el.children).map(extractElement),
      };
    }

    return extractElement(document.body);
  });

  // Step 5: Save everything
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "styled-page.json"),
    JSON.stringify(domData, null, 2),
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "external-styles.json"),
    JSON.stringify(externalStyles, null, 2),
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "inline-styles.json"),
    JSON.stringify(inlineStyles, null, 2),
  );

  await browser.close();
  console.log("Extraction complete!");
}

extractPage(BASE_URL);
