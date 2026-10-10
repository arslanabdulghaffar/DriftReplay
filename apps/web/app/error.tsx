"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="error-state" aria-labelledby="error-title">
      <p className="eyebrow">PHASE 1 FOUNDATION / DISPLAY ERROR</p>
      <h1 id="error-title">This page could not be displayed.</h1>
      <p>
        Try loading it again or return to the overview. MercuryPay is synthetic; this display error
        is not a runtime reproduction result.
      </p>
      <div className="error-actions">
        <button className="button button-primary" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="button button-secondary" href="/">
          Return to overview
        </Link>
      </div>
    </section>
  );
}
