import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Domain = { domain: string; kind: string; status: string; enabled: boolean; sourceUrl: string };
type Campus = { slug: string; status: string; domains: Domain[] };
const directory = JSON.parse(readFileSync(resolve(process.cwd(), "../../data/college-directory.v1.json"), "utf8")) as { version: number; reviewedAt: string; campuses: Campus[] };
const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20260717163055_college_directory_onboarding.sql"), "utf8");
const institutionArtifact = JSON.parse(readFileSync(resolve(process.cwd(), "../../data/institutions/ipeds-hd2024.json"), "utf8")) as {
  source: string; sourceYear: number; sourceUrl: string; csvSha256: string; institutionCount: number;
  institutions: Array<{ id: string; name: string; status: string; mergedIntoId: string | null }>;
};
const institutionMigration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20260717171915_comprehensive_institution_directory.sql"), "utf8");

describe("reviewed college directory", () => {
  it("contains the reviewed launch set with provenance", () => {
    const enabled = directory.campuses.filter((campus) => campus.status === "enabled");
    expect(directory.version).toBe(1);
    expect(enabled).toHaveLength(17);
    for (const campus of enabled) {
      const qualifying = campus.domains.filter((domain) => domain.enabled);
      expect(qualifying.length).toBeGreaterThan(0);
      for (const domain of qualifying) {
        expect(domain.status).toBe("reviewed");
        expect(["student", "institutional"]).toContain(domain.kind);
        expect(domain.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it("never enables alumni or shared mappings", () => {
    const domains = directory.campuses.flatMap((campus) => campus.domains);
    expect(domains.filter((domain) => ["alumni", "shared"].includes(domain.kind)).every((domain) => !domain.enabled)).toBe(true);
    expect(directory.campuses.find((campus) => campus.slug === "purdue-university-west-lafayette")?.status).toBe("disabled");
    expect(directory.campuses.find((campus) => campus.slug === "university-of-michigan-ann-arbor")?.status).toBe("disabled");
  });

  it("has no duplicate active exact domain", () => {
    const active = directory.campuses.flatMap((campus) => campus.domains.filter((domain) => domain.enabled).map((domain) => domain.domain));
    expect(new Set(active).size).toBe(active.length);
  });

  it("keeps the transactional migration aligned with the reviewed data file", () => {
    for (const campus of directory.campuses) {
      expect(migration).toContain(`'${campus.slug}'`);
      for (const domain of campus.domains) {
        expect(migration).toContain(`'${domain.domain}'`);
        expect(migration).toContain(domain.sourceUrl);
      }
    }
  });
});

describe("comprehensive institution directory", () => {
  it("pins the complete reviewed HD2024 artifact", () => {
    expect(institutionArtifact.source).toContain("Integrated Postsecondary Education Data System");
    expect(institutionArtifact.sourceYear).toBe(2024);
    expect(institutionArtifact.sourceUrl).toBe("https://nces.ed.gov/ipeds/datacenter/data/HD2024.zip");
    expect(institutionArtifact.csvSha256).toBe("d7b20e136fd971d7dce8ad6ec9b7002f0f281f133959f2c3a6c089a5a4610fe5");
    expect(institutionArtifact.institutionCount).toBe(6072);
    expect(institutionArtifact.institutions).toHaveLength(6072);
  });

  it("retains unique active, closed, and merged institution identities", () => {
    expect(new Set(institutionArtifact.institutions.map(({ id }) => id)).size).toBe(6072);
    expect(institutionArtifact.institutions.find(({ id }) => id === "ipeds:171100")?.name).toBe("Michigan State University");
    expect(institutionArtifact.institutions.find(({ id }) => id === "ipeds:100937")?.status).toBe("closed");
    expect(institutionArtifact.institutions.find(({ id }) => id === "ipeds:500139")?.mergedIntoId).toBe("ipeds:243780");
  });

  it("embeds the reviewed source in the forward migration", () => {
    expect(institutionMigration).toContain("-- BEGIN GENERATED IPEDS HD2024 DATA");
    expect(institutionMigration).toContain('"id":"ipeds:171100"');
    expect(institutionMigration).toContain('"id":"ipeds:500139"');
    expect(institutionMigration).toContain(institutionArtifact.csvSha256);
  });
});
