import axios from "axios";
import * as cheerio from "cheerio";

async function crawl(url: string, visited = new Set()) {
  if (visited.has(url)) return;
  visited.add(url);

  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  // Collect links
  const links = $("a[href]")
    .map((i, el) => $(el).attr("href"))
    .get();
  for (const link of links) {
    if (link.startsWith("/"))
      await crawl(`https://mybus.com.ua${link}`, visited);
  }

  // Save page HTML for later processing
  require("fs").writeFileSync(`pages/${visited.size}.html`, data);
}
