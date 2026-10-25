import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyData, saveDailyTraining } from "../src/lib/fitness.ts";

test("daily edits are recorded without altering the weekly template", () => {
  const data = structuredClone(emptyData);
  data.plans.normal = { mode: "normal", days: [{ dayOfWeek: 1, theme: "周模板", items: [{ name: "原动作", totalSets: 3 }] }] };
  const result = saveDailyTraining(data, "2026-10-24", "normal", "当天调整", [{ name: "新动作", totalSets: 2 }], 1);
  assert.deepEqual(result.plans, data.plans);
  assert.equal(result.trainingRecords[0].recordDate, "2026-10-24");
  assert.equal(result.trainingRecords[0].theme, "当天调整");
  assert.equal(data.trainingRecords.length, 0);
});

test("saving free training repeatedly updates the same dated record", () => {
  let data = saveDailyTraining(structuredClone(emptyData), "2026-10-24", "free", "自由训练", [{ name: "臀桥", totalSets: 3 }]);
  const id = data.trainingRecords[0].id;
  data = saveDailyTraining(data, "2026-10-24", "free", "自由训练", [{ name: "臀桥", totalSets: 4 }, { name: "步行", totalSets: 1 }]);
  assert.equal(data.trainingRecords.length, 1);
  assert.equal(data.trainingRecords[0].id, id);
  assert.equal(data.trainingRecords[0].exercises.length, 2);
});

test("other dates, completion and feedback survive daily edits", () => {
  let data = saveDailyTraining(structuredClone(emptyData), "2026-10-23", "normal", "昨日", [{ name: "步行", totalSets: 1, completedSets: 1 }]);
  data = saveDailyTraining(data, "2026-10-24", "normal", "今日", [{ name: "臀桥", totalSets: 3, completedSets: 3 }]);
  data.trainingRecords[0].painNotes = "当天反馈";
  const yesterday = structuredClone(data.trainingRecords[1]);
  data = saveDailyTraining(data, "2026-10-24", "normal", "今日调整", [{ name: "臀桥", totalSets: 3 }, { name: "步行", totalSets: 1 }]);
  assert.deepEqual(data.trainingRecords[1], yesterday);
  assert.equal(data.trainingRecords[0].painNotes, "当天反馈");
  assert.equal(data.trainingRecords[0].exercises[0].completedSets, 3);
  assert.equal(data.trainingRecords[0].completed, false);
});
