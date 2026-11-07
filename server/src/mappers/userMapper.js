// Whitelists: only these fields can ever leave the server.
export function toUserDto(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: Boolean(user.emailVerified),
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

export function toMeDto(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    passwordChangedAt: new Date(user.passwordChangedAt ?? user.createdAt).toISOString(),
    createdAt: new Date(user.createdAt).toISOString(),
  };
}