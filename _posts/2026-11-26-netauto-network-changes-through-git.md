---
layout: post
title: "NetAuto: Network Changes Through Git, and How It Works"
date: 2026-11-26 12:00:00 +0100
categories: networking automation
excerpt: "My new project NetAuto: VLAN changes as YAML in Git, a pipeline that validates and plans them, Ansible that pushes them one device at a time, and a local console that acts like a careful network engineer."
---

Most network outages I have seen did not start with broken hardware. They started with someone typing a change into a router at the end of the day, with no review, no backup and no easy way back. NetAuto is my answer to that. The idea fits in one sentence: **every network change goes through Git.**

You describe the change in a YAML file, a pipeline checks it, a colleague reviews it, Ansible pushes it, Oxidized backs it up, LibreNMS confirms the network is still up, and a rollback is one button away. This post covers how each of those steps works, the console I built around it, and, as always, what it does not do yet.

### The flow

```
 1. Edit data/sites/<site>.yml        (merge request)
        |
 2. validate  -- YAML, naming, VLAN IDs, IP overlaps, gateway/DHCP, unsafe characters
    plan      -- exact commands per device -> build/plan.md (review this!)
        |
    review + merge to main
        |
 3. deploy    -- manual button. Backup first, then push, one device at a time, then verify
        |
 4. verify    -- Oxidized backup + LibreNMS "is everything up?" + NetBox updated
        |
 5. rollback  -- manual button: back to the previous deployed commit
```

The pipeline is a GitLab CI file with five stages: `validate`, `plan`, `deploy`, `verify` and `rollback`. Deploy and rollback are manual jobs, so nothing touches a device until a person presses the button.

### The network as data

There are two kinds of files. `data/devices.yml` lists every managed device: its name, site, platform (`routeros` for MikroTik or `ios` for Cisco), management IP and trunk ports. Then each site has its own file with its VLANs. Adding a printer VLAN to a site looks like this:

```yaml
  - id: 30
    name: utr-printers
    description: Printers
    subnet: 10.10.30.0/24
    gateway: 10.10.30.1
    gateway_device: utr-core-01
    devices: [utr-core-01, utr-sw-01]
    dhcp:
      start: 10.10.30.100
      end: 10.10.30.150
```

That is the whole change. You do not write a single router command yourself.

### Validate: refuse bad changes early

`scripts/validate.py` runs on every merge request and stops anything that would hurt later. It catches:

* YAML syntax errors and typos in field names (`gatway:` is refused, not ignored).
* VLAN IDs outside 2-4094, reserved IDs (1 and 1002-1005) and duplicate IDs at a site.
* Names that are not lowercase with dashes, longer than 32 characters, or that do not start with the site code.
* Subnets that overlap any other subnet anywhere in the network, or that have host bits set (`10.10.30.5/24`).
* A gateway outside its subnet, on the network or broadcast address, used twice, or placed on a switch that cannot route.
* A DHCP range outside the subnet, backwards, or containing the gateway.
* Devices that do not exist or belong to another site.
* Characters such as `"` `;` `$` `[` in names and descriptions.

That last one matters more than it looks. The names end up inside router commands, so a description with a `;` in it could smuggle a second command onto a device. The validator simply does not allow it.

### Plan: the commands you review are the commands that run

`scripts/plan.py` compares two Git commits and writes the exact commands each device will get into `build/plan.md`, which shows up as a pipeline artifact. The reviewer does not have to imagine what a YAML diff means for a router. They read the commands.

The plan always compares against a Git tag called `deployed`, which marks what is actually on the devices. Because it diffs two full states instead of looking at one commit, it also sees removals: delete a VLAN from the YAML and the plan contains the commands to remove it.

For RouterOS, every object the pipeline creates gets the comment `netauto:vlan<id>`. Each command is written as "create if missing, otherwise update", so running the same plan twice does no harm. And removals only touch objects with that comment, so VLANs someone made by hand are left alone. NetAuto only manages what NetAuto created.

### Deploy: backups first, one device at a time

The Ansible playbook (`community.routeros` and `cisco.ios`) follows a fixed order for every device:

1. **Backup.** On RouterOS, a binary backup and an export on the router itself, plus a copy of the export saved as a CI artifact. On Cisco, the running config goes to the artifacts.
2. **Apply** the planned commands.
3. **Read back.** Ansible reads the VLAN table and asserts that new VLANs are there and removed ones are gone.

One RouterOS detail cost me some thought: RouterOS often prints an error instead of returning an error code. So the playbook reads the output and fails on phrases like `failure:`, `syntax error`, `bad command` or `no such item`. Without that, a failed command would look like a success.

The first device that fails stops the whole run, and the error message says exactly how to roll back, including the backup name on the router. A `resource_group: network` setting in the pipeline makes sure two deploys can never run at the same time.

### Verify and rollback

After a deploy, the `verify` stage runs by itself. It asks Oxidized for a fresh config backup and waits for it, checks in LibreNMS that every changed device is still up, and writes the VLANs, prefixes and gateways to NetBox. The NetBox sync never deletes anything; it only adds and updates.

Rollback has three levels:

* **Normal:** press Revert on the merged merge request in GitLab, merge the new one, deploy. Git and the devices stay in step.
* **Fast, during an outage:** the `rollback` job plans from `deployed` back to `previous-deployed` and pushes that. You can also point it at any commit with `ROLLBACK_TO=<sha>`.
* **Last resort:** restore the backup that was taken right before the change, on the device itself or from Oxidized's Git history.

### The NetAuto console

Pipelines are great for changes, but I also wanted one place to look at the network. So the repo has a browser console, started with `netauto gui`. It is a plain Python standard library web server; the only dependency is PyYAML.

It has pages for the guides, the inventory, the change plan, diagnostics and settings, and a set of tools: a Wi-Fi scan, a network scan with nmap, packet capture with Wireshark's tshark (with a live table, top talkers and a `.pcapng` download), ping, trace route, Zabbix problems and Git/GitHub status. It is styled like an Omarchy desktop with Tokyo Night colours and bundled JetBrains Mono, so it works offline.

Because it can run real network tools, the console is locked down:

* It only listens on `127.0.0.1` and only answers requests for a local host name.
* Every API call needs a token that is put into the page when it loads, so another web site cannot use it from your browser.
* Scan targets, capture filters and interface names are validated before they reach nmap or tshark, and no command ever goes through a shell.
* Scans are capped at a /20 (4096 addresses).
* Git can fetch and fast-forward pull, but never push.

And one rule I hold every tool to: **no made-up data.** When a tool cannot do its job, because nmap is missing, there are no admin rights, Npcap is not installed or nothing answered, the result says so and tells you how to fix it. An empty table that silently means "something went wrong" is worse than an error.

### The network check-up

The tool I use most is the **Network check-up**. It tests the gateway and internet (loss and latency), DNS and HTTPS; the Wi-Fi (signal, security, crowded channels and the best of 1, 6 and 11); every device on the subnet for risky open ports like Telnet, FTP, RDP and VNC, and for devices that were not there last time. For a MikroTik it also audits the router itself: enabled services, UPnP, a firewall input drop rule, an open DNS resolver, SSH strong crypto, neighbour discovery on the WAN, the default admin user and RouterOS updates. It ends with a score out of 100 and a fix for every finding.

For safe MikroTik fixes there is a **Fix it** button that works in three steps:

1. **Preview:** the RouterOS command and the exact REST call.
2. **Dry run:** reads the current value from the router and changes nothing.
3. **Apply:** only after that dry run, after you tick a confirmation box, and only when `NETOPS_DRY_RUN=false`. Afterwards it reads the value back to prove the change happened.

### Improve: hardening this computer, natively

The newest part is **Improve**, which turns check-up findings into firewall and Wi-Fi changes for the computer the console runs on. It uses each operating system's own tools and groups everything under one name, so it never touches existing rules and can be removed in one go:

* **Windows:** `New-NetFirewallRule` in the group `NetAuto`.
* **Linux:** an nftables table `inet netauto` (or ufw rules with the comment `netauto` when ufw is active).
* **macOS:** a pf anchor `netauto`, plus stealth mode in the Application Firewall.

Rules come from a small, fixed catalogue, and each item is only offered when a finding supports it. File sharing open on a public network? Block SMB on the Public profile. Telnet or FTP listening? Block it from the network. Saved open Wi-Fi networks? Stop auto-connecting to them. Every rule only restricts inbound traffic; nothing may block outbound traffic, DNS, DHCP or the LAN, because locking you out of your own network is a failure even if the script "works".

The design choice I am happiest with is how admin rights are handled. The console itself never runs as admin. Instead, Improve writes the reviewed scripts to a run folder with a SHA-256 hash of each one, then opens a separate elevated terminal (UAC on Windows, `sudo` on Linux and macOS) to run them. The script checks its own hash before doing anything, writes a log and a `readback.json`, and the console only marks an item as verified when the operating system reports the rule exists. There is always a **Download script** option too, so you can run it yourself without the console, and an **Undo** that uses the state saved before the change.

### Six workflows for running the network

Changes are only half the job. The repo also has six setups for **operating** a network, which all follow the same loop: detect, decide, act, record.

1. Snort/Suricata + Zabbix + MikroTik: block attackers on the router and power-cycle dead PoE devices.
2. Suricata + Zeek + Wazuh + TheHive + OPNsense: a small SOC with reputation checks, blocks and cases for an analyst.
3. Prometheus + Grafana + Alertmanager: dashboards, alerts and automatic fixes.
4. Security Onion + CrowdSec: community blocklists pushed to the MikroTik.
5. An enterprise reference: FortiGate, Splunk, PRTG and ServiceNow for the same jobs.
6. Uptime Kuma + ntopng + n8n: visual home lab automation with Telegram alerts.

Automatic actions are the dangerous kind, so all six share one safety library (`workflows/common/netops/`):

* **Dry run first:** with `NETOPS_DRY_RUN=true`, every script only says what it would do.
* **Allowlist:** private ranges, loopback and CGNAT space are never blocked. The check returns true only for a valid, public, non-allowlisted address.
* **Rate limits:** a maximum number of blocks per hour and PoE restarts per device per day, kept in a state file so it works across runs. After that, a person takes over.
* **One ticket per problem:** the same key opens at most one ticket per day.
* **Least privilege:** a separate MikroTik user with only REST rights.

Every workflow is also built into a single program (a Windows `.exe`, Linux and macOS binaries, or a `.pyz` for any system with Python) by a GitHub Actions job. You run `setup`, answer a few questions, and it configures the rest.

### Testing

The repo has around 300 unit tests: the validator, the planner, the Oxidized, LibreNMS and NetBox scripts, the workflows, the programs, the console and the Improve generators. The generated firewall scripts are checked against golden files for each operating system, so any change to what a script would do shows up as a diff in review. Stand-ins like a fake MikroTik REST server live only under `tests/`, never in the real code.

### What it does not do (yet)

* It manages VLANs, VLAN interfaces, trunk membership and DHCP. Routing, firewall rules on the network devices and access ports are left alone for now. Those are next.
* The Ansible playbooks are written but have not yet been run against real devices. Until they have, try them in a lab first (GNS3, EVE-NG or a spare MikroTik) with `ansible-playbook deploy.yml --check`.
* On Cisco, the first run assumes the trunk ports already exist.
* It does not turn on bridge VLAN filtering on RouterOS for you, on purpose: that is a classic way to lock yourself out.
* Improve never changes a router without an API. For those you get a written, click-by-click guide to do yourself.
* No script can fix a weak Wi-Fi signal. Distance and walls are physics, and the check-up says so instead of pretending.

The thread through all of it is the same one as in my other projects: show exactly what will happen, test it without changing anything, make the person confirm, prove the result, and keep a way back. Networks are too important to change on trust.
