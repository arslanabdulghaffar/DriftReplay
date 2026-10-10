import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark, Icon } from "../components/icons";
import { Navigation } from "../components/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DriftReplay · Foundation", template: "%s · DriftReplay" },
  description:
    "Phase 1 foundation for DriftReplay. Inspect the synthetic MercuryPay contract fixture and its defined evidence requirements. No runtime replay has run.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="app-shell">
          <aside className="sidebar">
            <Link className="brand" href="/" aria-label="DriftReplay overview">
              <BrandMark />
              <span>
                DriftReplay<span className="brand-caption">API change intelligence</span>
              </span>
            </Link>
            <div className="workspace-label">
              <span className="workspace-icon">D</span>
              <div>
                Local workspace<small>Development foundation</small>
              </div>
            </div>
            <p className="nav-label">WORKSPACE</p>
            <Navigation />
            <div className="sidebar-footer">
              <div className="foundation-card">
                <span className="foundation-icon">
                  <Icon name="fixture" size={19} />
                </span>
                <strong>Built on evidence</strong>
                <p>Start with the contract. Keep the proof inspectable.</p>
                <Link href="/evidence">
                  Evidence requirements <span aria-hidden="true">↗</span>
                </Link>
              </div>
              <div className="sidebar-version">
                <span className="status-dot" aria-hidden="true" />
                Phase 1 foundation<span>LOCAL</span>
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <div className="topbar">
              <div className="breadcrumb">
                <span>Workspace</span>
                <span aria-hidden="true">/</span>
                <strong>Foundation</strong>
              </div>
              <div className="topbar-right">
                <span className="synthetic-label">SYNTHETIC DEMO</span>
                <span className="avatar" aria-label="Local workspace">
                  L
                </span>
              </div>
            </div>
            <main id="main-content" className="main-content" tabIndex={-1}>
              {children}
            </main>
            <footer className="main-footer">
              <span>
                DriftReplay <span aria-hidden="true">/</span> Phase 1 foundation
              </span>
              <span>MercuryPay is synthetic. Runtime replay: not run.</span>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
