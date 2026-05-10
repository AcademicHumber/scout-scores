import { NextResponse } from "next/server"
import { requireRoleApi } from "@/lib/auth-helpers"
import { getSnapshotParaJuez } from "@/repositories/score-sheet.repo"

export async function GET() {
  const auth = await requireRoleApi(["JUEZ", "ADMIN"])
  if (!auth.ok) return auth.response

  const entries = await getSnapshotParaJuez(auth.organizationId, auth.userId, auth.role === "ADMIN")

  return NextResponse.json({
    organizationId: auth.organizationId,
    fetchedAt: new Date().toISOString(),
    entries,
  })
}
