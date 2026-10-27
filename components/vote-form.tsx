"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { openVote } from "@/lib/actions";

const STANDARD_HELP =
  "The list of eligible voters freezes when you open the vote. A vote must stay open for longer than 48 hours, so a reminder can go out 48 hours before the deadline and again 24 hours before. Set both quorums now. The constitutive quorum is the share of eligible voters who must vote for the result to be valid. Abstentions count as participation. Example: 11 members and 50% means at least 6 must vote. The deliberative quorum (majority) is the share of For among For and Against only; abstentions count for the constitutive quorum only. Example: 80% means 70% in favour does not pass. Decimals are allowed: two thirds = 66.67. If the vote does not pass, the record states whether the constitutive quorum or the majority was not reached.";

const POLL_HELP =
  "The list of eligible voters freezes when you open the poll. It must stay open for longer than 48 hours, so a reminder can go out 48 hours before the deadline and again 24 hours before. Add 2 to 10 options. Each voter picks one, unless you allow multiple answers. There is no abstain choice: a member who does not answer has not voted. The constitutive quorum is the share of eligible voters who must vote for the result to count. Example: 11 members and 50% means at least 6 must answer. The deliberative quorum does not apply to a poll. The result is the number of ballots for each option, and that number as a share of the people who voted. If two or more options share the highest count, the record shows a tie. If fewer people vote than the constitutive quorum requires, the record says the constitutive quorum was not reached. Choices are public and cannot be changed once cast.";

export function VoteForm({ earliest, members }: { earliest: string; members: { id: string; name: string }[] }) {
  const [kind, setKind] = useState<"standard" | "poll">("standard");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const poll = kind === "poll";

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? value : option)));
  }

  function move(index: number, direction: -1 | 1) {
    setOptions((current) => {
      const next = index + direction;
      if (next < 0 || next >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  return (
    <ActionForm action={openVote} className="stack">
      <fieldset className="plain">
        <legend className="lbl">Vote type</legend>
        <label className="choice-line">
          <input
            id="kind-standard"
            type="radio"
            name="kind"
            value="standard"
            checked={kind === "standard"}
            onChange={() => setKind("standard")}
          />
          <span>Standard (For/Against/Abstain)</span>
        </label>
        <label className="choice-line">
          <input
            id="kind-poll"
            type="radio"
            name="kind"
            value="poll"
            checked={kind === "poll"}
            onChange={() => setKind("poll")}
          />
          <span>Poll (custom options)</span>
        </label>
      </fieldset>
      <p className="help">{poll ? POLL_HELP : STANDARD_HELP}</p>
      <div>
        <label className="lbl" htmlFor="subject">Subject</label>
        <input id="subject" name="subject" required />
      </div>
      <div>
        <label className="lbl" htmlFor="description">Description</label>
        <textarea id="description" name="description" required />
      </div>
      <div>
        <label className="lbl" htmlFor="deadline">Deadline</label>
        <input id="deadline" name="deadline" type="datetime-local" step={1} min={earliest} required />
      </div>
      <div>
        <label className="lbl" htmlFor="quorum_constitutive">Constitutive quorum (%)</label>
        <input id="quorum_constitutive" name="quorum_constitutive" type="number" min="0" max="100" step="0.01" required defaultValue={50} />
        <p className="help">Decimals allowed, e.g. two thirds = 66.67.</p>
      </div>
      {poll ? null : (
        <div id="deliberative-field">
          <label className="lbl" htmlFor="quorum_deliberative">Deliberative quorum (%)</label>
          <input id="quorum_deliberative" name="quorum_deliberative" type="number" min="0" max="100" step="0.01" required defaultValue={50} />
          <p className="help">Calculated on For and Against only. Decimals allowed, e.g. two thirds = 66.67.</p>
        </div>
      )}
      {poll ? (
        <div>
          <span className="lbl">Options</span>
          <div className="stack">
            {options.map((option, index) => (
              <div className="opt-row" key={index}>
                <input
                  id={`option-${index}`}
                  name="option_label"
                  value={option}
                  aria-label={`Option ${index + 1}`}
                  required
                  maxLength={120}
                  onChange={(event) => updateOption(index, event.target.value)}
                />
                <button className="act" type="button" disabled={index === 0} onClick={() => move(index, -1)}>Up</button>
                <button className="act" type="button" disabled={index === options.length - 1} onClick={() => move(index, 1)}>Down</button>
                <button
                  className="act"
                  type="button"
                  disabled={options.length <= 2}
                  onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {options.length < 10 ? (
            <button className="nudge" type="button" onClick={() => setOptions((current) => [...current, ""])}>
              Add an option
            </button>
          ) : (
            <p className="help">A poll can have at most 10 options.</p>
          )}
          <label className="choice-line" style={{ marginTop: 14 }}>
            <input
              id="allow_multiple"
              type="checkbox"
              name="allow_multiple"
              value="on"
              checked={multiple}
              onChange={(event) => setMultiple(event.target.checked)}
            />
            <span>Allow multiple answers</span>
          </label>
        </div>
      ) : null}
      {members.length ? (
        <fieldset className="plain">
          <legend className="lbl">Exclude members (optional)</legend>
          <p className="help">Excluded members are left out of the frozen list of eligible voters: they cannot vote and do not count for the quorum. This is shown on the vote page and in the record.</p>
          {members.map((member) => (
            <label className="choice-line" key={member.id}>
              <input type="checkbox" name="exclude" value={member.id} />
              <span>{member.name}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div>
        <label className="lbl" htmlFor="attachments">Attachments</label>
        <input id="attachments" name="attachments" type="file" multiple />
      </div>
      <SubmitButton id="open-vote" className="btn solid">Open the vote</SubmitButton>
    </ActionForm>
  );
}
