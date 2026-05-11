-- CreateTable
CREATE TABLE "EventLeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedByUserId" TEXT,

    CONSTRAINT "EventLeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicShareLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,

    CONSTRAINT "PublicShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventLeaderboardSnapshot_eventoId_key" ON "EventLeaderboardSnapshot"("eventoId");

-- CreateIndex
CREATE INDEX "EventLeaderboardSnapshot_organizationId_idx" ON "EventLeaderboardSnapshot"("organizationId");

-- CreateIndex
CREATE INDEX "EventLeaderboardSnapshot_generatedAt_idx" ON "EventLeaderboardSnapshot"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicShareLink_token_key" ON "PublicShareLink"("token");

-- CreateIndex
CREATE INDEX "PublicShareLink_eventoId_idx" ON "PublicShareLink"("eventoId");

-- CreateIndex
CREATE INDEX "PublicShareLink_organizationId_idx" ON "PublicShareLink"("organizationId");

-- AddForeignKey
ALTER TABLE "EventLeaderboardSnapshot" ADD CONSTRAINT "EventLeaderboardSnapshot_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLeaderboardSnapshot" ADD CONSTRAINT "EventLeaderboardSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLeaderboardSnapshot" ADD CONSTRAINT "EventLeaderboardSnapshot_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicShareLink" ADD CONSTRAINT "PublicShareLink_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicShareLink" ADD CONSTRAINT "PublicShareLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicShareLink" ADD CONSTRAINT "PublicShareLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicShareLink" ADD CONSTRAINT "PublicShareLink_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (partial unique: solo un link activo por evento)
CREATE UNIQUE INDEX "PublicShareLink_eventoId_active_unique"
  ON "PublicShareLink"("eventoId")
  WHERE "revokedAt" IS NULL;
