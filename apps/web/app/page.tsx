import Link from "next/link";
import { v1, v2 } from "../components/fixture-data";
import { Icon } from "../components/icons";
import { Badge, PageHeader, ScopeNote, SectionTitle, TextLink } from "../components/ui";

export default function OverviewPage() {
  const baselinePath = Object.keys(v1.paths)[0];
  const changedPath = Object.keys(v2.paths)[0];

  return (
    <>
      <PageHeader
        eyebrow="YOUR INTEGRATION WORKSPACE"
        title="Make API changes explainable."
        description="A focused workspace for tracing upstream contract changes to consumer code—and, in later phases, reproducible proof."
        action={
          <Link className="button button-primary" href="/fixtures/mercurypay">
            Explore the fixture
            <Icon name="arrow" size={17} />
          </Link>
        }
      />
      <ScopeNote />
      <div className="overview-grid">
        <section className="panel fixture-overview">
          <div className="panel-heading">
            <div className="fixture-title">
              <span className="provider-logo" aria-hidden="true">
                M<span>↗</span>
              </span>
              <div>
                <div className="inline-title">
                  <h2>MercuryPay</h2>
                  <Badge tone="teal">Synthetic fixture</Badge>
                </div>
                <p>Payment API · Curated migration case</p>
              </div>
            </div>
            <span className="subtle-label">OPENAPI {v1.openapi}</span>
          </div>
          <div className="contract-transition">
            <div>
              <span className="micro-label">BASELINE CONTRACT</span>
              <div className="endpoint">
                <span className="method">POST</span>
                <code>{baselinePath}</code>
              </div>
              <div className="field-chip">
                <span className="field-dot" />
                customer_email
              </div>
            </div>
            <span className="transition-arrow" aria-hidden="true">
              <Icon name="arrow" size={22} />
            </span>
            <div>
              <span className="micro-label">CHANGED CONTRACT</span>
              <div className="endpoint">
                <span className="method">POST</span>
                <code>{changedPath}</code>
              </div>
              <div className="field-chip">
                <span className="field-dot" />
                customer.email
              </div>
            </div>
          </div>
          <div className="change-summary">
            <span className="change-indicator" aria-hidden="true" />
            <p>
              <strong>A new route. A nested customer field.</strong> The synthetic v2 mock retires
              the charge route; its contract defines a payment request. Their migration relationship
              is curated ground truth.
            </p>
          </div>
          <div className="panel-footer">
            <span>Source: checked-in fixture JSON</span>
            <TextLink href="/fixtures/mercurypay">Inspect contracts</TextLink>
          </div>
        </section>
        <section className="panel scope-card">
          <div className="section-kicker">
            <Icon name="status" />
            <span>CURRENT SCOPE</span>
          </div>
          <h2>
            The foundation,
            <br />
            made inspectable.
          </h2>
          <p>
            Browse the contract pair, fixed business inputs, and evidence definitions. Analysis and
            execution arrive in later phases.
          </p>
          <ul className="scope-list">
            <li>
              <Icon name="file" size={16} />
              <span>Local fixture sources</span>
            </li>
            <li>
              <Icon name="evidence" size={16} />
              <span>Defined proof requirements</span>
            </li>
            <li>
              <Icon name="link" size={16} />
              <span>No external integrations</span>
            </li>
          </ul>
          <TextLink href="/status">View phase boundaries</TextLink>
        </section>
      </div>
      <section className="proof-section">
        <SectionTitle
          title="The intended proof chain"
          description="A plan for later phases. These are evidence requirements, not observed run results."
          aside={<Badge>Execution not run</Badge>}
        />
        <div className="proof-chain">
          {[
            {
              number: "01",
              title: "Pin the sources",
              text: "Contract versions and consumer source identified by digest.",
              state: "Fixture sources defined",
            },
            {
              number: "02",
              title: "Map the usage",
              text: "Connect supported contract changes to exact consumer code.",
              state: "Analysis not run",
            },
            {
              number: "03",
              title: "Reproduce the failure",
              text: "Same business case: baseline pass, changed version fail.",
              state: "Runtime not run",
            },
            {
              number: "04",
              title: "Verify the repair",
              text: "Same assertions pass with a bounded, reviewed patch.",
              state: "Verification not run",
            },
          ].map((step) => (
            <article className="proof-step" key={step.number}>
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <span className="step-state">{step.state}</span>
            </article>
          ))}
        </div>
      </section>
      <div className="bottom-callout">
        <div className="callout-icon">
          <Icon name="evidence" size={23} />
        </div>
        <div>
          <h2>Every claim needs a source.</h2>
          <p>
            A structural change is a hypothesis about impact. Runtime evidence must be earned
            independently.
          </p>
        </div>
        <TextLink href="/evidence">Read the evidence policy</TextLink>
      </div>
    </>
  );
}
