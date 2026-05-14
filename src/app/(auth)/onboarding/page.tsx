import { prisma } from "@/lib/db"
import { OnboardingClient } from "./OnboardingClient"

export default async function OnboardingPage() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, nombre: true, slug: true },
    orderBy: { nombre: "asc" },
  })
  return <OnboardingClient orgs={orgs} />
}
