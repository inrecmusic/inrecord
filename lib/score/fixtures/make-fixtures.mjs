// 由 stress.musicxml 產生壓縮版 stress.mxl（META-INF/container.xml 指向 score.musicxml）
// 用法：node lib/score/fixtures/make-fixtures.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const dir = fileURLToPath(new URL(".", import.meta.url));
const container = `<?xml version="1.0" encoding="UTF-8"?>
<container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>
`;
const zip = zipSync({
  mimetype: strToU8("application/vnd.recordare.musicxml"),
  "META-INF/container.xml": strToU8(container),
  "score.musicxml": new Uint8Array(readFileSync(`${dir}stress.musicxml`)),
}, { mtime: new Date("2026-10-29T00:00:00Z") });
writeFileSync(`${dir}stress.mxl`, zip);
console.log(`stress.mxl ${zip.length} bytes`);
