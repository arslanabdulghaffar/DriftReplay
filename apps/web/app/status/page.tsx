import type { Metadata } from "next";
import { Badge, PageHeader, ScopeNote, SectionTitle, TextLink } from "../../components/ui";

export const metadata: Metadata = { title: "Phase status" };

const boundaries = [
  {
    capability: "Fixture inspection",
    scope: "Current foundation",
    detail: "Read checked-in synthetic contracts, inputs, assertions, mapping, and manifest.",
  },
  {
    capability: "Contract diff and code mapping",
    scope: "Local CLI available",
    detail:
      "Phase 2 produces deterministic local reports with exact source citations. This static dashboard does not run or display live analyses.",
  },
  {
    capability: "Durable workflows and storage",
    scope: "Later phase",
    detail: "No hosted database, job scheduler, or cloud storage connection.",
  },
  {
    capability: "Fixture runtime replay",
    scope: "Not run",
    detail: "No baseline PASS, changed-version FAIL, or patched PASS claim.",
  },
  {
    capability: "GitHub integration",
    scope: "Not connected",
    detail: "No installed GitHub App, repository access, or webhook processing.",
  },
  {
    capability: "Patch generation and publication",
    scope: "Not enabled",
    detail: "No generated migration, branch, pull request, merge, or deployment.",
  },
  {
    capability: "Model execution",
    scope: "Model off",
    detail: "No model credentials, inference requests, or paid agent runs.",
  },
];

export default function StatusPage() {
  return (
    <>
      <PageHeader
        eyebrow="PROJECT / PHASE STATUS"
        title="A deliberate starting point."
        description="Phase 1 is the local foundation. The boundaries below keep the interface honest about what is available and what requires later authorization."
        action={<Badge tone="teal">Phase 1 foundation</Badge>}
      />
      <ScopeNote />
      <div className="status-intro">
        <div>
          <span className="micro-label">CURRENT PHASE</span>
          <h2>
            01<span>Foundation</span>
          </h2>
        </div>
        <p>
          Source fixtures and a local dashboard establish a reviewable starting point. This page
          describes application scope; it is not a build report or a claim that Phase 1 acceptance
          checks have passed.
        </p>
      </div>
      <section className="content-section">
        <SectionTitle
          title="Capability boundaries"
          description="No integration or execution status is simulated."
        />
        <div className="capability-list">
          {boundaries.map((item) => (
            <article className="capability-row" key={item.capability}>
              <div>
                <h3>{item.capability}</h3>
                <p>{item.detail}</p>
              </div>
              <Badge tone={item.scope === "Current foundation" ? "teal" : "neutral"}>
                {item.scope}
              </Badge>
            </article>
          ))}
        </div>
      </section>
      <div className="two-column content-section">
        <section className="panel padded-panel">
          <span className="eyebrow">NEXT DEPENDENCY</span>
          <h2>Deterministic analysis</h2>
          <p className="body-copy">
            A later phase can turn pinned OpenAPI inputs into supported structural changes and exact
            TypeScript source citations. Unsupported cases must remain explicit.
          </p>
          <TextLink href="/evidence">Review evidence requirements</TextLink>
        </section>
        <section className="panel padded-panel">
          <span className="eyebrow">HUMAN CONTROL</span>
          <h2>Authorization is a boundary</h2>
          <p className="body-copy">
            Repository access, executable fixtures, patch generation, and publication require their
            own defined approval scopes. Browsing this foundation grants none of those permissions.
          </p>
          <TextLink href="/fixtures/mercurypay">Inspect the synthetic case</TextLink>
        </section>
      </div>
    </>
  );
}
