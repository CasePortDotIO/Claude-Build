-- In-app integration credentials (Settings → Integrations). Encrypted at rest;
-- reads fall back to the matching env var.
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);
