import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatPollCounts, joinLabels, leadingTie } from "./poll";
import { formatWhen } from "./time";

export type VoteRecord = {
  subject: string;
  description: string;
  openedAt: Date;
  closedAt: Date;
  deadline: Date;
  quorumConstitutive: number;
  quorumDeliberative: number;
  eligibleCount: number;
  votedCount: number;
  forCount: number;
  againstCount: number;
  abstainCount: number;
  constitutiveMet: boolean;
  deliberativeMet: boolean | null;
  outcome: string;
  kind: "standard" | "poll";
  allowMultiple: boolean;
  options: { label: string; count: number }[];
  voters: { name: string; email: string; choice: string | null; castAt: Date | null }[];
  excluded: { name: string; email: string }[];
};

const OUTCOME: Record<string, string> = {
  carried: "Carried",
  not_carried: "Not carried. Majority not reached.",
  invalid: "Invalid. Constitutive quorum not reached (minimum participation).",
  recorded: "Recorded.",
};

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function buildVoteRecordPdf(record: VoteRecord): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const margin = 54;
  const pageWidth = 595;
  const pageHeight = 842;
  const maxChars = 88;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const draw = (text: string, options?: { bold?: boolean; size?: number; gap?: number }) => {
    const size = options?.size ?? 11;
    const face = options?.bold ? bold : font;
    for (const line of wrap(text, maxChars - Math.round((size - 11) * 2))) {
      if (y < margin + 20) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size, font: face, color: rgb(0.08, 0.1, 0.14) });
      y -= size + 4;
    }
    y -= options?.gap ?? 2;
  };

  draw("nocap — vote record", { bold: true, size: 16, gap: 8 });
  draw("This record states the outcome. It does not interpret it.", { size: 10, gap: 10 });
  draw(`Subject: ${record.subject}`, { bold: true, size: 13, gap: 6 });
  draw(record.description, { gap: 8 });
  draw(`Opened: ${formatWhen(record.openedAt)}`);
  draw(`Deadline: ${formatWhen(record.deadline)}`);
  draw(`Closed: ${formatWhen(record.closedAt)}`, { gap: 8 });
  draw("Eligible voters", { bold: true, size: 12, gap: 4 });
  for (const voter of record.voters) {
    const choice = voter.choice
      ? `${labelChoice(voter.choice)} — ${voter.castAt ? formatWhen(voter.castAt) : ""}`
      : "did not vote";
    draw(`${voter.name} (${voter.email}) — ${choice}`);
  }
  if (record.excluded.length) {
    y -= 4;
    draw("Excluded from this vote by the admin (not eligible, not counted for the quorum)", { bold: true, size: 12, gap: 4 });
    for (const person of record.excluded) draw(`${person.name} (${person.email})`);
  }
  y -= 6;
  const participation =
    record.eligibleCount === 0 ? 0 : Math.round((record.votedCount / record.eligibleCount) * 1000) / 10;
  draw("Quorums applied", { bold: true, size: 12, gap: 4 });
  if (record.kind === "poll") {
    draw(
      `Constitutive quorum: ${record.quorumConstitutive}% of eligible voters. ` +
        `${record.votedCount} of ${record.eligibleCount} voted (${participation}%). ` +
        `A member who does not answer has not voted. ${record.constitutiveMet ? "Met." : "Not met."}`,
    );
    draw("The deliberative quorum does not apply to a poll.", { gap: 8 });
    const counts = formatPollCounts(record.options, record.votedCount);
    const tie = record.constitutiveMet ? leadingTie(record.options) : [];
    draw(`Outcome: ${OUTCOME[record.outcome] ?? record.outcome}`, { bold: true, size: 13 });
    draw(`Counts: ${counts}.`);
    if (tie.length) draw(`Tie: ${joinLabels(tie)}.`);
    if (record.allowMultiple) {
      draw("Shares are of the people who voted. Someone who picks more than one option is counted in each option.");
    }
  } else {
    const decided = record.forCount + record.againstCount;
    const forShare = decided === 0 ? 0 : Math.round((record.forCount / decided) * 1000) / 10;
    draw(
      `Constitutive quorum: ${record.quorumConstitutive}% of eligible voters. ` +
        `${record.votedCount} of ${record.eligibleCount} voted (${participation}%). ` +
        `Abstentions count as participation. ${record.constitutiveMet ? "Met." : "Not met."}`,
    );
    draw(
      `Majority (deliberative quorum): ${record.quorumDeliberative}% For, calculated on For and Against only. ` +
        `${record.forCount} for, ${record.againstCount} against (${forShare}% for); ` +
        `${record.abstainCount} abstain, counted for the constitutive quorum only. ${record.deliberativeMet ? "Met." : "Not met."}`,
      { gap: 8 },
    );
    draw(`Outcome: ${OUTCOME[record.outcome] ?? record.outcome}`, { bold: true, size: 13 });
    draw(
      `Counts: ${record.forCount} for, ${record.againstCount} against, ${record.abstainCount} abstention` +
        (record.abstainCount === 1 ? "" : "s") +
        ".",
    );
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

export function labelChoice(choice: string): string {
  if (choice === "for") return "For";
  if (choice === "against") return "Against";
  if (choice === "abstain") return "Abstain";
  return choice;
}

export function outcomeLabel(outcome: string): string {
  return OUTCOME[outcome] ?? outcome;
}

export function failureReason(outcome: string | null): string | null {
  if (outcome === "invalid") return "Constitutive quorum not reached (minimum participation).";
  if (outcome === "not_carried") return "Majority not reached.";
  return null;
}
