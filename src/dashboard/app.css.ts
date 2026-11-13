/** Served at /app.css (CSP allows styles from self only). Tokens: a cool "monsoon morning" palette. */
export const APP_CSS = `
:root{--bg:#f4f7f6;--surface:#fff;--ink:#17212b;--muted:#5a6872;--line:#d9e1de;--good:#2f7a55;--warn:#b7791f;--focus:#2f7a55;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0e1416;--surface:#151d20;--ink:#e4ebe8;--muted:#9aa8ad;--line:#26332f;--good:#6fbf93;--warn:#e0a54b;--focus:#6fbf93;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:52rem;margin:0 auto;padding:2rem 1rem 4rem}
a{color:inherit;text-underline-offset:.2em}
a:focus-visible,button:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.headline{font-size:clamp(1.6rem,4.5vw,2.4rem);line-height:1.15;font-weight:650;letter-spacing:-.015em;margin:0 0 .5rem;max-width:30ch}
.meta{color:var(--muted);margin:0 0 2rem}
.note{background:var(--surface);border-left:3px solid var(--warn);padding:.5rem .75rem;margin:0 0 1.5rem}
h2{font-size:1.1rem;margin:2.25rem 0 .5rem}
.jobs{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.job{display:grid;grid-template-columns:1fr auto;gap:.25rem 1rem;padding:1rem 0;border-bottom:1px solid var(--line)}
.job .title{font-weight:600;font-size:1.05rem}
.job .where{color:var(--muted)}
.skills{margin:.25rem 0 0;font-size:.95rem}
.have{color:var(--good)}.need{color:var(--warn)}
.chip{display:inline-block;font-size:.8rem;padding:0 .4rem;border:1px solid var(--warn);color:var(--warn);border-radius:.25rem;margin-left:.4rem;vertical-align:.1em}
.status{display:flex;gap:.4rem;align-items:center;align-self:start}
select,button{font:inherit;font-size:.9rem;padding:.3rem .5rem;border:1px solid var(--line);border-radius:.3rem;background:var(--surface);color:var(--ink)}
button{border-color:var(--good);color:var(--good);cursor:pointer}
details{border-top:1px solid var(--line);padding:.75rem 0}
summary{cursor:pointer;font-weight:600}
.plain{list-style:none;padding:0;margin:.5rem 0 0}.plain li{padding:.2rem 0}
.muted{color:var(--muted)}
pre.jd{white-space:pre-wrap;word-wrap:break-word;font:inherit;background:var(--surface);border:1px solid var(--line);padding:1rem;border-radius:.3rem}
dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}dl.facts dt{color:var(--muted)}dl.facts dd{margin:0}
@media (max-width:640px){.job{grid-template-columns:1fr}.status{margin-top:.5rem}}
`;
