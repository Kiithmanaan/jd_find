-- CreateTable
CREATE TABLE "HardConditionDimensionRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "supportedMatchModes" JSONB NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HardConditionDimensionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HardConditionOptionRecord" (
    "id" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HardConditionOptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HardConditionDimensionRecord_key_key" ON "HardConditionDimensionRecord"("key");

-- CreateIndex
CREATE INDEX "HardConditionOptionRecord_dimensionKey_idx" ON "HardConditionOptionRecord"("dimensionKey");

-- CreateIndex
CREATE UNIQUE INDEX "HardConditionOptionRecord_dimensionKey_value_key" ON "HardConditionOptionRecord"("dimensionKey", "value");

-- AddForeignKey
ALTER TABLE "HardConditionOptionRecord" ADD CONSTRAINT "HardConditionOptionRecord_dimensionKey_fkey" FOREIGN KEY ("dimensionKey") REFERENCES "HardConditionDimensionRecord"("key") ON DELETE CASCADE ON UPDATE CASCADE;
