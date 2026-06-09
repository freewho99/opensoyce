# On the Record, No. 2 — WOPA: Trust as the Product

> Unscripted on building financial tooling for people who don't sit at desks. Lightly edited for length. Part of the "On the Record" series — candid conversations from inside the gate.

**Interviewer:** P. Finney (OpenSoyce / The Sauce Report)
**Guest:** The founder of WOPA (https://www.mywopa.com/) — solo, building in public, live beta
**Format:** Founder interview / security-and-trust angle
**Status:** DRAFT OUTLINE — for editorial review before publishing

> EDITOR'S NOTE ON FORMAT: Inline **GATE SAYS** blocks are our running reaction — the same detection / evidence / policy / enforcement instinct we apply to packages, pointed at a person for once. Serious where it counts. The full verdict lands at the bottom.

---

## What WOPA Is

WOPA turns a plain-English chat message ("Invoice Dan 450 for electrics") into a structured invoice PDF, shows the tradesperson a preview, sends only after they reply YES, then chases payment on a 7/14/28-day cadence. Landing page promise: invoice in 30 seconds from WhatsApp, no app, no spreadsheet. The audience is UK tradespeople — good at their trade, on site, on WhatsApp, allergic to desks.

The thesis: the problem isn't invoice creation. It's the ~50bn pounds in unpaid invoices across UK micro-businesses, and the social awkwardness of chasing someone you'll see on the next job.

---

## Suggested Narrative Arc

Two clean halves make the editorial spine:

1. **The wedge** (Q1-Q6): why this audience, how they're reached, and why the "confirm before send" step is the entire product.
2. **The hard questions** (Q7-Q13): the stack, and an unusually honest accounting of the security gaps in an early beta moving regulated financial data.

The standout angle: a founder who answers security questions straight instead of reaching for the marketing fog machine. The closing admission (Q13) is the headline.

---

## Full Q&A (with inline GATE SAYS)

### Q1 - Origin story
**Q (Finney):** What's the story behind WOPA? A specific moment where you saw someone drowning in invoice admin?
**A (WOPA):** Tradespeople are good at their trade and bad at getting paid — not from disorganisation, but because the tooling assumes they want a desk. Chasing payment feels awkward, so they let it slide. WOPA targets the unpaid-invoice problem, not invoice creation.

### Q2 - Finding the audience
**Q (Finney):** How are you actually reaching UK tradespeople?
**A (WOPA):** Facebook groups — Electricians Forum UK and equivalents. Sceptical, previously burned by subscriptions, quick to call out anything off. Faster, more honest feedback loop than any beta community.

### Q3 - First contact
**Q (Finney):** What does the first message to WOPA feel like?
**A (WOPA):** They expect a bot, they get something closer to a capable colleague. Natural language in, preview shown, sent only after approval. Surprises: how little friction there is, and that reminders run automatically.

### Q4 - The confirmation step
**Q (Finney):** Was "yes before anything sends" a deliberate trust decision?
**A (WOPA):** Deliberate. Trust is the product. Firing to a customer unseen would break the one thing that matters. It also cuts errors on amounts and names — the two main causes of payment disputes.

> **GATE SAYS:** This is the whole ballgame, and he knows it. "Reply YES to send" is the cheapest, most powerful control in the entire product — a human-in-the-loop gate that costs one word and prevents the two failure modes that turn an invoice into an argument. We spend our days begging package ecosystems to put a confirmation step between "merge" and "production." A solo founder shipped one between "type" and "send" on day one. Detection without enforcement is anxiety with a UI; this is enforcement done right. Credit where it's due.

### Q5 - Building in public
**Q (Finney):** What's genuinely surprised you since launch?
**A (WOPA):** How fast the payment-chasing behaviour unlocks value invoicing alone doesn't. Users who get paid in the first session retain meaningfully higher. The wedge is the automated follow-up, not creation.

> **GATE SAYS:** Translation: the feature people thought they wanted (make a PDF) is the loss-leader; the feature they were too British to ask for (chase my money so I don't have to) is the product. Honest read on his own retention data, not a vanity metric. We approve of founders who can tell the difference between what gets clicks and what gets renewals.

### Q6 - What actually happens
**Q (Finney):** The real version, between "invoice Dave 450" and the PDF in Dave's inbox?
**A (WOPA):** Message in via chat -> backend -> LLM turns plain English into structured fields -> app logic saves draft, generates PDF preview, returns it. Nothing reaches the customer yet. On confirm: invoice email sent with PDF, state stored, reminder flow scheduled. The LLM interprets; it does not decide to send or move money. The backend owns those actions.

> **GATE SAYS:** The single most important sentence in this whole interview, and it's buried in answer six: "the LLM interprets; it does not decide to send invoices or move money." That is the correct architecture, stated out loud. The model is a translator, not a treasurer. Everyone shipping "agentic" anything in 2026 should tattoo this on the inside of their eyelids.

### Q7 - The stack
**Q (Finney):** What sits between a WhatsApp message and a sent invoice?
**A (WOPA):** TypeScript/Node + Postgres. Telegram via Telegraf, WhatsApp via the official Cloud API. OpenRouter/Claude for parsing. Puppeteer for PDFs. Resend for email. pg-boss for reminder jobs. Stripe for billing. Optional Google Drive and HMRC VAT.

### Q8 - Platform dependency
**Q (Finney):** Official Meta WhatsApp Cloud API or something else?
**A (WOPA):** Official Cloud API, so Meta's rules apply. Honest risk: platform dependency — if WhatsApp access is interrupted, that part of the product is too. Mitigation: keep core invoice/payment records outside the messaging channel so WhatsApp is the interface, not the system of record.

> **GATE SAYS:** "WhatsApp is the interface, not the system of record" is exactly the right framing for a business built on a platform that can change its terms on a Tuesday and ruin your week. He's renting the front door from Meta and he knows it. The mitigation is sound on paper; the thing to watch is whether the records actually stay portable as the product grows, or whether WhatsApp quietly becomes load-bearing anyway.

### Q9 - Bank details at rest
**Q (Finney):** Where does regulated financial data live after entry? Encrypted? Key management? Access?
**A (WOPA):** Bank details stored in the database because they appear on invoices. Provider gives encryption at rest; access restricted to the founding team. Honest gap: no dedicated application-level encryption / key-management layer yet. Interim beta position, not the long-term model.

> **GATE SAYS:** And here's where the comedy stops and we read the label. Sort codes and account numbers are flowing through chat — the WOPA homepage demo literally shows "12-34-56, 12345678" on screen — and the honest answer is: managed encryption-at-rest, founder-only access, no field-level encryption or real key management yet. To be clear about what "encryption at rest" buys you: it protects against someone stealing the physical disk. It does NOT protect against a leaked credential, a compromised founder laptop, or a SQL bug — the threats that actually happen. He says this himself and calls it interim. We believe him. We also note that "interim" and "regulated UK financial data in live use" are two phrases that should not share a sentence for very long. This is the exception, not the ALLOW.

### Q10 - The LLM and data retention
**Q (Finney):** What's doing the parsing, and what are the retention terms?
**A (WOPA):** Third-party LLM via OpenRouter, Claude-backed, extracting name/amount/due date/job description. No payment credentials sent to the LLM, but invoice text can contain personal/business data. Direction: keep the LLM's role narrow, avoid unnecessary context, move toward stronger retention guarantees.

> **GATE SAYS:** Good instinct — credentials stay out of the model — but "invoice text can still contain personal data" is doing quiet heavy lifting. A job description plus a name plus an address is plenty of PII to care about under UK GDPR, and "we'll move toward stronger retention guarantees" is a roadmap, not a DPA. Narrow the context, yes. Also: read your sub-processor's retention terms before a customer's solicitor reads them for you.

### Q11 - Authentication
**Q (Finney):** Auth is "WhatsApp number equals identity." SIM swap, stolen phone, shared device?
**A (WOPA):** Threat model accurate. The chat account is effectively the identity — very low friction, but a compromised account/device is serious. Acceptable only for a limited, monitored beta. Next step: step-up auth for sensitive actions (exports, wider history, changing bank details, high-value invoices), likely a PIN or second factor.

> **GATE SAYS:** He didn't flinch, which we respect, so we'll say it plainly: right now your phone IS your password, and SIM-swap fraud is not a hypothetical — it's a Tuesday for the kind of criminal who likes invoices. "WhatsApp number equals identity" is a brilliant onboarding decision and a terrifying security decision wearing the same coat. The proposed fix — step-up auth on the dangerous verbs (change bank details, export, high-value send) — is exactly the right list. The grade depends entirely on the gap between "next step" and "shipped." Detection: clear. Policy: correct. Enforcement: not yet built. That's the exception.

### Q12 - Reminder emails vs scams
**Q (Finney):** Your reminders look like what payment scammers send. How does a customer know it's real?
**A (WOPA):** Sent from a WOPA-managed address, not a spoof of the tradesperson. References the specific invoice number, job, amount, business identity. Never asks for bank details by reply. Defence is specificity and consistency. Wording matters — firm enough to get paid, not generic-scam-shaped.

> **GATE SAYS:** Underrated risk, well spotted by the interviewer. An automated email saying "you owe money, here are bank details" is, structurally, a phishing email that happens to be telling the truth. Specificity (real invoice number, real job, no "reply with your card") is the right defence, and sending from a managed domain beats spoofing the tradesperson. The thing nobody mentioned: SPF/DKIM/DMARC alignment on that sending domain is what actually keeps these out of spam AND keeps an attacker from impersonating WOPA. Make sure Resend is locked down. The customer can't verify trust they never received.

### Q13 - The honest one
**Q (Finney):** The one security thing you know isn't solved yet — and when you're fixing it?
**A (WOPA):** Sensitive-data protection. Bank and customer data sit behind managed infra controls today, but not the application-level encryption, key management, access auditing, and step-up auth I want before calling it production-grade. The fix is a security hardening phase before leaving beta — not one feature. Until then, WOPA should be treated as an early beta, not finished financial infrastructure.

> **GATE SAYS:** Read that last sentence again, because it's the rarest thing in this entire industry: a founder voluntarily writing his own warning label. "Treat WOPA as an early beta, not finished financial infrastructure" is a sentence most companies would need a breach and a regulator to say out loud. He said it unprompted, in an interview, while asking people to sign up. That is the honesty the whole "On the Record" series exists to reward. It does not patch the gaps. But it tells you he knows where they are, which is the difference between a beta and a liability.

---

## Pull Quotes (candidate)

- "Trust is the product."
- "The LLM interprets; it does not decide to send invoices or move money. The backend owns those actions."
- "WhatsApp is the interface, not the system of record."
- "Until that is done, WOPA should be treated as an early beta, not as finished financial infrastructure."

---

## THE GATE'S VERDICT

**Detection:** Five honest security gaps surfaced — bank details without field-level encryption, phone-as-identity auth, third-party LLM PII exposure, platform dependency, and reminder-email deliverability/spoofing risk.

**Evidence:** Self-reported by the founder, on the record, with no deflection. The product architecture (confirm-before-send, LLM-interprets-but-doesn't-act, records outside the channel) is genuinely sound. The hardening (encryption/key management, step-up auth, audit logs) is named but not yet shipped.

**Policy:** A live beta moving regulated UK financial data is a real-world risk, not a thought experiment. But a founder who labels his own product "not finished financial infrastructure" is doing the one thing our whole series asks for.

**Enforcement →** **ALLOW — WITH EXCEPTIONS.**

We'd let WOPA through the gate, the same way we let five advisories and an ALLOW coexist in No. 1: not because there's nothing to fix, but because the decision is explainable and the gaps are known, named, and on a roadmap. The conditions on that ALLOW: field-level encryption + real key management for bank details, step-up auth on the dangerous verbs, audit logging, and DMARC on the sending domain — all before WOPA stops calling itself a beta.

The joke writes itself — an invoicing tool named WOPA that's refreshingly un-WOPA about its own security. But the serious version is the one worth printing: most founders bury the gaps, then a breach exhumes them. This one handed us the shovel and pointed at where the bodies aren't buried yet. Ship the hardening phase, earn the "production-grade" line, and there's no exception left to write.

We'll keep putting these on the record.

---

## Editorial Notes / Open Items

- Verify the ~50bn unpaid-invoice figure before publishing.
- WOPA founder is unnamed in source material and not listed on mywopa.com — get a name + sign-off on direct quotes before publishing.
- Note for accuracy: mywopa.com itself states WOPA is "not currently HMRC-recognised or MTD-compatible" — that voluntary disclosure reinforces the candor angle; consider citing it.
- Confirm hero asset (reuse On-the-Record series styling); the WOPA chat-mockup imagery is strong and on-brand if we can get permission to use it.
- Keep the tone fair — the honesty is the story, not a hit piece.

#ON-THE-RECORD #FOUNDER-INTERVIEW #TRUST-DECISIONS #FINTECH #ALLOW-WITH-EXCEPTIONS #DRAFT
