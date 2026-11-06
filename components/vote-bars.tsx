type Props = {
  eligible: number;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  participants?: number;
  quorum: number;
  majority: number;
  poll?: boolean;
  compact?: boolean;
};

const AMBER = "#d99a1e";
const GREEN = "#2f8f4e";
const RED = "#c0392b";
const GREY = "#9a9a9a";

function pct(n: number): string {
  return `${Math.round(n * 100) / 100}%`;
}

function Bar({ value, marker, color, compact }: { value: number; marker: number; color: string; compact?: boolean }) {
  const h = compact ? 6 : 10;
  return (
    <div style={{ position: "relative", height: h, background: "rgba(0,0,0,0.08)", borderRadius: h, margin: compact ? "3px 0" : "6px 0", overflow: "visible" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", background: color, borderRadius: h }} />
      <div
        aria-hidden
        style={{ position: "absolute", left: `${Math.min(100, Math.max(0, marker))}%`, top: -3, bottom: -3, width: 2, background: "#111", transform: "translateX(-1px)" }}
      />
    </div>
  );
}

export function VoteBars({ eligible, forCount, againstCount, abstainCount, participants, quorum, majority, poll, compact }: Props) {
  const voted = participants ?? forCount + againstCount + abstainCount;
  const share = eligible > 0 ? (voted * 100) / eligible : 0;
  // Same rule as close_vote: voted*100 >= eligible*quorum, and eligible > 0.
  const quorumMet = eligible > 0 && voted * 100 >= eligible * quorum;
  const needed = eligible > 0 ? Math.max(0, Math.ceil((eligible * quorum) / 100 - 1e-9) - voted) : 0;
  const decided = forCount + againstCount;
  const forShare = decided > 0 ? (forCount * 100) / decided : 0;
  // Migration 013: For*100 >= (For+Against)*majority, fails when For+Against = 0.
  const passing = decided > 0 && forCount * 100 >= decided * majority;
  const majorityColor = decided === 0 ? GREY : passing ? GREEN : RED;
  const small = { fontSize: compact ? 12 : 13, color: "#555" } as const;

  return (
    <div style={{ margin: compact ? "6px 0" : "14px 0" }}>
      <div style={small}>
        <strong>Constitutive quorum</strong> {pct(quorum)} · {voted} of {eligible} voted ({Math.round(share)}%)
        {poll ? "" : " · abstentions count"}
        {" · "}
        {quorumMet ? <span style={{ color: GREEN }}>Quorum reached</span> : <span style={{ color: AMBER }}>{needed} more vote{needed === 1 ? "" : "s"} needed</span>}
      </div>
      <Bar value={share} marker={quorum} color={quorumMet ? GREEN : AMBER} compact={compact} />
      {poll ? null : (
        <>
          <div style={{ ...small, marginTop: compact ? 4 : 10 }}>
            <strong>Majority</strong> {pct(majority)} For · {forCount} For · {againstCount} Against
            {decided > 0 ? ` (${Math.round(forShare)}%)` : ""}
            {abstainCount > 0 ? ` · ${abstainCount} Abstain not counted` : ""}
            {" · "}
            <span style={{ color: majorityColor }}>{decided === 0 ? "No For/Against votes yet" : passing ? "Passing" : "Not passing"}</span>
          </div>
          <Bar value={forShare} marker={majority} color={majorityColor} compact={compact} />
        </>
      )}
    </div>
  );
}
