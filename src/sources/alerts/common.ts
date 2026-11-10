import { decodeEntities } from "../http.js";

export interface AlertLink {
  href: string;
  /** Text cells inside the link. */
  label: string[];
  /** Text cells after the link, up to the next job link. */
  after: string[];
}

const INVISIBLE = /​|‌|‍|⁠|﻿|­/g;
const NAMED_SPACES = /&(nbsp|ensp|emsp|thinsp|zwnj|zwj|shy);/gi;

/** Decodes numeric (&#8203; &#x200B;) and common named entities; spacing entities become spaces. */
function decodeAll(s: string): string {
  return decodeEntities(
    s
      .replace(NAMED_SPACES, " ")
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))),
  );
}

/** Visible text split at every tag boundary: email layouts put each field in its own cell. */
export function textCells(fragment: string): string[] {
  return fragment
    .split(/<[^>]+>/)
    .map((c) => decodeAll(c).replace(INVISIBLE, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Real alert emails are 60-180 KB; anything far larger is not an alert and is skipped. */
const MAX_EMAIL_HTML = 2_000_000;

interface Anchor {
  href: string;
  inner: string;
  start: number;
  end: number;
}

/**
 * Linear scan for <a ...>...</a>. Senders can be spoofed, so a regex that backtracks on crafted markup
 * (1 MB of "<a " took 56 s) is not acceptable; every indexOf here moves strictly forward.
 */
function scanAnchors(html: string): Anchor[] {
  const lower = html.toLowerCase();
  const out: Anchor[] = [];
  let i = 0;
  for (;;) {
    i = lower.indexOf("<a", i);
    if (i === -1) break;
    const after = lower[i + 2];
    if (after !== undefined && !/[\s>]/.test(after)) {
      i += 2;
      continue;
    }
    const tagEnd = lower.indexOf(">", i);
    if (tagEnd === -1) break;
    const close = lower.indexOf("</a>", tagEnd);
    if (close === -1) break;
    const href = /href\s*=\s*"([^"]*)"/i.exec(html.slice(i, tagEnd + 1))?.[1] ?? "";
    out.push({ href: decodeEntities(href), inner: html.slice(tagEnd + 1, close), start: i, end: close + 4 });
    i = close + 4;
  }
  return out;
}

/**
 * Finds the links whose href passes `isJobLink` and pairs each with the cells that follow it.
 * Alert templates change their CSS often; the job-link URL patterns are the stable anchor.
 */
export function jobLinks(html: string, isJobLink: (href: string) => boolean): AlertLink[] {
  if (html.length > MAX_EMAIL_HTML) return [];
  const anchors = scanAnchors(html).filter((a) => isJobLink(a.href));
  return anchors.map((a, i) => ({
    href: a.href,
    label: textCells(a.inner),
    after: textCells(html.slice(a.end, anchors[i + 1]?.start ?? html.length)),
  }));
}

export const stripEllipsis = (s: string) => s.replace(/(\.\.\.|…)$/, "").trim();
