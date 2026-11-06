import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { inviteMember, setMemberStatus, setRegistration } from "@/lib/actions";
import { REGISTER_URL, registrationState } from "@/lib/registration";
import { formatShort } from "@/lib/time";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

export const metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; invited?: string; registration?: string }> }) {
  await requireAdmin();
  const { error, invited, registration } = await searchParams;
  const state = await registrationState();
  const { rows: registered } = await pool.query<{
    id: string;
    display_name: string;
    email: string;
    status: string;
    created_at: string;
  }>(
    `SELECT id, display_name, email, status, created_at FROM profiles
     WHERE joined_via = 'register' AND NOT is_example AND email NOT LIKE '%@example.invalid'
     ORDER BY created_at`,
  );
  const activeRegistered = registered.filter((m) => m.status === "active").length;
  const { rows } = await pool.query<{
    id: string;
    display_name: string;
    email: string;
    role: string;
    status: string;
  }>(`SELECT id, display_name, email, role, status FROM profiles ORDER BY status, display_name`);
  return (
    <>
      <h1 className="page-title">Members</h1>
      <p className="help">One admin role, shared by the chair and the technical lead. Invite a member and they receive a link to set a password. Deactivating someone hides them from the public page. Their questions, comments and votes stay.</p>
      {invited ? <p className="banner">Invite sent.</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <ActionForm action={inviteMember} className="stack">
        <div>
          <label className="lbl" htmlFor="name">Name</label>
          <input id="name" name="name" required />
        </div>
        <div>
          <label className="lbl" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>
        <SubmitButton className="btn solid">Send invite</SubmitButton>
      </ActionForm>
      <table style={{ marginTop: 28 }}>
        <thead>
          <tr><th>Name</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((member) => (
            <tr key={member.id}>
              <td>
                {member.display_name}
                <div className="by">{member.email} · {member.role}</div>
              </td>
              <td>{member.status}</td>
              <td>
                {member.status === "active" ? (
                  <ActionForm action={setMemberStatus}>
                    <input type="hidden" name="profile_id" value={member.id} />
                    <input type="hidden" name="status" value="deactivated" />
                    <SubmitButton className="act">Deactivate</SubmitButton>
                  </ActionForm>
                ) : null}
                {member.status === "deactivated" ? (
                  <ActionForm action={setMemberStatus}>
                    <input type="hidden" name="profile_id" value={member.id} />
                    <input type="hidden" name="status" value="active" />
                    <SubmitButton className="act">Reactivate</SubmitButton>
                  </ActionForm>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section id="registration" style={{ marginTop: 36 }}>
        <h2 className="page-title" style={{ fontSize: "1.4em" }}>Open registration</h2>
        <p className="help">While registration is open, anyone with the link can register. Share it with the members. Close registration once everyone is in; after that new people join only by invite.</p>
        {registration ? <p className="banner">Registration settings saved.</p> : null}
        <p>
          Status: <strong>{state.open ? "Open" : "Closed"}</strong>
        </p>
        <p>Link: <a href={REGISTER_URL}>{REGISTER_URL}</a></p>
        <ActionForm action={setRegistration}>
          <input type="hidden" name="mode" value={state.open ? "close" : "open"} />
          <SubmitButton className="btn solid">{state.open ? "Close registration" : "Open registration"}</SubmitButton>
        </ActionForm>
        <p style={{ marginTop: 18 }}><strong>{activeRegistered}</strong> member{activeRegistered === 1 ? "" : "s"} registered with the link.</p>
        {registered.length ? (
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              {registered.map((member) => (
                <tr key={member.id}>
                  <td>{member.display_name}</td>
                  <td>{member.email}</td>
                  <td>{formatShort(member.created_at)}</td>
                  <td>
                    {member.status === "active" ? (
                      <ActionForm action={setMemberStatus}>
                        <input type="hidden" name="profile_id" value={member.id} />
                        <input type="hidden" name="status" value="deactivated" />
                        <SubmitButton className="act">Deactivate</SubmitButton>
                      </ActionForm>
                    ) : (
                      member.status
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
      <p style={{ marginTop: 22 }}><a href="/area/publications/new">Add a publication</a></p>
      <p><a href="/area/applications">Applications</a></p>
      <p><a href="/area/admin/messages">Contact messages</a></p>
      <p><a href="/area/admin/profiles">Public profiles (Members page)</a></p>
      <p><a href="/area/admin/outbox">Email outbox</a></p>
    </>
  );
}
