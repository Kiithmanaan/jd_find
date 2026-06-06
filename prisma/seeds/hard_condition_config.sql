INSERT INTO "HardConditionDimensionRecord" ("id", "key", "label", "valueType", "supportedMatchModes", "allowMultiple")
VALUES
  ('hard-dimension-keyword', 'keyword', '全文关键词', 'text', '["exact", "normalizedContains"]', true),
  ('hard-dimension-city', 'city', '城市', 'option', '["optionAny"]', true),
  ('hard-dimension-industry', 'industry', '行业', 'option', '["optionAny"]', true),
  ('hard-dimension-education', 'education', '学历', 'option', '["rankAtLeast"]', false),
  ('hard-dimension-years', 'yearsOfExperience', '最低工作年限', 'number', '["min"]', false)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "HardConditionOptionRecord" ("id", "dimensionKey", "value", "label", "aliases", "rank")
VALUES
  ('hard-option-education-college', 'education', '大专', '大专', '["专科"]', 1),
  ('hard-option-education-bachelor', 'education', '本科', '本科', '["学士"]', 2),
  ('hard-option-education-master', 'education', '硕士', '硕士', '["研究生"]', 3),
  ('hard-option-education-doctor', 'education', '博士', '博士', '["博士研究生"]', 4)
ON CONFLICT ("dimensionKey", "value") DO NOTHING;
