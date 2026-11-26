import React, { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type Client = SupabaseClient<Database>;
type Child = Database['public']['Tables']['ns_children']['Row'];
export type Connection = Database['public']['Functions']['ns_child_connections']['Returns'][number];

export function ChildInvite({ client, child, refresh }: { client: Client; child: Child; refresh: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (child.linked_user) return <p>Child account linked</p>;
  if (child.archived) return null;
  async function save(address: string | null) {
    setBusy(true);
    try {
      const { error } = await client.rpc('ns_child_invite', { profile: child.id, address });
      if (error) throw error;
      setEmail('');
      await refresh();
      setMessage(address ? 'Invitation ready. Have your child sign in or create an account with this email on their device, then accept on Today.' : 'Invitation canceled.');
    } catch (error) {
      setMessage((error as Error).message || 'Could not update invitation.');
    } finally {
      setBusy(false);
    }
  }
  return <details><summary>Link a child account</summary>
    <p>Use a separate email for {child.display_name}. The invitation appears in their NextStep account after email confirmation.</p>
    {child.invite_email && <p>{child.invite_email} · Expires {new Date(child.invite_expires!).toLocaleDateString()}</p>}
    <form onSubmit={e => { e.preventDefault(); void save(email.trim()); }}>
      <label>Child account email<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button disabled={busy}>{child.invite_email ? 'Replace invitation' : 'Create child invitation'}</button>
      {child.invite_email && <button type="button" disabled={busy} onClick={() => void save(null)}>Cancel invitation</button>}
    </form><p role="status">{message}</p></details>;
}

export function ChildConnection({ client, connections, refresh }: { client: Client; connections: Connection[]; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  async function accept(profile: string) {
    setBusy(true);
    try {
      const { error } = await client.rpc('ns_accept_child_invite', { profile });
      if (error) throw error;
      await refresh();
    } catch (error) {
      setStatus((error as Error).message || 'Unable to accept invitation.');
    } finally {
      setBusy(false);
    }
  }
  return <>{connections.map(c => <section key={c.profile}><h2>{c.linked ? 'My household' : 'Child account invitation'}</h2>
    <p>{c.child_name} · {c.household_name}{c.archived ? ' · Profile archived' : ''}</p>
    {!c.linked && <><p>Link this sign-in to your child profile? Your setup and support preferences stay private to your account.</p>
      <button disabled={busy} onClick={() => void accept(c.profile)}>Link my account</button></>}
  </section>)}{status && <p role="status">{status}</p>}</>;
}
