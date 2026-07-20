"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CalendarDays, ChevronDown, Hash, Home, LockKeyhole, Megaphone, Menu, Plus, Send, Settings2, UsersRound, X } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { ReportButton } from "@/components/report-button";
import { UserAvatar } from "@/components/user-avatar";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WorkspaceAdministration } from "./workspace-administration";

type Member = { profile_id: string; handle: string; display_name: string | null; avatar_media_id: string | null; role: string; joined_at: string };
type ManagedMembership = Member & { id: string; status: string };
type Channel = { id: string; category_id: string | null; name: string; description: string; channel_type: "text" | "announcement"; visibility: "standard" | "restricted"; slow_mode_seconds: number; status: string; unreadCount: number; canView: boolean; canSend: boolean; canManageMessages: boolean; canCreateAnnouncements: boolean };
type Category = { id: string; name: string; sort_position: number };
type Role = { id: string; builtin_key: string | null; name: string; color: string; sort_position: number; authority_rank: number; permissions: string[]; is_assignable: boolean };
type PermissionOverride = { channel_id: string; role_id?: string; profile_id?: string; view_channel: boolean | null; send_messages: boolean | null; manage_messages: boolean | null; create_announcements: boolean | null };
type RoleAssignment = { role_id: string; profile_id: string };
type ViewerCapabilities = { can_manage_roles: boolean; can_assign_roles: boolean; can_manage_channels: boolean; can_view_audit: boolean };
type Message = { id: string; author_profile_id: string | null; parent_message_id: string | null; body: string | null; edited_at: string | null; deleted_at: string | null; created_at: string; author: { handle?: string; display_name?: string | null; avatar_media_id?: string | null } | null };
type Organization = {
  id: string; slug: string; name: string; description: string; rules: string; organization_type: string; visibility: string; membership_policy: string;
  member_count: number; website_url: string | null; avatar_media_id: string | null; banner_media_id: string | null; is_read_only: boolean;
  campuses: { name?: string; short_name?: string } | Array<{ name?: string; short_name?: string }>;
  members: Member[]; membershipQueue: ManagedMembership[]; viewerMembership: { profile_id: string; role: string; status: string } | null;
  viewerCapabilities: ViewerCapabilities | null;
  upcomingEvents: Array<{ id: string; title: string; location: string; starts_at: string; cancelled_at: string | null }>;
  recentPosts: Array<{ id: string; body: string; reaction_count: number; comment_count: number; created_at: string }>;
};

function campusName(value: Organization["campuses"]) {
  const campus = Array.isArray(value) ? value[0] : value;
  return campus?.short_name ?? campus?.name ?? "Campus Exchange";
}

export function OrganizationDetail({ slug }: { slug: string }) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleOverrides, setRoleOverrides] = useState<PermissionOverride[]>([]);
  const [memberOverrides, setMemberOverrides] = useState<PermissionOverride[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [viewerCapabilities, setViewerCapabilities] = useState<ViewerCapabilities>({ can_manage_roles: false, can_assign_roles: false, can_manage_channels: false, can_view_audit: false });
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [showHome, setShowHome] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;
  const canManage = org?.viewerMembership?.status === "active" && ["owner", "administrator"].includes(org.viewerMembership.role);
  const canAdmin = org?.viewerMembership?.status === "active" && (viewerCapabilities.can_manage_channels || viewerCapabilities.can_manage_roles || viewerCapabilities.can_assign_roles || viewerCapabilities.can_view_audit);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    const [organizationResponse, channelsResponse] = await Promise.all([
      fetch(`/api/v1/organizations/${slug}`),
      fetch(`/api/v1/organizations/${slug}/channels`),
    ]);
    const [organizationJson, channelsJson] = await Promise.all([organizationResponse.json(), channelsResponse.json()]);
    if (organizationResponse.ok) { setOrg(organizationJson.data); if (organizationJson.data.viewerCapabilities) setViewerCapabilities(organizationJson.data.viewerCapabilities); }
    else setNotice(organizationJson.error?.message ?? "Organization not found.");
    if (channelsResponse.ok) {
      setCategories(channelsJson.data.categories);
      setChannels(channelsJson.data.channels);
      setRoles(channelsJson.data.roles);
      setRoleOverrides(channelsJson.data.roleOverrides ?? []);
      setMemberOverrides(channelsJson.data.memberOverrides ?? []);
      setRoleAssignments(channelsJson.data.roleAssignments ?? []);
      if (channelsJson.data.viewerCapabilities) setViewerCapabilities(channelsJson.data.viewerCapabilities);
      setActiveChannelId((current) => { if (!current || channelsJson.data.channels.some((channel: Channel) => channel.id === current)) return current; setShowHome(true); setMessages([]); return null; });
    }
    setLoading(false);
  }, [slug]);

  const loadMessages = useCallback(async (channelId: string, cursor?: string | null) => {
    const params = new URLSearchParams({ limit: "40" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`/api/v1/organizations/${slug}/channels/${channelId}/messages?${params}`);
    const json = await response.json();
    if (!response.ok) { setNotice(json.error?.message ?? "Unable to load this channel."); return; }
    setMessages((current) => { const combined = cursor ? [...json.data.items, ...current] : [...current, ...json.data.items]; const unique = new Map(combined.map((message: Message) => [message.id, message])); return [...unique.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)); });
    setNextCursor(json.data.nextCursor);
    setChannels((current) => current.map((channel) => channel.id === channelId ? { ...channel, unreadCount: 0 } : channel));
  }, [slug]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);
  useEffect(() => {
    if (!activeChannelId || showHome) return;
    void loadMessages(activeChannelId);
    const supabase = createSupabaseBrowserClient();
    const subscription = supabase.channel(`organization:${org?.id}:channel:${activeChannelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_channel_messages", filter: `channel_id=eq.${activeChannelId}` }, () => void loadMessages(activeChannelId))
      .subscribe((status) => { if (status === "SUBSCRIBED") void loadMessages(activeChannelId); });
    return () => { void supabase.removeChannel(subscription); };
  }, [activeChannelId, loadMessages, org?.id, showHome]);
  useEffect(() => {
    if (!org?.id) return;
    const supabase = createSupabaseBrowserClient();
    const subscription = supabase.channel(`organization:${org.id}:workspace`)
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_channels", filter: `organization_id=eq.${org.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_categories", filter: `organization_id=eq.${org.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_roles", filter: `organization_id=eq.${org.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_role_assignments", filter: `organization_id=eq.${org.id}` }, () => void loadWorkspace())
      .on("postgres_changes", { event: "*", schema: "public", table: "organization_memberships", filter: `organization_id=eq.${org.id}` }, () => void loadWorkspace())
      .subscribe((status) => { if (status === "SUBSCRIBED") void loadWorkspace(); });
    return () => { void supabase.removeChannel(subscription); };
  }, [loadWorkspace, org?.id]);

  const grouped = useMemo(() => categories.map((category) => ({ ...category, channels: channels.filter((channel) => channel.category_id === category.id) })).filter((category) => category.channels.length), [categories, channels]);

  function openChannel(channelId: string) {
    setShowHome(false); setActiveChannelId(channelId); setDrawer(false); setMessages([]); setReplyTo(null);
  }

  async function membership(action: "request" | "accept" | "decline" | "cancel" | "remove") {
    const response = await fetch(`/api/v1/organizations/${slug}/memberships`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, idempotencyKey: crypto.randomUUID() }) });
    const json = await response.json();
    setNotice(response.ok ? "Membership updated." : json.error?.message ?? "Unable to update membership.");
    if (response.ok) await loadWorkspace();
  }

  async function manageMembership(profileId: string, action: "accept" | "decline" | "remove" | "ban" | "unban" | "change_role", role?: string) {
    const response = await fetch(`/api/v1/organizations/${slug}/memberships`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, profileId, ...(role ? { role } : {}), idempotencyKey: crypto.randomUUID() }) });
    const json = await response.json();
    setNotice(response.ok ? "Membership updated and audited." : json.error?.message ?? "Unable to update membership.");
    if (response.ok) await loadWorkspace();
  }

  async function inviteMember() {
    const profileHandle = window.prompt("Student username to invite");
    if (!profileHandle?.trim()) return;
    const response = await fetch(`/api/v1/organizations/${slug}/memberships`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "invite", profileHandle: profileHandle.trim().replace(/^@/, ""), role: "member", idempotencyKey: crypto.randomUUID() }) });
    const json = await response.json();
    setNotice(response.ok ? "Invitation sent." : json.error?.message ?? "Unable to send invitation.");
    if (response.ok) await loadWorkspace();
  }

  async function transferOwnership(profileId: string) {
    if (!org || org.viewerMembership?.role !== "owner") return;
    const confirmation = window.prompt(`Type ${org.name} exactly to transfer ownership. This makes you an administrator.`);
    if (confirmation !== org.name) { setNotice("Ownership transfer cancelled: confirmation did not match."); return; }
    const response = await fetch(`/api/v1/organizations/${slug}/memberships`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "transfer_ownership", profileId, confirmation, idempotencyKey: crypto.randomUUID() }) });
    const json = await response.json();
    setNotice(response.ok ? "Ownership transferred and recorded in the audit history." : json.error?.message ?? "Unable to transfer ownership.");
    if (response.ok) await loadWorkspace();
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault(); if (!activeChannel || !messageBody.trim()) return;
    const response = await fetch(`/api/v1/organizations/${slug}/channels/${activeChannel.id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: messageBody, parentMessageId: replyTo?.id ?? null, idempotencyKey: crypto.randomUUID() }) });
    const json = await response.json();
    if (!response.ok) setNotice(json.error?.message ?? "Unable to send this message.");
    else { setMessageBody(""); setReplyTo(null); await loadMessages(activeChannel.id); }
  }

  async function createChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/organizations/${slug}/channels`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoryId: form.get("categoryId") || null, name: form.get("name"), description: form.get("description"), type: form.get("type"), visibility: form.get("visibility"), slowModeSeconds: Number(form.get("slowModeSeconds") || 0), allowedRoleIds: form.getAll("allowedRoleIds"), idempotencyKey: crypto.randomUUID() }) });
    const json = await response.json();
    if (!response.ok) setNotice(json.error?.message ?? "Unable to create this channel.");
    else { setCreatingChannel(false); await loadWorkspace(); openChannel(json.data.id); }
  }

  async function createCategory() {
    const name = window.prompt("Category name");
    if (!name?.trim()) return;
    const response = await fetch(`/api/v1/organizations/${slug}/categories`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, sortPosition: categories.length * 10, idempotencyKey: crypto.randomUUID() }) });
    const json = await response.json();
    setNotice(response.ok ? "Category created and audited." : json.error?.message ?? "Unable to create category.");
    if (response.ok) await loadWorkspace();
  }

  async function manageMessage(message: Message, action: "edit" | "delete") {
    const own = message.author_profile_id === org?.viewerMembership?.profile_id;
    const submitted = action === "edit" ? window.prompt("Edit message", message.body ?? "") : null;
    if (action === "edit" && !submitted?.trim()) return;
    const reason = action === "delete" && !own ? window.prompt("Required moderation reason") : "";
    if (action === "delete" && !own && !reason?.trim()) return;
    const response = await fetch(`/api/v1/organizations/messages/${message.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, body: submitted ?? "", reason: reason ?? "" }),
    });
    const json = await response.json();
    setNotice(response.ok ? `Message ${action === "edit" ? "updated" : "deleted"}.` : json.error?.message ?? "Unable to update message.");
    if (response.ok && activeChannel) await loadMessages(activeChannel.id);
  }

  if (loading && !org) return <div className="workspace-loading" aria-live="polite">Loading organization workspace…</div>;
  if (!org) return <><Link className="back-link" href="/organizations"><ArrowLeft /> Organizations</Link><EmptyState icon={<Building2 />} title={notice || "Organization unavailable"} /></>;
  const sidebar = <aside className={`workspace-sidebar ${drawer ? "open" : ""}`}>
    <header><button className="workspace-mobile-close" aria-label="Close channel drawer" onClick={() => setDrawer(false)}><X /></button><strong>{org.name}</strong><small>{org.member_count} members</small></header>
    <button className={`workspace-channel ${showHome ? "active" : ""}`} onClick={() => { setShowHome(true); setDrawer(false); }}><Home /> Organization home</button>
    <nav aria-label="Organization channels">
      {grouped.map((category) => <section key={category.id}><h2>{category.name}<ChevronDown /></h2>{category.channels.map((channel) => <button className={`workspace-channel ${activeChannelId === channel.id && !showHome ? "active" : ""}`} key={channel.id} onClick={() => openChannel(channel.id)}>{channel.visibility === "restricted" ? <LockKeyhole /> : channel.channel_type === "announcement" ? <Megaphone /> : <Hash />}<span>{channel.name}</span>{channel.unreadCount > 0 && <em>{channel.unreadCount}</em>}</button>)}</section>)}
    </nav>
    {canAdmin && <div className="workspace-manage-actions">{viewerCapabilities.can_manage_channels && <><button className="workspace-manage" onClick={() => setCreatingChannel(true)}><Plus /> Create channel</button><button className="workspace-manage" onClick={() => void createCategory()}><Plus /> Create category</button></>}<button className="workspace-manage" onClick={() => setAdminOpen(true)}><Settings2 /> Workspace settings</button></div>}
  </aside>;

  return <div className="organization-workspace">
    <div className="workspace-topbar"><Link href="/organizations" aria-label="Back to organizations"><ArrowLeft /></Link><button onClick={() => setDrawer(true)}><Menu /> Channels</button><strong>{showHome ? org.name : `# ${activeChannel?.name ?? "channel"}`}</strong><button onClick={() => setMembersOpen(true)}><UsersRound /> Members</button></div>
    {drawer && <button className="workspace-backdrop" aria-label="Close channel drawer" onClick={() => setDrawer(false)} />}
    {sidebar}
    <section className="workspace-main">
      {showHome ? <OrganizationHome org={org} canManage={Boolean(canManage)} onMembership={membership} /> : activeChannel ? <>
        <header className="channel-header"><div>{activeChannel.channel_type === "announcement" ? <Megaphone /> : <Hash />}<span><strong>{activeChannel.name}</strong><small>{activeChannel.description || "Organization channel"}</small></span></div><div>{activeChannel.visibility === "restricted" && <span className="ui-badge"><LockKeyhole /> Restricted</span>}<ReportButton targetType="organization_channel" targetId={activeChannel.id} label="Report channel" /></div></header>
        <div className="channel-messages">
          {nextCursor && <button className="button button-ghost button-small" onClick={() => loadMessages(activeChannel.id, nextCursor)}>Load older messages</button>}
          {!messages.length && <EmptyState icon={activeChannel.channel_type === "announcement" ? <Megaphone /> : <Hash />} title="No messages yet" description={activeChannel.canSend ? "Start the conversation in this channel." : "Authorized roles can publish here."} compact />}
          {messages.map((message) => <article className="channel-message" key={message.id}><UserAvatar name={message.author?.display_name ?? message.author?.handle ?? "Former member"} mediaId={message.author?.avatar_media_id ?? null} /><div><header><strong>{message.author?.display_name ?? message.author?.handle ?? "Former member"}</strong><small>{new Date(message.created_at).toLocaleString()}{message.edited_at ? " · edited" : ""}</small></header>{message.parent_message_id && <span className="reply-context">Reply</span>}<p>{message.deleted_at ? "Message deleted" : message.body}</p>{!message.deleted_at && <div className="channel-message-actions">{activeChannel.canSend && <button className="text-button" onClick={() => setReplyTo(message)}>Reply</button>}{message.author_profile_id === org.viewerMembership?.profile_id && <button className="text-button" onClick={() => manageMessage(message, "edit")}>Edit</button>}{(message.author_profile_id === org.viewerMembership?.profile_id || activeChannel.canManageMessages) && <button className="text-button" onClick={() => manageMessage(message, "delete")}>Delete</button>}<ReportButton targetType="organization_message" targetId={message.id} label="Report" className="text-button" /></div>}</div></article>)}
        </div>
        <form className="channel-composer" onSubmit={sendMessage}>{replyTo && <div className="composer-reply"><span>Replying to {replyTo.author?.display_name ?? replyTo.author?.handle ?? "member"}</span><button type="button" onClick={() => setReplyTo(null)}><X /></button></div>}<div><input aria-label={`Message ${activeChannel.name}`} value={messageBody} onChange={(event) => setMessageBody(event.target.value)} maxLength={4000} placeholder={activeChannel.canSend ? `Message #${activeChannel.name}` : "This channel is read-only for your role"} disabled={!activeChannel.canSend} /><button aria-label="Send message" disabled={!activeChannel.canSend || !messageBody.trim()}><Send /></button></div></form>
      </> : <EmptyState icon={<Hash />} title="Choose a channel" />}
      {notice && <p className="workspace-notice" role="status">{notice}</p>}
    </section>
    <aside className={`workspace-members ${membersOpen ? "open" : ""}`}>
      <header><h2>Members</h2><button aria-label="Close member list" onClick={() => setMembersOpen(false)}><X /></button></header>
      {canManage && <button className="button button-ghost button-small workspace-invite" onClick={() => void inviteMember()}><Plus /> Invite student</button>}
      {canManage && org.membershipQueue.filter((member) => member.status === "pending").map((member) => <article className="workspace-member-request" key={member.id}><UserAvatar name={member.display_name ?? member.handle} mediaId={member.avatar_media_id} /><span><strong>{member.display_name ?? member.handle}</strong><small>Membership request</small></span><div><button className="text-button" onClick={() => manageMembership(member.profile_id, "accept")}>Approve</button><button className="text-button" onClick={() => manageMembership(member.profile_id, "decline")}>Reject</button></div></article>)}
      {org.members.map((member) => <article className="workspace-member-row" key={member.profile_id}>
        <Link href={`/u/${member.handle}`}><UserAvatar name={member.display_name ?? member.handle} mediaId={member.avatar_media_id} /><span><strong>{member.display_name ?? member.handle}</strong><small>{member.role}</small></span></Link>
        {canManage && member.role !== "owner" && <div className="workspace-member-actions"><select aria-label={`Role for ${member.handle}`} value={member.role} onChange={(event) => manageMembership(member.profile_id, "change_role", event.target.value)}>{["administrator", "moderator", "officer", "member"].filter((role) => org.viewerMembership?.role === "owner" || role !== "administrator").map((role) => <option value={role} key={role}>{role}</option>)}</select><button className="text-button" onClick={() => manageMembership(member.profile_id, "remove")}>Remove</button><button className="text-button" onClick={() => manageMembership(member.profile_id, "ban")}>Ban</button>{org.viewerMembership?.role === "owner" && <button className="text-button" onClick={() => void transferOwnership(member.profile_id)}>Transfer ownership</button>}</div>}
      </article>)}
      {canManage && org.membershipQueue.filter((member) => member.status === "banned").map((member) => <article className="workspace-member-request" key={member.id}><span><strong>{member.display_name ?? member.handle}</strong><small>Banned</small></span><button className="text-button" onClick={() => manageMembership(member.profile_id, "unban")}>Unban</button></article>)}
    </aside>
    {adminOpen && <WorkspaceAdministration slug={slug} roles={roles} members={org.members} channels={channels} roleOverrides={roleOverrides} memberOverrides={memberOverrides} roleAssignments={roleAssignments} capabilities={viewerCapabilities} onChanged={loadWorkspace} onClose={() => setAdminOpen(false)} />}
    {creatingChannel && <div className="composer-modal-layer" role="presentation"><button className="mobile-drawer-backdrop" aria-label="Close channel creator" onClick={() => setCreatingChannel(false)} /><form className="composer-modal listing-form workspace-channel-form" role="dialog" aria-modal="true" aria-labelledby="channel-create-title" onSubmit={createChannel}><header><div><span className="overline">WORKSPACE SETTINGS</span><h2 id="channel-create-title">Create a channel</h2></div><button type="button" aria-label="Close" onClick={() => setCreatingChannel(false)}><X /></button></header><label>Category<select name="categoryId" defaultValue={categories[0]?.id ?? ""}><option value="">No category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Channel name<input name="name" pattern="[a-z0-9][a-z0-9-]{1,49}" minLength={2} maxLength={50} required /></label><label>Description<textarea name="description" maxLength={500} /></label><div className="form-grid"><label>Type<select name="type"><option value="text">Text</option><option value="announcement">Announcement</option></select></label><label>Visibility<select name="visibility"><option value="standard">All members</option><option value="restricted">Restricted</option></select></label><label>Slow mode (seconds)<input name="slowModeSeconds" type="number" min={0} max={21600} defaultValue={0} /></label></div><fieldset><legend>Roles allowed in restricted channels</legend>{roles.filter((role) => role.builtin_key !== "owner").map((role) => <label className="checkbox-label" key={role.id}><input type="checkbox" name="allowedRoleIds" value={role.id} /> <span style={{ color: role.color }}>{role.name}</span></label>)}</fieldset><div className="form-actions"><button type="button" className="button button-ghost" onClick={() => setCreatingChannel(false)}>Cancel</button><button className="button button-primary">Create channel</button></div></form></div>}
  </div>;
}

function OrganizationHome({ org, canManage, onMembership }: { org: Organization; canManage: boolean; onMembership: (action: "request" | "accept" | "decline" | "cancel" | "remove") => void }) {
  const state = org.viewerMembership?.status;
  return <div className="workspace-home">
    <div className="workspace-home-banner">{org.banner_media_id && <img src={`/api/v1/media/${org.banner_media_id}?variant=full`} alt="" />}</div>
    <section className="workspace-home-heading"><div className="organization-mark">{org.avatar_media_id ? <img src={`/api/v1/media/${org.avatar_media_id}?variant=thumb`} alt="" /> : <Building2 />}</div><div><span className="overline">{org.organization_type.replaceAll("_", " ")} · {campusName(org.campuses)}</span><h1>{org.name}</h1><p>{org.description}</p><small>{org.member_count} members · {org.membership_policy.replaceAll("_", " ")}</small></div><div className="workspace-home-actions">{!state || ["removed", "declined", "cancelled"].includes(state) ? <button className="button button-primary" onClick={() => onMembership("request")}>Join organization</button> : state === "pending" ? <button className="button button-ghost" onClick={() => onMembership("cancel")}>Cancel request</button> : state === "invited" ? <><button className="button button-primary" onClick={() => onMembership("accept")}>Accept invite</button><button className="button button-ghost" onClick={() => onMembership("decline")}>Decline</button></> : org.viewerMembership?.role !== "owner" ? <button className="button button-ghost" onClick={() => onMembership("remove")}>Leave organization</button> : <span className="ui-badge ui-badge-success"><Settings2 /> Owner</span>}<ReportButton targetType="organization" targetId={org.id} label="Report organization" /></div></section>
    {org.is_read_only && <div className="ui-alert ui-alert-warning"><strong>Workspace read-only</strong><p>Campus Exchange safety staff have temporarily restricted new organization activity.</p></div>}
    <div className="workspace-home-grid"><section><h2>Rules</h2><p>{org.rules || "Members must follow Campus Exchange safety rules and the organization’s published guidance."}</p>{org.website_url && <a href={org.website_url} rel="noreferrer" target="_blank">Organization website</a>}</section><section><h2><CalendarDays /> Upcoming events</h2>{canManage && <Link href={`/events/new?organization=${org.slug}`}><strong>Create organization event</strong><small>Publish with workspace permissions</small></Link>}{org.upcomingEvents.length ? org.upcomingEvents.map((event) => <Link href={`/events?event=${event.id}`} key={event.id}><strong>{event.title}</strong><small>{new Date(event.starts_at).toLocaleString()} · {event.location}</small></Link>) : <p>No upcoming events.</p>}</section><section><h2><Megaphone /> Recent posts</h2>{canManage && <Link href={`/social?organization=${org.id}#composer`}><strong>Create organization post</strong><small>Publish to the organization audience</small></Link>}{org.recentPosts.length ? org.recentPosts.map((post) => <Link href={`/social/posts/${post.id}`} key={post.id}><strong>{post.body.slice(0, 100)}</strong><small>{post.reaction_count} reactions · {post.comment_count} comments</small></Link>) : <p>No organization posts yet.</p>}</section></div>
  </div>;
}
