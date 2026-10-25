import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultShortPlan, emptyData, foodAlerts, readBackup } from "../src/lib/fitness.ts";

test("edited short plan and external diet preference survive backup restoration", () => {
  const data = structuredClone(emptyData);
  data.shortPlan = { ...defaultShortPlan, title: "我的短期计划", content: "核心训练\n腹式呼吸", calorieDeficit: 550 };
  const restored = readBackup(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.shortPlan, data.shortPlan);
  assert.deepEqual(restored.trainingRecords, data.trainingRecords);
});

test("external diet tracking does not produce missing-meal or nutrient alerts", () => {
  const data = structuredClone(emptyData);
  const alerts = foodAlerts(data, "2026-10-25");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /吃有数/);
  assert.match(alerts[0], /未连接/);
  assert.doesNotMatch(alerts[0], /还没有饮食记录|摄入不足/);
  data.shortPlan = { ...defaultShortPlan, dietApp: "" };
  assert.match(foodAlerts(data, "2026-10-25")[0], /还没有饮食记录/);
});
