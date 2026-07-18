import { readFile } from "node:fs/promises";

const directory = JSON.parse(await readFile(new URL("../data/college-directory.v1.json", import.meta.url), "utf8"));
const sources = [...new Set(directory.campuses.flatMap((campus) => campus.domains.map((domain) => domain.sourceUrl)).filter(Boolean))];
const results = await Promise.all(sources.map(async (url) => {
  if (!url.startsWith("https://")) return { url, failure: "not_https" };
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Campus-Exchange-Domain-Evidence-Review/1.0", range: "bytes=0-1023" } });
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403 || response.status === 429) return { url, review: response.status };
    if (!response.ok) return { url, failure: `http_${response.status}` };
    return { url, ok: response.status };
  } catch (error) {
    return { url, failure: error instanceof Error ? error.name : "request_failed" };
  }
}));

for (const result of results) {
  if (result.review) console.warn(`REVIEW ${result.review} ${result.url} (automated access blocked; verify manually)`);
  else if (result.ok) console.log(`OK ${result.ok} ${result.url}`);
}
const failures = results.filter((result) => result.failure).map(({ url, failure }) => ({ url, reason: failure }));
if (failures.length) {
  console.error(JSON.stringify({ event: "domain_evidence_check_failed", failures }, null, 2));
  process.exitCode = 1;
} else console.log(`Checked ${sources.length} unique first-party evidence URLs.`);
