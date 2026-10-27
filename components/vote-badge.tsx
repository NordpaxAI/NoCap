import type { MyVoteStatus } from "@/lib/area-data";

// Shown only to members on the vote's frozen electorate.
export function VoteBadge({ status, choice }: { status: MyVoteStatus; choice: string | null }) {
  if (status === "to_vote") {
    return (
      <>
        <span className="dot" />
        <span className="tag now">To vote</span>
      </>
    );
  }
  if (status === "voted") {
    return (
      <>
        <span className="dot" />
        <span className="tag">Voted{choice ? ` · You voted: ${choice}` : ""}</span>
      </>
    );
  }
  return null;
}
