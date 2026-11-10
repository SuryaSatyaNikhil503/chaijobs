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

  it("canonicalises Bangalore to Bengaluru", () => {
    expect(normaliseLocation(["Bangalore/Bengaluru, India"]).cities).toContain("Bengaluru");
  });

  it("canonicalises Vizag spellings to Visakhapatnam", () => {
    expect(normaliseLocation(["Vizag"]).cities).toEqual(["Visakhapatnam"]);
    expect(normaliseLocation(["Vishakhapatnam"]).cities).toEqual(["Visakhapatnam"]);
  });

  it("plain Remote with no country counts as remote India", () => {
    expect(normaliseLocation(["Remote"]).remoteIndia).toBe(true);
  });
});
