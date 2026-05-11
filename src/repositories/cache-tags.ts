export const cacheTags = {
  memberships: (orgId: string) => `memberships:${orgId}`,
  grupos:      (orgId: string) => `grupos:${orgId}`,
  invitations: (orgId: string) => `invitations:${orgId}`,
  distrito:       (orgId: string) => `distrito:${orgId}`,
  scoreTemplates: (orgId: string) => `scoreTemplates:${orgId}`,
  eventos:        (orgId: string) => `eventos:${orgId}`,
  postas:         (orgId: string) => `postas:${orgId}`,
  scoreSheets:    (orgId: string) => `scoreSheets:${orgId}`,
  leaderboard:       (orgId: string) => `leaderboard:${orgId}`,
  publicShareLinks:  (orgId: string) => `publicShareLinks:${orgId}`,
} as const
