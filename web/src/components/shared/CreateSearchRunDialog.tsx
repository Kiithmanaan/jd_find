import React, { useState } from "react";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Card, CardContent } from "../ui/card.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog.js";
import { KeyValue } from "./KeyValue.js";
import { ErrorState } from "./ErrorState.js";
import type { JobProfileVersion } from "../../lib/api-types.js";

export interface CreateSearchRunDialogProps {
  profile: JobProfileVersion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targetResultCount: number) => Promise<void>;
}

export function CreateSearchRunDialog(props: CreateSearchRunDialogProps): React.ReactElement {
  const [targetCount, setTargetCount] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      await props.onConfirm(targetCount);
      props.onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "创建寻访任务失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>启动寻访任务</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-2">
              <h3 className="text-sm font-semibold">岗位画像摘要</h3>
              <KeyValue label="岗位名称" value={props.profile.title} />
              <KeyValue label="版本" value={`v${props.profile.version}`} />
              <KeyValue label="关键词" value={props.profile.searchCondition.keywords.join("、")} />
              <KeyValue label="硬性条件" value={props.profile.hardRequirements.map((req) => req.label).join("；")} />
            </CardContent>
          </Card>

          <div>
            <label className="text-sm font-medium mb-1 block">目标候选人数量</label>
            <Input
              type="number"
              min={10}
              max={500}
              value={targetCount}
              onChange={(e) => setTargetCount(Math.max(10, Math.min(500, Number(e.target.value))))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              插件将通过多个招聘平台采集候选人，达到目标数后自动完成寻访。
            </p>
          </div>

          {error ? <ErrorState message={error} /> : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={submitting} onClick={() => props.onOpenChange(false)}>
              取消
            </Button>
            <Button disabled={submitting} onClick={handleConfirm}>
              {submitting ? "创建中…" : "确认启动"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
