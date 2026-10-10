import type { Metadata } from "next";
import { sourceFiles } from "../../components/fixture-data";
import { Badge, PageHeader, ScopeNote, SectionTitle, TextLink } from "../../components/ui";
import { Icon } from "../../components/icons";

export const metadata: Metadata = { title: "Evidence requirements" };

const evidenceStates = [
  {
    label: "STRUCTURAL BREAK",
    meaning: "A supported deterministic rule identifies an incompatible contract change.",
    requirement: "Pinned contracts, rule identity, and JSON pointers.",
  },
  {
    label: "MATCHED USAGE",
    meaning: "A code citation resolves to the source bytes under analysis.",
    requirement: "Consumer revision, file digest, symbol, and line range.",
  },
  {
    label: "POTENTIAL IMPACT",
    meaning: "Contract and usage evidence support a hypothesis of affected behavior.",
    requirement: "Traceable links and explicit mapping limitations.",
  },
  {
    label: "REPRODUCED FAILURE",
    meaning: "The baseline passes and the changed version fails for the selected incompatibility.",
    requirement: "Actual execution results using the same business case.",
  },
  {
    label: "PATCH VERIFIED",
    meaning:
      "The same assertions pass with the identified repair after the failure was reproduced.",
    requirement: "Exact patch, fixed manifests, and independent verification.",
  },
  {
    label: "UNVERIFIED",
    meaning: "The available evidence is insufficient to establish a stronger claim.",
    requirement: "A visible reason and the missing evidence.",
  },
  {
    label: "NOT APPLICABLE",
    meaning:
      "No relevant usage was found within a declared analyzed scope; this does not establish safety.",
    requirement: "The exact analyzed scope, supported mapping methods, and limitations.",
  },
];

export default function EvidencePage() {
  return (
    <>
      <PageHeader
        eyebrow="EVIDENCE / REQUIREMENTS"
        title="Proof is more than a green badge."
        description="DriftReplay separates source facts, impact hypotheses, and observed behavior. This page defines the proof that future runs must supply."
      />
      <ScopeNote />
      <div className="evidence-banner">
        <div className="evidence-symbol">
          <Icon name="evidence" size={25} />
        </div>
        <div>
          <h2>No runtime evidence yet</h2>
          <p>
            Phase 1 defines the fixture and evidence contracts. No baseline, changed-version replay,
            or patched replay result is recorded here.
          </p>
        </div>
        <Badge tone="amber">NOT RUN</Badge>
      </div>
      <section className="content-section">
        <SectionTitle
          title="Evidence vocabulary"
          description="Definitions only. None of these labels is an asserted outcome for MercuryPay on this page."
        />
        <div className="evidence-table-wrap">
          <table className="evidence-table">
            <caption className="sr-only">
              Evidence definitions and requirements; these are not execution results.
            </caption>
            <thead>
              <tr>
                <th scope="col">Claim</th>
                <th scope="col">What it means</th>
                <th scope="col">Required support</th>
              </tr>
            </thead>
            <tbody>
              {evidenceStates.map((state) => (
                <tr key={state.label}>
                  <th scope="row">
                    <span className="definition-label">{state.label}</span>
                  </th>
                  <td>{state.meaning}</td>
                  <td>{state.requirement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="two-column content-section">
        <section className="panel padded-panel">
          <SectionTitle
            title="Sources you can inspect"
            description="Checked-in JSON imported by this dashboard."
          />
          <ul className="source-list">
            {sourceFiles.map((file) => (
              <li key={file.exportName}>
                <Icon name="file" size={17} />
                <span>
                  {file.label}
                  <code>@driftreplay/fixtures/{file.exportName}</code>
                </span>
              </li>
            ))}
          </ul>
          <TextLink href="/fixtures/mercurypay">Open fixture sources</TextLink>
        </section>
        <section className="panel padded-panel">
          <SectionTitle
            title="Before a verified claim"
            description="The later reproduction boundary must preserve these distinctions."
          />
          <ol className="principle-list">
            <li>
              <strong>Expected is not observed.</strong>
              <p>
                Fixture assertions describe the oracle. Only captured execution can establish an
                outcome.
              </p>
            </li>
            <li>
              <strong>Failure needs attribution.</strong>
              <p>
                A timeout, missing dependency, or broken baseline does not prove a contract
                regression.
              </p>
            </li>
            <li>
              <strong>Passing has a scope.</strong>
              <p>
                A passing fixture applies to that input and environment. It does not establish
                universal compatibility.
              </p>
            </li>
            <li>
              <strong>Unknown remains visible.</strong>
              <p>
                Unsupported analysis, ambiguous mapping, and absent proof must be recorded
                explicitly.
              </p>
            </li>
          </ol>
        </section>
      </div>
    </>
  );
}
