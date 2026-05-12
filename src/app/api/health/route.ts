import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok" }, { status: 200 })
  } catch (error) {
    console.error("[health] DB check failed", error)
    return NextResponse.json({ status: "error" }, { status: 503 })
  }
}
