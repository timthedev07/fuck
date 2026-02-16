import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import { URL } from "url";

const BASE_URL = "https://mybus.com.ua";
const OUTPUT_DIR = "./pages";
const CONCURRENCY = 5;

const visited = new Set<string>();
let flightListingDiscovered = false;
const limit = pLimit(CONCURRENCY);

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

function normaliseURL(href: string): string | null {
  try {
    const url = new URL(href, BASE_URL);

    // do not branch out into other domains
    if (url.hostname !== new URL(BASE_URL).hostname) {
      return null;
    }

    url.hash = "";

    if (url.pathname === "/site/screen") {
      const name = url.searchParams.get("name");
      if (name === "flight-listing-oneway" || name === "traveller-details") {
        url.searchParams.delete("_ts");
        url.searchParams.delete("startTimer");
        url.searchParams.sort();
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function crawl(url: string) {
  if (visited.has(url)) return;
  // Global check to skip crawling additional flight listing pages
  if (url.includes("name=flight-listing-oneway") && flightListingDiscovered) {
    return;
  }

  visited.add(url);

  if (url.includes("name=flight-listing-oneway")) {
    flightListingDiscovered = true;
  }

  console.log("Crawling:", url);

  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const fileName =
      url.replace(BASE_URL, "").replace(/\//g, "_").replace(/^_+/, "") ||
      "index";

    fs.writeFileSync(path.join(OUTPUT_DIR, `${fileName}.html`), data);

    const $ = cheerio.load(data);

    const links = $("a[href]")
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter(Boolean);

    // dedup, keep only one link with param name=flight-listing-oneway
    const seenFlightListing = new Set<string>();
    const filteredLinks = links.filter((link) => {
      const normalized = normaliseURL(link!);
      if (normalized && normalized.includes("name=flight-listing-oneway")) {
        const url = new URL(normalized);
        const key =
          url.searchParams.get("name") ||
          "" +
            url.searchParams.get("origin") +
            url.searchParams.get("destination");
        if (seenFlightListing.has(key)) {
          return false;
        }
        seenFlightListing.add(key);
      }
      return true;
    });

    await Promise.all(
      filteredLinks.map((link) =>
        limit(async () => {
          const normalized = normaliseURL(link!);
          if (normalized && !visited.has(normalized)) {
            await crawl(normalized);
          }
        }),
      ),
    );
  } catch (err) {
    console.error("Failed:", url);
  }
}

const TRAVELLER_DETAILS_URL =
  "https://mybus.com.ua/site/screen?name=traveller-details&order_id=1693468&startTimer=1&_ts=20260216_051031";

Promise.all([
  crawl(BASE_URL),
  // Manual addition to ensure this pattern is crawled
  // We use normaliseURL to ensure consistency with how other links are processed
  crawl(normaliseURL(TRAVELLER_DETAILS_URL)!),
]).then(() => {
  console.log("Done crawling.");
});
