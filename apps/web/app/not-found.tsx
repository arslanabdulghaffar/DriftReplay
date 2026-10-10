import Link from "next/link";
import { PageHeader, ScopeNote } from "../components/ui";

export default function NotFound() {
  return (
    <>
      <PageHeader
        eyebrow="404 / PAGE NOT FOUND"
        title="This page is not in the workspace."
        description="The Phase 1 foundation contains the overview, MercuryPay fixture, evidence requirements, and phase status."
      />
      <ScopeNote />
      <Link className="button button-primary" href="/">
        Return to overview
      </Link>
    </>
  );
}
