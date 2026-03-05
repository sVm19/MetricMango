const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateDaysSinceStart, getEmailTemplateForDay, calculateNextDripAt } = require("./dripCampaignService");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

test("calculateDaysSinceStart handles same day, exact day, floor, and invalid input", () => {
  const start = 1000000;
  assert.equal(calculateDaysSinceStart(start, start + 1000), 0);
  assert.equal(calculateDaysSinceStart(start, start + MS_PER_DAY), 1);
  assert.equal(calculateDaysSinceStart(start, start + MS_PER_DAY + (MS_PER_DAY / 2)), 1);
  assert.equal(calculateDaysSinceStart(null, 10000), -1);
  assert.equal(calculateDaysSinceStart(10000, undefined), -1);
});

test("getEmailTemplateForDay returns configured templates and null otherwise", () => {
  const store = { name: "Test Store" };
  assert.equal(getEmailTemplateForDay(1, store).key, "day1");
  assert.equal(getEmailTemplateForDay(3, store).key, "day3");
  assert.equal(getEmailTemplateForDay(6, store).key, "day6");
  assert.equal(getEmailTemplateForDay(2, store), null);
  assert.equal(getEmailTemplateForDay(4, store), null);
});

test("calculateNextDripAt advances through the configured drip schedule", () => {
  const startMs = 1000000;
  assert.equal(calculateNextDripAt(1, startMs), startMs + (3 * MS_PER_DAY));
  assert.equal(calculateNextDripAt(3, startMs), startMs + (5 * MS_PER_DAY));
  assert.equal(calculateNextDripAt(5, startMs), startMs + (6 * MS_PER_DAY));
  assert.equal(calculateNextDripAt(6, startMs), null);
  assert.equal(calculateNextDripAt(7, startMs), null);
  assert.equal(calculateNextDripAt(2, startMs), startMs + (3 * MS_PER_DAY));
  assert.equal(calculateNextDripAt(4, startMs), startMs + (5 * MS_PER_DAY));
});
