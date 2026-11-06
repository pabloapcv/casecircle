import { me, monthsSince, waitComparison } from "./logic.js";

/*
 * Pure data for the desktop right sidebar ("Your case" + saved posts).
 * Uses only what is already in local state; nothing is fetched or sent anywhere.
 */

function list(value) {
  return Array.isArray(value) ? value : [];
}

// The case to show: the one for the screen's group if the member has it, otherwise the most recently filed.
export function pickCase(profiles, preferSpaceId = "") {
  const rows = list(profiles).filter((item) => item && item.spaceId);
  if (!rows.length) return null;
  if (preferSpaceId) {
    const match = rows.find((item) => item.spaceId === preferSpaceId);
    if (match) return match;
  }
  const time = (item) => {
    const value = Date.parse(item.filed);
    return Number.isFinite(value) ? value : -Infinity;
  };
  return [...rows].sort((a, b) => time(b) - time(a))[0];
}

export function caseSummary(state, preferSpaceId = "") {
  const user = me(state);
  const profiles = list(user?.profiles);
  const profile = pickCase(profiles, preferSpaceId);
  if (!profile) return null;
  const hasFiled = Boolean(profile.filed) && Number.isFinite(Date.parse(profile.filed));
  const comparison = hasFiled ? waitComparison(state, profile) : null;
  return {
    spaceId: profile.spaceId,
    form: profile.form || "",
    stage: profile.stage || "",
    filed: hasFiled ? profile.filed : null,
    months: hasFiled ? monthsSince(profile.filed) : null,
    wait: comparison && comparison.publishable
      ? { percentile: comparison.percentile, count: comparison.count }
      : null,
    others: profiles.length - 1
  };
}

// Saved posts, newest save first, only ones the member can still read.
export function savedPosts(state, limit = 3) {
  const user = me(state);
  if (!user) return { posts: [], total: 0 };
  const blocked = new Set(list(user.blocks));
  for (const other of list(state.members)) {
    if (list(other.blocks).includes(user.id)) blocked.add(other.id);
  }
  const byId = new Map(list(state.posts).map((post) => [post.id, post]));
  const posts = [...list(user.bookmarks)].reverse()
    .map((id) => byId.get(id))
    .filter((post) => post && post.status === "live" && !blocked.has(post.authorId));
  return { posts: posts.slice(0, Math.max(0, limit)), total: posts.length };
}
