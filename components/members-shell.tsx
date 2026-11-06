import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AreaNav } from "@/components/area-nav";
import { SubmitButton } from "@/components/submit-button";
import { logout } from "@/lib/actions";
import { initials, type Member } from "@/lib/auth";
import { NotificationBell, type BellItem } from "./notification-bell";

const LINKS = [
  { href: "/area", label: "Dashboard" },
  { href: "/area/documents", label: "Documents" },
  { href: "/area/votes", label: "Votes" },
  { href: "/area/questions", label: "Questions" },
];

export function MembersShell({
  user,
  notifications,
  unread,
  hasArticle = false,
  pendingVotes = 0,
  children,
}: {
  user: Member;
  notifications: BellItem[];
  unread: number;
  hasArticle?: boolean;
  pendingVotes?: number;
  children: React.ReactNode;
}) {
  const counted = LINKS.map((link) =>
    link.href === "/area/votes" && pendingVotes > 0 ? { ...link, label: `Votes (${pendingVotes})` } : link,
  );
  const base = hasArticle ? [...counted, { href: "/area/article", label: "Your article" }] : counted;
  const links =
    user.role === "admin"
      ? [...base, { href: "/area/admin", label: "Admin" }, { href: "/area/admin/articles", label: "Articles" }, { href: "/area/admin/profiles", label: "Profiles" }, { href: "/area/admin/messages", label: "Messages" }, { href: "/area/admin/outbox", label: "Outbox" }]
      : base;
  return (
    <div className="mem">
      <div className="wrap">
        <header>
          <div className="bar">
            <div className="brand">
              <Link href="/area" aria-label="nocap members' area">
                <img className="mark-img" src="/brand/mark-navy.png" alt="nocap" />
              </Link>
            </div>
            <div className="me">
              <Link href="/area/profile">
                <span className="name">{user.display_name}</span>
              </Link>
              <NotificationBell unread={unread} items={notifications} />
              <Link href="/area/profile" className="avatar" aria-label="Your profile">
                {user.photo_key ? (
                  <img src={`/api/photos/${user.id}?v=${encodeURIComponent(user.photo_key)}`} alt="" />
                ) : (
                  initials(user.display_name)
                )}
              </Link>
              <ActionForm action={logout}>
                <SubmitButton className="act">Sign out</SubmitButton>
              </ActionForm>
            </div>
          </div>
          <AreaNav links={links} />
        </header>
        {children}
        <p className="foot">
          <Link href="/area/how-it-works">How it works</Link>
          {" · "}
          The bell and email carry the same news. A vote cannot be changed once it is cast.
          {" "}
          <Link href="/">Public site</Link>
        </p>
      </div>
    </div>
  );
}

export function DocIcon({ folder = false }: { folder?: boolean }) {
  return folder ? (
    <svg className="ico" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 5h6l2 2h8v10H2z" />
    </svg>
  ) : (
    <svg className="ico" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 2h7l3 3v13H5z" />
      <path d="M12 2v4h3" />
    </svg>
  );
}
