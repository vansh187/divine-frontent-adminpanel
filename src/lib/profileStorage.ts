export interface ProfileOverrides {
  fullName?: string;
  phone?: string;
}

export class ProfileStorageError extends Error {}

function avatarKey(email: string) {
  return `dvi_admin_avatar_${email}`;
}

function profileKey(email: string) {
  return `dvi_admin_profile_${email}`;
}

export function getStoredAvatar(email: string): string | null {
  try {
    return localStorage.getItem(avatarKey(email));
  } catch {
    return null;
  }
}

export function setStoredAvatar(email: string, dataUrl: string): void {
  try {
    localStorage.setItem(avatarKey(email), dataUrl);
  } catch {
    throw new ProfileStorageError(
      "We couldn't save your photo. Your browser's storage may be full."
    );
  }
}

export function removeStoredAvatar(email: string): void {
  try {
    localStorage.removeItem(avatarKey(email));
  } catch {
    throw new ProfileStorageError("We couldn't remove your photo. Please try again.");
  }
}

export function getProfileOverrides(email: string): ProfileOverrides {
  try {
    const raw = localStorage.getItem(profileKey(email));
    return raw ? (JSON.parse(raw) as ProfileOverrides) : {};
  } catch {
    return {};
  }
}

export function setProfileOverrides(email: string, patch: ProfileOverrides): ProfileOverrides {
  const next = { ...getProfileOverrides(email), ...patch };
  try {
    localStorage.setItem(profileKey(email), JSON.stringify(next));
  } catch {
    throw new ProfileStorageError(
      "We couldn't save your profile changes. Your browser's storage may be full."
    );
  }
  return next;
}
