import { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 con el generator `prisma-client` requiere un driver adapter para
// conexiones directas a Postgres. Ver nota en docs/plans/02-schema-nucleo-seed.md.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Devuelve un wrapper de queries pre-scopadas a una organización.
 *
 * Solo expone los modelos con `organizationId`. Modelos cross-tenant
 * (User, Account, Session, VerificationToken, Organization) van por `prisma.*` directo.
 *
 * `auditLog` es append-only: no expone update ni delete.
 *
 * Nunca usar `prisma.grupoScout.*` directo en código de feature.
 */
export function forOrg(organizationId: string) {
  return {
    grupoScout: {
      findMany: (args?: Parameters<typeof prisma.grupoScout.findMany>[0]) =>
        prisma.grupoScout.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      findFirst: (args?: Parameters<typeof prisma.grupoScout.findFirst>[0]) =>
        prisma.grupoScout.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      create: (data: Omit<Prisma.GrupoScoutUncheckedCreateInput, "organizationId">) =>
        prisma.grupoScout.create({ data: { ...data, organizationId } }),
      update: (args: Parameters<typeof prisma.grupoScout.update>[0]) =>
        prisma.grupoScout.update({
          ...args,
          where: { ...args.where, organizationId },
        }),
      delete: (args: Parameters<typeof prisma.grupoScout.delete>[0]) =>
        prisma.grupoScout.delete({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (args?: Parameters<typeof prisma.grupoScout.count>[0]) =>
        prisma.grupoScout.count({
          ...args,
          where: { ...args?.where, organizationId },
        }),
    },

    membership: {
      findMany: (args?: Parameters<typeof prisma.membership.findMany>[0]) =>
        prisma.membership.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      findFirst: (args?: Parameters<typeof prisma.membership.findFirst>[0]) =>
        prisma.membership.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      create: (data: Omit<Prisma.MembershipUncheckedCreateInput, "organizationId">) =>
        prisma.membership.create({ data: { ...data, organizationId } }),
      update: (args: Parameters<typeof prisma.membership.update>[0]) =>
        prisma.membership.update({
          ...args,
          where: { ...args.where, organizationId },
        }),
      delete: (args: Parameters<typeof prisma.membership.delete>[0]) =>
        prisma.membership.delete({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (args?: Parameters<typeof prisma.membership.count>[0]) =>
        prisma.membership.count({
          ...args,
          where: { ...args?.where, organizationId },
        }),
    },

    invitation: {
      findMany: (args?: Parameters<typeof prisma.invitation.findMany>[0]) =>
        prisma.invitation.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      findFirst: (args?: Parameters<typeof prisma.invitation.findFirst>[0]) =>
        prisma.invitation.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      create: (data: Omit<Prisma.InvitationUncheckedCreateInput, "organizationId">) =>
        prisma.invitation.create({ data: { ...data, organizationId } }),
      update: (args: Parameters<typeof prisma.invitation.update>[0]) =>
        prisma.invitation.update({
          ...args,
          where: { ...args.where, organizationId },
        }),
      updateMany: (args: Parameters<typeof prisma.invitation.updateMany>[0]) =>
        prisma.invitation.updateMany({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      delete: (args: Parameters<typeof prisma.invitation.delete>[0]) =>
        prisma.invitation.delete({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (args?: Parameters<typeof prisma.invitation.count>[0]) =>
        prisma.invitation.count({
          ...args,
          where: { ...args?.where, organizationId },
        }),
    },

    miembroScout: {
      findMany: (args?: Parameters<typeof prisma.miembroScout.findMany>[0]) =>
        prisma.miembroScout.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      findFirst: (args?: Parameters<typeof prisma.miembroScout.findFirst>[0]) =>
        prisma.miembroScout.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      create: (data: Omit<Prisma.MiembroScoutUncheckedCreateInput, "organizationId">) =>
        prisma.miembroScout.create({ data: { ...data, organizationId } }),
      update: (args: Parameters<typeof prisma.miembroScout.update>[0]) =>
        prisma.miembroScout.update({
          ...args,
          where: { ...args.where, organizationId },
        }),
      delete: (args: Parameters<typeof prisma.miembroScout.delete>[0]) =>
        prisma.miembroScout.delete({
          ...args,
          where: { ...args.where, organizationId },
        }),
      count: (args?: Parameters<typeof prisma.miembroScout.count>[0]) =>
        prisma.miembroScout.count({
          ...args,
          where: { ...args?.where, organizationId },
        }),
    },

    // append-only: no update, no delete
    auditLog: {
      findMany: (args?: Parameters<typeof prisma.auditLog.findMany>[0]) =>
        prisma.auditLog.findMany({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      findFirst: (args?: Parameters<typeof prisma.auditLog.findFirst>[0]) =>
        prisma.auditLog.findFirst({
          ...args,
          where: { ...args?.where, organizationId },
        }),
      create: (data: Omit<Prisma.AuditLogUncheckedCreateInput, "organizationId">) =>
        prisma.auditLog.create({ data: { ...data, organizationId } }),
      count: (args?: Parameters<typeof prisma.auditLog.count>[0]) =>
        prisma.auditLog.count({
          ...args,
          where: { ...args?.where, organizationId },
        }),
    },
  };
}
