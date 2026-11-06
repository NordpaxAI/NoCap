export const revalidate = 300;

export default function HomePage() {
  return (
    <section className="home">
      <div className="home-grad" />
      <div className="wrap home-inner">
        <img className="home-mark" src="/brand/mark-navy.png" alt="nocap" />
        <div className="home-tag">NextGen International Deal Lawyers</div>
        <div className="home-rule" />
        <p className="home-desc">
          A private international circle for the next generation of lawyers working on M&amp;A, private equity, venture capital and corporate transactions. Small by design, by invitation, and built by its members.
        </p>
      </div>
    </section>
  );
}
