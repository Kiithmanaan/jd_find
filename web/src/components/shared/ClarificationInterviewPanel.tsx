import React, { useState } from "react";
import { Button } from "../ui/button.js";
import { Card, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { EmptyState } from "./EmptyState.js";
import type { ClarificationInterviewSession } from "../../lib/api-types.js";

const TOPIC_LABELS: Record<string, string> = {
  "role-purpose": "岗位存在意义",
  "hard-gates": "硬门槛",
  "vital-skills": "命脉技能与验证方式",
  "negative-signals": "排除信号",
  "target-companies": "目标公司与人才来源",
  "search-keywords": "搜索关键词与渠道",
  "soft-preferences": "软性偏好与加分项",
};

export interface ClarificationInterviewPanelProps {
  session?: ClarificationInterviewSession;
  starting?: boolean;
  answering?: boolean;
  error?: string;
  onStart: () => void;
  onAnswer: (answer: string) => void;
  onApplyDraft: (session: ClarificationInterviewSession) => void;
}

export function ClarificationInterviewPanel(props: ClarificationInterviewPanelProps): React.ReactElement {
  const [answerText, setAnswerText] = useState("");
  const session = props.session;

  const submit = (): void => {
    if (!answerText.trim()) return;
    props.onAnswer(answerText.trim());
    setAnswerText("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">澄清访谈（逼问式画像梳理）</h3>
          {session ? <Badge variant={session.status === "Completed" ? "default" : "secondary"}>{session.status}</Badge> : null}
        </div>
        <Button size="sm" variant="outline" onClick={props.onStart} disabled={props.starting}>
          {session ? "重新开始访谈" : "发起访谈"}
        </Button>
      </div>
      {props.error ? <p className="text-xs text-red-600">{props.error}</p> : null}

      {!session ? (
        <EmptyState text="发起访谈后，AI 将按七组话题逐题逼问岗位真实要求，答完产出画像草稿。" />
      ) : (
        <>
          {/* 已答问答记录 */}
          {session.turns.filter((turn) => turn.answer).length > 0 ? (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <h4 className="text-sm font-semibold">已确认（{session.turns.filter((turn) => turn.answer).length}/7）</h4>
                <div className="space-y-2">
                  {session.turns.filter((turn) => turn.answer).map((turn) => (
                    <div key={turn.topicKey} className="border rounded px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{TOPIC_LABELS[turn.topicKey] ?? turn.topicKey}</Badge>
                        <span className="text-muted-foreground">{turn.question}</span>
                      </div>
                      <p className="mt-1">{turn.answer}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* 当前问题 */}
          {session.currentQuestion ? (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge>{TOPIC_LABELS[session.currentQuestion.topicKey] ?? session.currentQuestion.topicKey}</Badge>
                  <span className="text-xs text-muted-foreground">第 {session.turns.length}/7 题</span>
                </div>
                <p className="text-sm">{session.currentQuestion.question}</p>
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="shrink-0">💡 {session.currentQuestion.suggestedAnswer}</span>
                  <button
                    className="text-blue-600 underline shrink-0"
                    onClick={() => setAnswerText(session.currentQuestion!.suggestedAnswer.replace(/^建议[:：]?/, "").trim())}
                  >
                    采用建议
                  </button>
                </div>
                <textarea
                  className="w-full rounded border p-2 text-sm"
                  rows={3}
                  placeholder="输入回答，或点击「采用建议」后修改"
                  value={answerText}
                  onChange={(event) => setAnswerText(event.target.value)}
                />
                <Button size="sm" onClick={submit} disabled={props.answering || !answerText.trim()}>
                  {props.answering ? "提交中…" : "提交回答"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* 完成后的草稿 */}
          {session.status === "Completed" && session.draftOutput ? (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">画像草稿产出</h4>
                  <Button size="sm" onClick={() => props.onApplyDraft(session)}>
                    用草稿创建版本草稿
                  </Button>
                </div>
                <div className="text-xs border rounded p-2 bg-muted/20 whitespace-pre-wrap">{session.draftOutput.jdText}</div>
                <div className="grid gap-2 text-xs md:grid-cols-2">
                  <div>
                    <p className="font-medium">硬性条件建议</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {session.draftOutput.hardRequirementNotes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">排除信号</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {session.draftOutput.negativeSignals.map((signal) => <li key={signal}>{signal}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">软性条件</p>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {session.draftOutput.softRequirements.map((requirement) => (
                        <li key={requirement.key}>
                          {requirement.label}：{requirement.description}
                          {requirement.verificationHint ? `（验证：${requirement.verificationHint}）` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">搜索关键词</p>
                    <p className="text-muted-foreground">{session.draftOutput.searchKeywords.join("、")}</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  硬性条件建议仅供参考，结构化硬筛规则请在硬筛配置中维护；草稿版本仍需你手动确认后生效。
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
