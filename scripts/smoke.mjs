import assert from "node:assert/strict";
import { createPreviewServer } from "./preview.mjs";

const server = createPreviewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
const pages = ["/", "/fixtures/mercurypay", "/evidence", "/status"];
try {
  for (const path of pages) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /synthetic/i, `${path}: synthetic disclosure`);
    assert.match(html, /Phase 1/i, `${path}: current phase`);
    assert.match(html, /<main[\s>]/, `${path}: main landmark`);
    assert.doesNotMatch(html, /<(?:script|img)[^>]+(?:src|href)=["']https?:\/\//i);
    console.log(`PASS ${path}: HTTP 200; phase/synthetic labels; semantic main; local resources`);
  }
  assert.equal((await fetch(origin + "/missing-page")).status, 404);
  assert.equal((await fetch(origin, { method: "POST" })).status, 405);
  console.log("PASS missing page: 404; unsupported method: 405");
  console.log("6 local HTTP smoke checks passed. No replay or real-provider validation performed.");
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
