import fs from "fs";
import fg from "fast-glob";
import { parseHTML } from "./parse";
import { normaliseDOM } from "./normalise";
import { extractSemanticBlocks } from "./extract";

async function processPages() {
  const files = await fg("pages/*.html");

  const allBlocks = [];

  for (const file of files) {
    const html = fs.readFileSync(file, "utf-8");
    const $ = parseHTML(html);

    normaliseDOM($);
    const blocks = extractSemanticBlocks($);

    allBlocks.push({
      file,
      blocks,
    });
  }

  fs.writeFileSync(
    "out/semantic-blocks.json",
    JSON.stringify(allBlocks, null, 2),
  );
}

processPages();
