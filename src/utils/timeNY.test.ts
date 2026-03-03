import { describe, expect, it } from "vitest";
import { currentDateNY, targetDateForHorizon, addDays } from "./timeNY.js";

// EST = UTC-5 (Nov–Mar before DST), EDT = UTC-4 (Mar–Nov after DST)
// DST spring 2026: March 8, clocks spring 2:00 AM → 3:00 AM (EST→EDT)
// DST fall  2026: November 1, clocks fall 2:00 AM → 1:00 AM (EDT→EST)

describe("currentDateNY", () => {
  // Use January (EST=UTC-5) for clean midnight boundary tests
  it("around midnight (EST): 23:50 NY stays on same day", () => {
    // Jan 15 23:50 EST = Jan 16 04:50 UTC
    const now = new Date("2026-01-16T04:50:00Z");
    expect(currentDateNY(now)).toBe("2026-01-15");
  });

  it("around midnight (EST): 00:10 NY is the new day", () => {
    // Jan 16 00:10 EST = Jan 16 05:10 UTC
    const now = new Date("2026-01-16T05:10:00Z");
    expect(currentDateNY(now)).toBe("2026-01-16");
  });

  // Summer (EDT=UTC-4)
  it("around midnight (EDT): 23:50 NY stays on same day", () => {
    // Jul 14 23:50 EDT = Jul 15 03:50 UTC
    const now = new Date("2026-07-15T03:50:00Z");
    expect(currentDateNY(now)).toBe("2026-07-14");
  });

  it("around midnight (EDT): 00:10 NY is the new day", () => {
    // Jul 15 00:10 EDT = Jul 15 04:10 UTC
    const now = new Date("2026-07-15T04:10:00Z");
    expect(currentDateNY(now)).toBe("2026-07-15");
  });

  it("DST spring forward: 01:00 AM EST (before spring) is March 8", () => {
    // Mar 8 01:00 EST = Mar 8 06:00 UTC (before the switch at 2am)
    const now = new Date("2026-03-08T06:00:00Z");
    expect(currentDateNY(now)).toBe("2026-03-08");
  });

  it("DST spring forward: 03:00 AM EDT (after spring) is still March 8", () => {
    // Mar 8 03:00 EDT = Mar 8 07:00 UTC (after switch: was 2am→3am)
    const now = new Date("2026-03-08T07:00:00Z");
    expect(currentDateNY(now)).toBe("2026-03-08");
  });

  it("DST spring night: 23:50 EDT March 8 stays on March 8", () => {
    // Mar 8 23:50 EDT = Mar 9 03:50 UTC
    const now = new Date("2026-03-09T03:50:00Z");
    expect(currentDateNY(now)).toBe("2026-03-08");
  });

  it("DST fall back: 01:50 EDT (before fall) is November 1", () => {
    // Nov 1 01:50 EDT = Nov 1 05:50 UTC
    const now = new Date("2026-11-01T05:50:00Z");
    expect(currentDateNY(now)).toBe("2026-11-01");
  });

  it("DST fall back: 01:10 EST (after fall) is still November 1", () => {
    // Nov 1 01:10 EST (second occurrence) = Nov 1 06:10 UTC
    const now = new Date("2026-11-01T06:10:00Z");
    expect(currentDateNY(now)).toBe("2026-11-01");
  });
});

describe("targetDateForHorizon", () => {
  it("today returns current NY date even when UTC is already tomorrow (EST)", () => {
    // Jan 15 23:50 EST = Jan 16 04:50 UTC — UTC thinks it's Jan 16, NY says Jan 15
    const now = new Date("2026-01-16T04:50:00Z");
    expect(targetDateForHorizon("today", now)).toBe("2026-01-15");
  });

  it("tomorrow returns NY date + 1 (EST midnight edge)", () => {
    const now = new Date("2026-01-16T04:50:00Z"); // 23:50 EST Jan 15
    expect(targetDateForHorizon("tomorrow", now)).toBe("2026-01-16");
  });

  it("day2 returns NY date + 2 (EST midnight edge)", () => {
    const now = new Date("2026-01-16T04:50:00Z"); // 23:50 EST Jan 15
    expect(targetDateForHorizon("day2", now)).toBe("2026-01-17");
  });

  it("00:10 NY: today is the new NY day", () => {
    const now = new Date("2026-01-16T05:10:00Z"); // 00:10 EST Jan 16
    expect(targetDateForHorizon("today", now)).toBe("2026-01-16");
    expect(targetDateForHorizon("tomorrow", now)).toBe("2026-01-17");
  });

  it("correct on DST spring night (before switch, EST)", () => {
    // Mar 8 01:00 EST = Mar 8 06:00 UTC
    const now = new Date("2026-03-08T06:00:00Z");
    expect(targetDateForHorizon("today", now)).toBe("2026-03-08");
    expect(targetDateForHorizon("tomorrow", now)).toBe("2026-03-09");
  });

  it("correct on DST spring night (after switch, EDT)", () => {
    // Mar 8 03:30 EDT = Mar 8 07:30 UTC
    const now = new Date("2026-03-08T07:30:00Z");
    expect(targetDateForHorizon("today", now)).toBe("2026-03-08");
    expect(targetDateForHorizon("tomorrow", now)).toBe("2026-03-09");
  });

  it("DST spring: 23:50 EDT March 8 → today=March 8, tomorrow=March 9", () => {
    const now = new Date("2026-03-09T03:50:00Z"); // 23:50 EDT March 8
    expect(targetDateForHorizon("today", now)).toBe("2026-03-08");
    expect(targetDateForHorizon("tomorrow", now)).toBe("2026-03-09");
  });
});

describe("addDays", () => {
  it("addDays 0 returns same date", () => {
    expect(addDays("2026-03-08", 0)).toBe("2026-03-08");
  });

  it("addDays 1 crosses month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("addDays 1 crosses year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("addDays works during DST transition month", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
});
