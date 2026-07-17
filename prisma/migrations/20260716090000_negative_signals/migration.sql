-- 岗位画像与画像版本增加排除信号（negativeSignals），历史数据默认空数组
ALTER TABLE "JobProfileRecord" ADD COLUMN "negativeSignals" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "JobProfileVersionRecord" ADD COLUMN "negativeSignals" JSONB NOT NULL DEFAULT '[]';
