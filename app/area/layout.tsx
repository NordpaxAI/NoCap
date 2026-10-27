import { MembersShell } from "@/components/members-shell";
import { loadAreaFrame } from "@/lib/auth";
import { isNextControlFlow, logServerError } from "@/lib/log";
import { runVoteMaintenance } from "@/lib/votes";
import { redirect } from "next/navigation";

export const metadata = { title: "Members' area" };
export const dynamic = "force-dynamic";

export default async function AreaLayout({ children }: { children: React.ReactNode }) {
  try {
    const frame = await loadAreaFrame();
    if (!frame) redirect("/login");
    if (frame.needsMaintenance) {
      await runVoteMaintenance().catch((error) => {
        logServerError("vote-maintenance", error);
      });
    }
    return (
      <MembersShell
        user={frame.user}
        unread={frame.unread}
        notifications={frame.notifications}
        hasArticle={frame.hasArticle}
        pendingVotes={frame.pendingVotes}
      >
        {children}
      </MembersShell>
    );
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    logServerError("area-layout", error);
    throw error;
  }
}
