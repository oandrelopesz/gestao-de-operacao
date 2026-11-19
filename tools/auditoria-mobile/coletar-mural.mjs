// Collects top Dribbble shots per query (public search, no login). Usage: node coletar.mjs <out.json>
import { chromium } from "playwright-core";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const QUERIES = [
  "swiss style dashboard", "editorial web app", "skeuomorphic app interface", "tactile ui",
  "teenage engineering ui", "dot matrix interface", "terminal ui design", "luxury dark app ui",
  "warm minimal app", "monochrome dashboard", "visionos app", "bento dashboard",
  "macos task manager app", "crm desktop app", "brutalist dashboard", "retro futuristic interface",
  "japanese app ui", "kanban board app", "financial terminal ui", "paper texture app ui",
];
if (process.argv.length > 3) QUERIES.splice(0, QUERIES.length, ...process.argv.slice(3));
const out = existsSync(process.argv[2] || "") ? JSON.parse(readFileSync(process.argv[2], "utf8")) : [];
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US" });
for (const q of QUERIES) {
  const page = await ctx.newPage();
  try {
    await page.goto(`https://dribbble.com/search/shots/popular?q=${encodeURIComponent(q)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3500);
    const shots = await page.$$eval("li.shot-thumbnail", (lis) => lis.slice(0, 12).map((li) => {
      const img = li.querySelector("figure img, img");
      const a = li.querySelector("a.shot-thumbnail-link, a[href*='/shots/']");
      const set = (img?.getAttribute("data-srcset") || img?.getAttribute("srcset") || "").split(",").map((s) => s.trim().split(" ")[0]).filter(Boolean);
      const src = set.at(-1) || img?.getAttribute("data-src") || img?.src || "";
      const title = li.querySelector(".shot-title, [data-test='shot-title']")?.textContent?.trim() || img?.alt || "";
      return { src, title, link: a ? new URL(a.getAttribute("href"), location.origin).href : "" };
    }));
    for (const s of shots) if (s.src && !s.src.startsWith("data:") && !/\.(mp4|webm)/.test(s.src)) out.push({ q, ...s });
    console.log(q, shots.length);
  } catch (e) { console.log(q, "ERRO", e.message.slice(0, 80)); }
  await page.close();
  await new Promise((r) => setTimeout(r, 4000)); // Dribbble returns empty pages when hit too fast
}
await browser.close();
writeFileSync(process.argv[2] || "candidatos.json", JSON.stringify(out, null, 1));
console.log("total", out.length);
