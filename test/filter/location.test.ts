import { describe, expect, it } from "vitest";
import { normaliseLocation } from "../../src/filter/location.js";

describe("normaliseLocation", () => {
  it.each([
    [["Bangalore/Bengaluru, India"], true, false],
    [["Hyderabad, Telangana; Pune"], true, false],
    [["Visakhapatnam"], true, false],
    [["Vishakhapatnam"], true, false],
    [["Kochi, Kerala"], true, false],
    [["India - Remote"], false, true],
    [["Remote (US)"], false, false],
    [["Pune, Maharashtra"], false, false],
    [[], false, false],
  ])("classifies %j", (input, southIndia, remoteIndia) => {
    const r = normaliseLocation(input);
    expect(r.southIndia).toBe(southIndia);
    expect(r.remoteIndia).toBe(remoteIndia);
  });

  it("a US Salem is not South India", () => {
    expect(normaliseLocation(["Salem, OR, USA"]).southIndia).toBe(false);
  });

  it("Remote, IN (Indiana) is not remote India", () => {
    expect(normaliseLocation(["Remote, IN"]).remoteIndia).toBe(false);
  });

  it("trailing punctuation does not hide a city", () => {
    expect(normaliseLocation(["Bangalore."]).cities).toEqual(["Bengaluru"]);
  });

  it("canonicalises Bangalore to Bengaluru", () => {
    expect(normaliseLocation(["Bangalore/Bengaluru, India"]).cities).toContain("Bengaluru");
  });

  it("canonicalises Vizag spellings to Visakhapatnam", () => {
    expect(normaliseLocation(["Vizag"]).cities).toEqual(["Visakhapatnam"]);
    expect(normaliseLocation(["Vishakhapatnam"]).cities).toEqual(["Visakhapatnam"]);
  });

  it("plain Remote with no country does not count as remote India", () => {
    expect(normaliseLocation(["Remote"]).remoteIndia).toBe(false);
    expect(normaliseLocation(["Remote - Maryland"]).remoteIndia).toBe(false);
  });

  it("remote anywhere or worldwide counts as remote India", () => {
    expect(normaliseLocation(["Remote - Anywhere"]).remoteIndia).toBe(true);
    expect(normaliseLocation(["Worldwide (Remote)"]).remoteIndia).toBe(true);
  });
});
