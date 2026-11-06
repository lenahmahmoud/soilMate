// Whitelist: only these fields can ever leave the server.
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