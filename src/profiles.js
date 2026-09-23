// Local, device-scoped player profiles.
//
// A profile is { id, name, createdAt, kind }. The `id` is the primary key
// every stat hangs on: game records store seat -> profile id, and the stats
// screen looks games up by it. Nothing parses an id — it is opaque.
//
// FORWARD COMPATIBILITY: `kind` is the discriminator that lets other identity
// sources join later without reshaping storage. A real account becomes
// { kind: 'account', accountId } and the multiplayer branch's seat-token
// becomes { kind: 'seat', token }, both keeping the same local `id` as their
// primary key — so historical games keep resolving even after a profile is
// linked to an account.

import { newId } from './ids.js';

export const PROFILES_KEY = 'matcha.profiles.v1';

/** Keeps the picker usable and names readable in a seat row. */
export const MAX_NAME_LENGTH = 20;

function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === 'string') : [];
  } catch {
    return [];
  }
}

function write(profiles, storage) {
  if (!storage) return profiles;
  try {
    storage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // storage full or blocked — the change just will not persist
  }
  return profiles;
}

/** Trim, collapse whitespace, and cap. Returns '' if nothing usable is left. */
export function normaliseName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** All profiles, oldest first. */
export function loadProfiles(storage = defaultStorage()) {
  return read(storage);
}

export function getProfile(id, storage = defaultStorage()) {
  return read(storage).find((p) => p.id === id) ?? null;
}

/**
 * Create a profile. Returns the new profile, or null if the name is empty or
 * already taken (case-insensitively) — names are how players tell each other
 * apart in the seat picker, so duplicates would make it unusable.
 */
export function createProfile(name, storage = defaultStorage()) {
  const clean = normaliseName(name);
  if (!clean) return null;

  const profiles = read(storage);
  if (profiles.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return null;

  const profile = { id: newId('p'), name: clean, createdAt: Date.now(), kind: 'local' };
  write([...profiles, profile], storage);
  return profile;
}

/** Rename in place. Returns the updated profile, or null if rejected. */
export function renameProfile(id, name, storage = defaultStorage()) {
  const clean = normaliseName(name);
  if (!clean) return null;

  const profiles = read(storage);
  const target = profiles.find((p) => p.id === id);
  if (!target) return null;
  if (profiles.some((p) => p.id !== id && p.name.toLowerCase() === clean.toLowerCase())) return null;

  const updated = { ...target, name: clean };
  write(
    profiles.map((p) => (p.id === id ? updated : p)),
    storage,
  );
  return updated;
}

/**
 * Delete a profile. Past games keep the raw id in seatProfiles, so their
 * records survive — they simply stop resolving to a name, which is the right
 * trade: deleting a profile should not rewrite history.
 */
export function deleteProfile(id, storage = defaultStorage()) {
  const profiles = read(storage);
  const next = profiles.filter((p) => p.id !== id);
  write(next, storage);
  return next;
}
