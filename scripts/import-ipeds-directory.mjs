import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXPECTED_YEAR = 2024;
const EXPECTED_CSV_SHA256 = "d7b20e136fd971d7dce8ad6ec9b7002f0f281f133959f2c3a6c089a5a4610fe5";
const SOURCE_URL = "https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip";
const DATA_FILE = path.resolve("data/institutions/ipeds-hd2024.json");
const MIGRATION_FILE = path.resolve("supabase/migrations/20260717171915_comprehensive_institution_directory.sql");
const BEGIN = "-- BEGIN GENERATED IPEDS HD2024 DATA";
const END = "-- END GENERATED IPEDS HD2024 DATA";

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/import-ipeds-directory.mjs <path-to-HD2024.csv>");

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const character = input[i];
    if (quoted) {
      if (character === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const header = rows.shift();
  if (!header) throw new Error("IPEDS CSV is empty");
  header[0] = header[0].replace(/^\uFEFF/, "");
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function optionalInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function lifecycle(row) {
  if (row.CYACTIVE === "1") return "active";
  if (optionalInteger(row.NEWID)) return "merged";
  if (row.CLOSEDAT && !row.CLOSEDAT.startsWith("-")) return "closed";
  return "inactive";
}

function normalizeWebsite(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-2") return null;
  const firstUrl = trimmed.match(/https?:\/\/[^\s]+/i)?.[0] ?? trimmed.split(/\s+/)[0];
  if (!firstUrl) return null;
  return /^https?:\/\//i.test(firstUrl) ? firstUrl : `https://${firstUrl}`;
}

const csv = await readFile(path.resolve(source));
const digest = createHash("sha256").update(csv).digest("hex");
if (digest !== EXPECTED_CSV_SHA256) throw new Error(`Unexpected HD2024 CSV digest ${digest}; review the new source before updating the pinned hash.`);

const institutions = parseCsv(csv.toString("utf8")).map((row) => ({
  id: `ipeds:${row.UNITID}`,
  sourceId: row.UNITID,
  name: row.INSTNM.trim(),
  aliases: row.IALIAS.trim(),
  city: row.CITY.trim(),
  region: row.STABBR.trim(),
  postalCode: row.ZIP.trim(),
  website: normalizeWebsite(row.WEBADDR),
  sourceWebsite: row.WEBADDR.trim(),
  status: lifecycle(row),
  mergedIntoId: optionalInteger(row.NEWID) ? `ipeds:${row.NEWID}` : null,
  sector: optionalInteger(row.SECTOR),
  control: optionalInteger(row.CONTROL),
  level: optionalInteger(row.ICLEVEL)
})).sort((a, b) => Number(a.sourceId) - Number(b.sourceId));

if (institutions.length !== 6072) throw new Error(`Expected 6072 IPEDS rows, received ${institutions.length}`);
if (new Set(institutions.map(({ id }) => id)).size !== institutions.length) throw new Error("IPEDS UNITID values are not unique");

const artifact = {
  source: "NCES Integrated Postsecondary Education Data System (IPEDS)",
  survey: "Institutional Characteristics: Directory information (HD2024)",
  sourceYear: EXPECTED_YEAR,
  sourceUrl: SOURCE_URL,
  downloadedOn: "2026-07-17",
  csvSha256: digest,
  institutionCount: institutions.length,
  notes: "All HD2024 directory rows are retained. CYACTIVE=1 rows are active; other rows are marked merged, closed, or inactive and remain searchable but cannot start registration unless an operator changes their registration state.",
  institutions
};
await mkdir(path.dirname(DATA_FILE), { recursive: true });
await writeFile(DATA_FILE, `${JSON.stringify(artifact, null, 2)}\n`);

const migration = await readFile(MIGRATION_FILE, "utf8");
const beginIndex = migration.indexOf(BEGIN);
const endIndex = migration.indexOf(END);
if (beginIndex < 0 || endIndex < beginIndex) throw new Error("Migration generated-data markers are missing");
const json = JSON.stringify(institutions);
const generated = `${BEGIN}
with imported as (
  select * from jsonb_to_recordset($ipeds$${json}$ipeds$::jsonb) as row(
    id text, "sourceId" text, name text, aliases text, city text, region text, "postalCode" text, website text,
    status text, "mergedIntoId" text, sector integer, control integer, level integer
  )
)
insert into public.institution_directory(
  id,source,source_id,source_year,name,aliases,city,region,postal_code,country_code,website,status,merged_into_id,sector,control,level,registration_status,source_url,source_hash
)
select id,'ipeds',"sourceId",2024,name,aliases,city,region,"postalCode",'US',website,status::public.institution_directory_status,"mergedIntoId",sector,control,level,
  case when status='active' then 'open'::public.institution_registration_status else 'closed'::public.institution_registration_status end,
  '${SOURCE_URL}','${digest}'
from imported
on conflict (id) do update set
  name=excluded.name,aliases=excluded.aliases,city=excluded.city,region=excluded.region,postal_code=excluded.postal_code,website=excluded.website,status=excluded.status,
  merged_into_id=excluded.merged_into_id,sector=excluded.sector,control=excluded.control,level=excluded.level,source_year=excluded.source_year,source_url=excluded.source_url,source_hash=excluded.source_hash,updated_at=now();
${END}`;
await writeFile(MIGRATION_FILE, `${migration.slice(0, beginIndex)}${generated}${migration.slice(endIndex + END.length)}`);

console.log(JSON.stringify({ dataFile: DATA_FILE, migrationFile: MIGRATION_FILE, institutionCount: institutions.length, csvSha256: digest }, null, 2));
