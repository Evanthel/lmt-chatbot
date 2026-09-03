import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("hosted demo exposes complete Open Graph cover metadata", () => {
  assert.match(html, /property="og:title" content="Xenophon — Inspectable RAG assistant"/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /property="og:image"[\s\S]*xenophon-cover\.png/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
});

test("cover SVG uses the Open Graph aspect ratio and required evidence labels", () => {
  const svg = fs.readFileSync(new URL("../docs/portfolio/xenophon-cover.svg", import.meta.url), "utf8");
  assert.match(svg, /width="1200" height="630"/);
  assert.match(svg, />NO RAG</);
  assert.match(svg, />GROUNDED RAG</);
  assert.equal((svg.match(/\[\d\] lbdl/g) || []).length, 3);
  assert.match(svg, />100%</);
});

test("rendered Open Graph cover is a 1200 by 630 PNG", () => {
  const png = fs.readFileSync(new URL("../docs/portfolio/xenophon-cover.png", import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
