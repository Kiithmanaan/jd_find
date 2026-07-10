import assert from "node:assert/strict";
import test from "node:test";
import {
  createOriginalSourceLink,
  verifySourceLink,
  expireSourceLink,
  isSourceLinkAccessible,
  normalizeUrl,
  assessRiskLevel,
} from "../src/domain/original-source-link.js";
import { DomainError } from "../src/domain/errors.js";

const validProps = {
  id: "link-001",
  platform: "LinkedIn",
  originalUrl: "https://www.linkedin.com/in/test-profile",
  searchContext: "搜索高级解决方案顾问",
  fallbackClues: ["解决方案顾问", "企业服务", "上海"],
};

test("创建有效的来源链接", () => {
  const link = createOriginalSourceLink(validProps);

  assert.equal(link.id, "link-001");
  assert.equal(link.platform, "LinkedIn");
  assert.equal(link.originalUrl, "https://www.linkedin.com/in/test-profile");
  assert.equal(link.externalId, "");
  assert.equal(link.searchContext, "搜索高级解决方案顾问");
  assert.deepEqual(link.fallbackClues, ["解决方案顾问", "企业服务", "上海"]);
  assert.equal(link.riskLevel, "medium");
  assert.equal(link.status, "unverified");
  assert.equal(link.lastVerifiedAt, undefined);
  assert.ok(link.createdAt instanceof Date);
});

test("创建来源链接时，缺少平台抛出 DomainError", () => {
  assert.throws(
    () => createOriginalSourceLink({ ...validProps, platform: "  " }),
    DomainError,
  );
});

test("缺少 URL 但有辅助线索时创建 fallback_only 来源", () => {
  const link = createOriginalSourceLink({ ...validProps, originalUrl: "" });
  assert.equal(link.status, "fallback_only");
});

test("创建来源链接时，缺少 searchContext 抛出 DomainError", () => {
  assert.throws(
    () => createOriginalSourceLink({ ...validProps, searchContext: "  " }),
    DomainError,
  );
});

test("URL 会被标准化", () => {
  const link = createOriginalSourceLink(validProps);
  assert.ok((link.normalizedUrl?.length ?? 0) > 0);
  assert.ok(!link.normalizedUrl?.includes("www."));
  assert.ok(!link.normalizedUrl?.includes("https://"));
});

test("验证来源链接将状态更新为 active 并记录时间", () => {
  const link = createOriginalSourceLink(validProps);
  const verified = verifySourceLink(link);

  assert.equal(verified.status, "active");
  assert.ok(verified.lastVerifiedAt instanceof Date);
  assert.equal(verified.id, link.id);
  assert.equal(verified.platform, link.platform);
});

test("使来源链接过期", () => {
  const link = createOriginalSourceLink(validProps);
  const expired = expireSourceLink(link);

  assert.equal(expired.status, "expired");
});

test("使已过期的链接再次过期抛出 DomainError", () => {
  const link = createOriginalSourceLink(validProps);
  const expired = expireSourceLink(link);

  assert.throws(() => expireSourceLink(expired), DomainError);
});

test("已过期的链接不可访问", () => {
  const link = createOriginalSourceLink(validProps);
  const expired = expireSourceLink(link);

  assert.equal(isSourceLinkAccessible(expired), false);
});

test("已验证的链接在 24 小时内可访问", () => {
  const link = createOriginalSourceLink(validProps);
  const verified = verifySourceLink(link);

  assert.equal(isSourceLinkAccessible(verified), true);
});

test("未验证但有备用线索的链接可访问", () => {
  const link = createOriginalSourceLink(validProps);
  assert.equal(isSourceLinkAccessible(link), true);
});

test("未验证且无备用线索的低风险平台链接可访问", () => {
  const link = createOriginalSourceLink({
    ...validProps,
    fallbackClues: [],
  });
  assert.equal(isSourceLinkAccessible(link), true);
});

test("URL 标准化移除 www 前缀", () => {
  assert.equal(normalizeUrl("https://www.example.com/path"), "example.com/path");
});

test("URL 标准化移除尾部斜杠", () => {
  assert.equal(normalizeUrl("https://example.com/path/"), "example.com/path");
});

test("URL 标准化转小写", () => {
  assert.equal(normalizeUrl("HTTPS://EXAMPLE.COM/PATH"), "example.com/path");
});

test("LinkedIn URL 风险等级为 medium", () => {
  assert.equal(assessRiskLevel("https://linkedin.com/in/test", "LinkedIn"), "medium");
});

test("招聘平台 URL 风险等级为 medium", () => {
  assert.equal(assessRiskLevel("https://zhaopin.com/job/123", "智联招聘"), "medium");
});

test("内部平台 URL 风险等级为 high", () => {
  assert.equal(assessRiskLevel("https://internal.company.com/candidate/1", "Internal"), "high");
});

test("普通平台 URL 风险等级为 low", () => {
  assert.equal(assessRiskLevel("https://example.test/profile", "BrowserPlugin"), "low");
});
