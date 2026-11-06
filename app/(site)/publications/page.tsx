import Link from "next/link";
import { publicRows } from "@/lib/public-data";
import { formatWhen } from "@/lib/time";

export const revalidate = 300;

export const metadata = { title: "Publications" };

export default async function PublicationsPage() {
  const rows = await publicRows<{
    slug: string;
    title: string;
    category: string;
    summary: string;
    published_on: Date;
    display_name: string | null;
    city: string | null;
  }>(`SELECT pub.slug, pub.title, pub.category, pub.summary, pub.published_on,
            p.display_name, p.city
     FROM publications pub
     LEFT JOIN profiles p ON p.id = pub.author_id
     ORDER BY pub.published_on DESC`);
  return (
    <div className="wrap inner">
      <div className="eyebrow">Publications</div>
      <h1 className="pt">Written by members, for people who do the work.</h1>
      <p className="about-lede">
        Articles, interviews and cross-border reads on deal features, structuring quirks, legislative developments and market trends, each one under the name of the member behind it.
      </p>
      <div className="pubs-grid">
        {rows.map((row) => (
          <Link className="pub-card" href={`/publications/${row.slug}`} key={row.slug}>
            <div className="pub-kicker">{row.category}</div>
            <h3>{row.title}</h3>
            <p>{row.summary}</p>
            <div className="pub-by">
              <b>{row.display_name || "A member"}</b>
              {row.city ? ` · ${row.city}` : ""} · {formatWhen(row.published_on, false)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
