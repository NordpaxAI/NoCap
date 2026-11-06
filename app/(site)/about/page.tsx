export const revalidate = 300;

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="wrap inner">
      <div className="eyebrow">About</div>
      <h1 className="pt">A circle, not a network.</h1>
      <p className="about-lede">
        nocap is a private circle of deal lawyers from different jurisdictions. Small on purpose, by invitation, and built by the people in it.
      </p>
      <div className="about-list">
        <div className="about-item">
          <h3>What the name means</h3>
          <p>
            The name reads two ways. At the deal table, the cap limits a party&apos;s liability under the transaction documents. Everywhere else, “no cap” means “for real”. Put together, that&apos;s us: deal lawyers, straight up.
          </p>
        </div>
        <div className="about-item">
          <h3>Where we come from</h3>
          <p>
            nocap started with lawyers from different jurisdictions who met on deals and off them, and came to trust each other. We decided to build something around it.
          </p>
        </div>
        <div className="about-item">
          <h3>What we&apos;re for</h3>
          <p>
            To build genuine relationships between the people who will be running transactions for the next twenty years, and to make those relationships valuable: shared knowledge, a name of your own and time spent together.
          </p>
        </div>
        <div className="about-item">
          <h3>Why it matters</h3>
          <p>
            Cross-border practice runs on trust, and trust takes time to build. We are an association of individuals, small on purpose, where membership belongs to the member and not to the firm.
          </p>
        </div>
      </div>
    </div>
  );
}
