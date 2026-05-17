# Dependency confusion detection

OpenSoyce v0 detects the **dependency confusion** attack class on `npm` and
`PyPI` lockfiles. Reference: Alex Birsan, *Dependency Confusion: How I
Hacked Into Apple, Microsoft and Dozens of Other Companies* (Feb 2021).

## The attack

Your team uses a private package — e.g. `mycompany-internal-utils` on
internal PyPI or `@mycompany/ai-client` on a private npm registry. An
attacker publishes a package with the **same name** to the **public**
registry. If pip / uv / npm index priority is misconfigured, the public
copy wins and your CI installs attacker code.

There is no public registry of "this name is private to my company." The
user has to declare it.

## The `.opensoyce-private` file

Drop a `.opensoyce-private` file next to your lockfile. One package name
per line. `#` starts a comment. Trailing `# comment` on a name line is
captured and shown in the chip tooltip.

```
# .opensoyce-private — private package names for dependency-confusion detection

mycompany-internal-utils       # python: internal helper library
@mycompany/ai-client           # npm: scoped private SDK
mycompany-llm-tools            # python: AI utilities
```

Names are **case-sensitive**. The file is **ecosystem-agnostic** — a name
listed here is checked everywhere it appears (npm + PyPI). Cross-ecosystem
collisions are rare and listing a name once is more honest than asking
users to maintain two files.

## Confidence tiers

| Tier   | When it fires                                              | Chip                       |
| ------ | ---------------------------------------------------------- | -------------------------- |
| MEDIUM | Static match: the name is in `.opensoyce-private`.         | ⚠ POSSIBLE DEP CONFUSION   |
| HIGH   | Same + the public registry returned 200 for that name.     | ⚠ ACTIVE DEP CONFUSION     |

HIGH is the actionable case: an attacker has published your private name
to the public registry. MEDIUM is the configuration-hygiene case: verify
your index priority before someone does.

## Auto-discovery

The CLI looks for `.opensoyce-private` in the lockfile's parent directory.
Override with `--private <path>`. Missing file is the silent default — no
chip, no signal, scan continues normally.

## Scope and caveats

- **No score math, no Risk Profile contribution, no verdict band-cap.**
  The chip is informational. Surfacing the signal honestly is the goal.
- **Active checks are cached 24h** per `(ecosystem, name)` pair.
- **Failure-isolated.** A registry probe that 5xx's or times out leaves
  the MEDIUM static signal in place and skips the escalation.
- **No inference.** We never guess that a name is private. The list is
  authoritative.
