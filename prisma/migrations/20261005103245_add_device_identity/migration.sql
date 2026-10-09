-- CreateTable
CREATE TABLE "DeviceIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceIdentity_userId_idx" ON "DeviceIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceIdentity_userId_publicKey_key" ON "DeviceIdentity"("userId", "publicKey");

-- AddForeignKey
ALTER TABLE "DeviceIdentity" ADD CONSTRAINT "DeviceIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
