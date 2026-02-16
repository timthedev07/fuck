import * as cheerio from "cheerio";

export function parseHTML(html: string) {
  return cheerio.load(html, {
    xmlMode: false,
  });
}
