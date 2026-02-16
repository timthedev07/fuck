// src/extract.ts
import { CheerioAPI } from "cheerio";
import { Element } from "domhandler";

export interface SemanticBlock {
  type: string;
  tag: string;
  classes: string[];
  childrenCount: number;
  html: string;
}

function getClasses($: CheerioAPI, el: Element): string[] {
  const cls = $(el).attr("class");
  return cls ? cls.split(/\s+/).filter(Boolean) : [];
}

function extractCards($: CheerioAPI): SemanticBlock[] {
  const blocks: SemanticBlock[] = [];

  $("div").each((_, el) => {
    const children = $(el).children();
    const hasImage = $(el).find("img").length > 0;
    const hasHeading = $(el).find("h1,h2,h3,h4,h5,h6").length > 0;
    const hasButton = $(el).find("button,a").length > 0;

    // Heuristic for "card"
    if (children.length >= 2 && hasImage && hasHeading) {
      blocks.push({
        type: "card",
        tag: el.tagName,
        classes: getClasses($, el),
        childrenCount: children.length,
        html: $.html(el),
      });
    }
  });

  return blocks;
}

export function extractSemanticBlocks($: CheerioAPI): SemanticBlock[] {
  const blocks: SemanticBlock[] = [];

  // Forms
  $("form").each((_, el) => {
    blocks.push({
      type: "form",
      tag: el.tagName,
      classes: getClasses($, el),
      childrenCount: $(el).children().length,
      html: $.html(el),
    });
  });

  // Buttons
  $("button").each((_, el) => {
    blocks.push({
      type: "button",
      tag: el.tagName,
      classes: getClasses($, el),
      childrenCount: 0,
      html: $.html(el),
    });
  });

  // Navigation
  $("nav, header").each((_, el) => {
    blocks.push({
      type: "navigation",
      tag: el.tagName,
      classes: getClasses($, el),
      childrenCount: $(el).children().length,
      html: $.html(el),
    });
  });

  // Tables
  $("table").each((_, el) => {
    blocks.push({
      type: "table",
      tag: el.tagName,
      classes: getClasses($, el),
      childrenCount: $(el).find("tr").length,
      html: $.html(el),
    });
  });

  // Modals heuristic
  $("div").each((_, el) => {
    const classes = getClasses($, el);
    if (
      classes.some((c) =>
        ["modal", "popup", "dialog"].some((keyword) =>
          c.toLowerCase().includes(keyword),
        ),
      )
    ) {
      blocks.push({
        type: "modal",
        tag: el.tagName,
        classes,
        childrenCount: $(el).children().length,
        html: $.html(el),
      });
    }
  });

  // Cards heuristic
  blocks.push(...extractCards($));

  return blocks;
}
