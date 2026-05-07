export const cacheTags = {
  memberships: (orgId: string) => `memberships:${orgId}`,
  grupos:      (orgId: string) => `grupos:${orgId}`,
  invitations: (orgId: string) => `invitations:${orgId}`,
  distrito:       (orgId: string) => `distrito:${orgId}`,
  scoreTemplates: (orgId: string) => `scoreTemplates:${orgId}`,
  eventos:        (orgId: string) => `eventos:${orgId}`,
  postas:         (orgId: string) => `postas:${orgId}`,
} as const
