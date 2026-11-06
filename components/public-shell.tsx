import Link from "next/link";
import { PublicNav } from "@/components/public-nav";

function Lock() {
  return (
    <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <rect x="4" y="10.5" width="16" height="11" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pub">
      <nav className="nav">
        <div className="wrap">
          <Link href="/" aria-label="nocap home">
            <img className="nav-mark navy" src="/brand/mark-navy.png" alt="nocap" />
            <img className="nav-mark cream" src="/brand/mark-cream.png" alt="" />
          </Link>
          <PublicNav />
          <Link className="nav-priv" href="/login">
            <Lock />
            <span>Private area</span>
          </Link>
        </div>
      </nav>
      <main>{children}</main>
      <footer>
        <div className="wrap">
          <div className="foot-top">
            <div>
              <img className="foot-mark" src="/brand/mark-cream.png" alt="nocap" />
              <div className="foot-tag">NextGen International Deal Lawyers</div>
            </div>
            <div className="foot-links">
              <Link href="/about">About</Link>
              <Link href="/members">Members</Link>
              <Link href="/publications">Publications</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
          <div className="foot-bot">
            <span>A private association of individuals. Not a network of law firms.</span>
            <span>© {new Date().getFullYear()} nocap</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
