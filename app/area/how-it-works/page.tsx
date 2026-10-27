export const metadata = { title: "How it works" };

export default function HowItWorksPage() {
  return (
    <>
      <h1 className="page-title">How it works</h1>
      <p className="help">A short guide to the members&apos; area. The rules below are the ones this demo enforces.</p>

      <h2>Documents</h2>
      <p className="help">
        An admin uploads the official register: the charter, the code of conduct, minutes and resolutions. A resolution cannot be edited or deleted after it is uploaded. Any member can add a file to the shared folder. At the foot of Documents, any member can download a zip of every version and the resolutions register.
      </p>

      <h2>Questions</h2>
      <p className="help">
        Any member can open a question. Replies are comments, and a deadline is optional. With no deadline the question stays open. Once a deadline has passed it is marked closed. Opening a question notifies the other members. A reply notifies the member who opened the question. You are not notified about something you posted yourself. The author can still send a manual reminder. The member who asked a question can delete it, including after the deadline. The page asks “Delete this question? This cannot be undone.” Deleting it removes the replies, the attachments and the bell entries, so those links do not remain.
      </p>

      <h2>Votes</h2>
      <p className="help">
        Only an admin opens a vote. It has to stay open for longer than 48 hours, so a reminder can go out 48 hours before the deadline and again 24 hours before, to members who have not voted. Admins receive those reminders as well, with the names of who is still outstanding. Eligible voters are the active members at the moment the vote opens, and that list does not change afterwards. While the vote is open, everyone can see who voted what. A vote cannot be changed once it is cast. The admin who opened a vote can delete it while it is still open. The page asks “Delete this vote? This cannot be undone.” That removes the ballots, the options, the attachments and the bell entries, including reminders that have already been sent. A later reminder is not sent, because the vote is gone. If that admin is no longer on the list, any admin can delete the open vote. A closed vote cannot be edited or deleted.
      </p>
      <p className="help">
        The constitutive quorum is the minimum share of eligible voters who must take part. Abstentions count as participation. If fewer people vote than that share requires, the vote does not pass because the constitutive quorum (minimum participation) was not reached.
      </p>
      <p className="help">
        The deliberative quorum (majority) is the minimum share of For among For and Against votes. Abstentions are not part of that count; they count for the constitutive quorum only. If enough people voted, but the share in favour is too low, the vote does not pass because the majority was not reached. The page and the PDF record state which of the two it was.
      </p>
      <p className="help">
        A poll is the other kind of vote. The admin writes between 2 and 10 options. Each voter picks one, unless the admin allows more than one. There is no abstain option. A member who does not answer has not voted, and still counts as outstanding for reminders. The constitutive quorum still applies. The deliberative quorum does not. The result is the count for each option, and that count as a share of the people who voted. If two or more options share the highest count, the record says it is a tie. If the constitutive quorum is not reached, the record says so. A poll is not entered in the resolutions register. Its record is the vote page and the PDF.
      </p>

      <h2>Notifications</h2>
      <p className="help">
        The bell and email carry the same news: a question opened, a reply to a question you opened, a vote opened, the two reminders, and the outcome when a vote closes. Each item opens that question or vote directly. The number on the bell clears when you open the panel.
      </p>
    </>
  );
}