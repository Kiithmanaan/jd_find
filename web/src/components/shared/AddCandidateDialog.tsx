import React, { useState } from "react";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Card, CardContent } from "../ui/card.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog.js";
import { ErrorState } from "./ErrorState.js";
import type { ManualCandidateForm } from "../../lib/api-client.js";

export interface AddCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (form: ManualCandidateForm) => Promise<void>;
}

const INITIAL_FORM: ManualCandidateForm = {
  name: "",
  title: "",
  city: "",
  educationLevel: "本科",
  yearsOfExperience: 0,
  industries: "",
  keywords: "",
  summary: "",
  intent: "中",
  activityLevel: "中",
  sourcePlatform: "手动添加",
  sourceUrl: "",
};

export function AddCandidateDialog(props: AddCandidateDialogProps): React.ReactElement {
  const [form, setForm] = useState<ManualCandidateForm>({ ...INITIAL_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const update = (field: keyof ManualCandidateForm, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("姓名不能为空。");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await props.onConfirm(form);
      props.onOpenChange(false);
      setForm({ ...INITIAL_FORM });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "添加候选人失败。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>手动添加候选人</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error ? <ErrorState message={error} /> : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">姓名 *</label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">职位</label>
              <Input value={form.title} onChange={(e) => update("title", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">城市</label>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">学历</label>
              <select
                value={form.educationLevel}
                onChange={(e) => update("educationLevel", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="大专">大专</option>
                <option value="本科">本科</option>
                <option value="硕士">硕士</option>
                <option value="博士">博士</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">工作年限</label>
              <Input type="number" value={form.yearsOfExperience} onChange={(e) => update("yearsOfExperience", Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs font-medium">求职意向</label>
              <select
                value={form.intent}
                onChange={(e) => update("intent", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">活跃度</label>
              <select
                value={form.activityLevel}
                onChange={(e) => update("activityLevel", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="高">高</option>
                <option value="中">中</option>
                <option value="低">低</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">来源平台</label>
              <Input value={form.sourcePlatform} onChange={(e) => update("sourcePlatform", e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium">来源 URL</label>
            <Input value={form.sourceUrl} onChange={(e) => update("sourceUrl", e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium">行业（逗号分隔）</label>
            <Input value={form.industries} onChange={(e) => update("industries", e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium">关键词（逗号分隔）</label>
            <Input value={form.keywords} onChange={(e) => update("keywords", e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium">履历摘要</label>
            <textarea
              value={form.summary}
              onChange={(e) => update("summary", e.target.value)}
              className="flex min-h-20 w-full rounded-md border border-input px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" disabled={submitting} onClick={() => props.onOpenChange(false)}>取消</Button>
            <Button disabled={submitting} onClick={handleSubmit}>
              {submitting ? "添加中…" : "添加候选人"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
