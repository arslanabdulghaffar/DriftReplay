import type { Metadata } from "next";
import {
  assertions,
  businessCase,
  manifest,
  mapping,
  v1,
  v2,
} from "../../../components/fixture-data";
import { Badge, CodeBlock, PageHeader, ScopeNote, SectionTitle } from "../../../components/ui";

export const metadata: Metadata = { title: "MercuryPay fixture" };

export default function MercuryPayPage() {
  return (
    <>
      <PageHeader
        eyebrow="FIXTURE LIBRARY / MERCURYPAY"
        title="A small change. A precise case."
        description="Inspect the checked-in synthetic contract pair and the fixed inputs that later reproduction must preserve."
        action={<Badge tone="teal">Synthetic fixture</Badge>}
      />
      <ScopeNote />
      <section className="content-section">
        <SectionTitle
          title="Contract pair"
          description="Actual JSON imported from the fixture package. The baseline and changed provider versions are intentionally different."
        />
        <div className="two-column">
          <CodeBlock title="Baseline contract" label="v1 · OpenAPI" value={v1} />
          <CodeBlock title="Changed contract" label="v2 · OpenAPI" value={v2} />
        </div>
      </section>
      <section className="content-section">
        <SectionTitle
          title="Fixed business case and assertions"
          description="These define the intended customer behavior. A later repair must preserve the inputs and assertions."
          aside={<Badge>Runtime not run</Badge>}
        />
        <div className="two-column">
          <CodeBlock title="Business case" label="JSON source" value={businessCase} />
          <CodeBlock title="Assertions" label="JSON source" value={assertions} />
        </div>
      </section>
      <section className="content-section">
        <SectionTitle
          title="Curated ground truth"
          description="The mapping records the owner-specified synthetic migration. It is not an analyzer finding. Endpoint removal and addition alone do not prove a rename."
        />
        <CodeBlock title="Migration mapping" label="Curated" value={mapping} />
      </section>
      <section className="content-section">
        <details className="source-details">
          <summary>
            Inspect the fixture manifest<span>Versioned source metadata</span>
          </summary>
          <div>
            <CodeBlock title="Fixture manifest" label="JSON source" value={manifest} />
          </div>
        </details>
      </section>
    </>
  );
}
