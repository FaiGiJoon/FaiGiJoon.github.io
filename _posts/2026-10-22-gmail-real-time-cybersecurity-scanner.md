---
layout: post
title: "Gmail Real-Time Cybersecurity Scanner: How It Works"
date: 2026-10-22 14:00:00 +0200
categories: security gmail
excerpt: "My open source Gmail phishing scanner: one detection engine, three ways to use it, a plain scoring model that shows its reasons, and a Claude skill on top."
---

Most phishing tools give you a verdict and nothing else. "Dangerous" is not very useful when you want to know *why*, and it is even less useful when the tool is wrong. So when I started building the [Gmail Real-Time Cybersecurity Scanner](https://github.com/FaiGiJoon/Gmail-Real-Time-Cybersecurity-Scanner), I made one rule for myself: every score has to come with its reasons.

This post covers what the project is, how a message gets scored, what it checks, and just as important, what it does not do.

### One engine, three surfaces

The scanner looks at the email you have open and shows a score with the findings behind it. You can use it in three ways:

* **Gmail add-on** built on Google Apps Script, shown as a card next to your message.
* **Chrome extension** (Manifest V3) that works on the Gmail page.
* **CLI and MCP server** so an AI assistant or a terminal can scan messages too.

All three run the same detection code. It lives in one file, `core/scanner-core.js`, and a small sync script copies it into the Apps Script file, the extension and the CLI. Apps Script cannot import files, so copy-and-sync was the simplest way to avoid three engines slowly drifting apart. A test fails if the copies ever differ.

### How a message gets scored

The model is deliberately boring. Every message starts at 100. Each distinct finding subtracts a weight based on its severity:

* critical: 70
* high: 40
* medium: 18
* low: 6

The result is red if there is any critical finding or the score drops under 40. It is yellow if there is a high finding or the score is under 80. Otherwise it is green. A green result means "no threats found", never "safe", and checks that could not run are listed as not checked instead of being silently skipped.

Here is a made-up example that I ran through the engine: an email with the display name "PayPal Support", sent from a lookalike domain, with a Reply-To pointing at a free-mail address, failing SPF and DMARC, urgent wording and a link whose text does not match where it goes. That scored 0 and came out red, with a combined "spoofed phish" finding on top of several high ones. Every one of those reasons is shown on the card, so you can disagree with them.

### What it checks

Without listing every rule, the checks fall into five groups:

* **Authentication:** it reads the SPF, DKIM, DMARC and ARC results that the receiving server already put in the headers. It does not do its own DNS lookups.
* **Sender:** Reply-To and Return-Path mismatches, a well-known brand in the display name sent from the wrong domain, first-time senders, and very new sender domains.
* **Links:** text that does not match the destination, hidden links, lookalike and punycode domains, typosquats, raw IP addresses, URL shorteners, long redirect chains and, if you add a key, Google Safe Browsing hits.
* **Content:** pressure language in English and Dutch, callback phishing (a phone number plus a lure, no link) and hidden text. It also looks for prompt injection aimed at AI assistants, because an email is untrusted input and should never be treated as instructions.
* **Attachments:** dangerous extensions, double extensions like `invoice.pdf.exe`, macro files, encrypted archives, risky PDF markers, files whose real type does not match their name and, optionally, a VirusTotal hash lookup.

It is all rule-based. There is no machine learning in the detection, and I think that is a feature: you can read the rules and understand every verdict.

### Privacy and permissions

There is no server run by me. The scanner reads mail through the Gmail API with your own login. The add-on asks for `gmail.modify` and has no permission to send mail or delete it permanently. The two actions it offers are careful ones: "Neutralize" moves the thread to Spam and adds a Security Review label, and "Report" only creates a draft addressed to the Anti-Phishing Working Group that you send yourself.

Some data does leave your machine when you turn on the optional lookups: link URLs go to Safe Browsing, domain names go to a public RDAP service to find the domain age, and file hashes go to VirusTotal. Deep Scan also fetches the links in a message, which can tell a sender that the mail was opened, so it is off unless you ask for it.

### Testing and bugs

The project has 53 automated tests that run offline: 28 for the core engine, 10 for the add-on, 7 for the extension and 8 for the CLI. I also wrote down six high-severity bugs I found and fixed along the way, each with a regression test. Tests cannot prove everything about live Gmail, so the repo also has a manual deploy checklist.

### The Claude skill

I also turned the scanner into a Claude skill. You can ask Claude things like "is this email legit?" and it checks the sender, headers, links and attachments, then answers in a fixed format: verdict, why, what to do now and what was not checked. The skill treats email content as untrusted data, never opens links from a message, and asks before it labels, trashes or moves anything.

The skill is a companion to the repo, not a copy of it. It bundles an offline Python scanner and a TypeScript server for use in Claude Code, so its verdicts can differ a little from the add-on. Keeping those in step is on my to-do list.

### What it does not do

I would rather be clear about the gaps than oversell it:

* No QR code (quishing) detection.
* No machine learning, and no scoring of how well it would catch a brand new attack style.
* It does not look at inbox forwarding rules or filters.
* The brand list is small, and typosquat detection only catches domains within a couple of character edits.
* It is a triage aid for one open message. It labels and moves mail but it does not block anything.

### Try it

The code, setup notes and docs are on [GitHub](https://github.com/FaiGiJoon/Gmail-Real-Time-Cybersecurity-Scanner). If you find a false positive or a phishing trick it misses, open an issue. That is exactly how it gets better. If you like this kind of project, you might also enjoy my posts on [securing local AI with Ollama and OpenClaw]({% post_url 2026-04-18-securing-ollama-with-openclaw %}) and [building with Google Jules]({% post_url 2026-04-18-building-with-google-jules %}).
