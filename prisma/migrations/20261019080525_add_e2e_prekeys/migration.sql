-- CreateTable
CREATE TABLE "E2eBundle" (
    "deviceId" TEXT NOT NULL,
    "registrationId" INTEGER NOT NULL,
    "identityKey" VARCHAR(44) NOT NULL,
    "signedPrekeyId" INTEGER NOT NULL,
    "signedPrekeyPublicKey" VARCHAR(44) NOT NULL,
    "signedPrekeySignature" VARCHAR(88) NOT NULL,
    "version" INTEGER NOT NULL,
    "publicationHash" VARCHAR(64) NOT NULL,
    "lastPrekeyId" INTEGER NOT NULL DEFAULT -1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2eBundle_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "E2eOneTimePrekey" (
    "deviceId" TEXT NOT NULL,
    "keyId" INTEGER NOT NULL,
    "publicKey" VARCHAR(44) NOT NULL,

    CONSTRAINT "E2eOneTimePrekey_pkey" PRIMARY KEY ("deviceId","keyId")
);

-- CreateTable
CREATE TABLE "E2eKeyClaim" (
    "requesterUserId" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "targetDeviceId" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2eKeyClaim_pkey" PRIMARY KEY ("requesterUserId","requestId")
);

-- CreateIndex
CREATE INDEX "E2eKeyClaim_expiresAt_idx" ON "E2eKeyClaim"("expiresAt");

-- CreateIndex
CREATE INDEX "E2eKeyClaim_targetDeviceId_idx" ON "E2eKeyClaim"("targetDeviceId");

-- AddForeignKey
ALTER TABLE "E2eBundle" ADD CONSTRAINT "E2eBundle_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DeviceIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2eOneTimePrekey" ADD CONSTRAINT "E2eOneTimePrekey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "E2eBundle"("deviceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2eKeyClaim" ADD CONSTRAINT "E2eKeyClaim_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2eKeyClaim" ADD CONSTRAINT "E2eKeyClaim_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "DeviceIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
