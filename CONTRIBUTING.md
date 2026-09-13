# Contributing

TSQH is a small TypeScript case study. Keep changes narrow, deterministic, and understandable
from a clean checkout. Version 0 is a sequential local controller; changes must preserve that
scope unless a new specification explicitly expands it.

## Local setup

Use Node.js 22.12.0 or newer and pnpm 11.17.0. The repository records the Node version in
[`.nvmrc`](.nvmrc), enforces the package engine through [`.npmrc`](.npmrc), and keeps the install
reproducible with [`pnpm-lock.yaml`](pnpm-lock.yaml).

```sh
git clone <repository-url>
cd tsqh-mvp
corepack enable
corepack pnpm install --frozen-lockfile
```

The checkout is self-contained. Do not add credentials, private environment files, build output,
coverage, scanner reports, or run stores to a change. Use [`.env.example`](.env.example) only as a
template for the optional local Sonar service.

## Checks

Run the smallest relevant command while iterating, then the fast repository check:

```sh
pnpm typecheck
pnpm quality:quick
```

Before delivery, run the complete local chain when its Sonar prerequisite is available:

```sh
pnpm quality:full
```

The chain is fail-fast and runs `quick`, coverage, CRAP, Knip, mutation, and Sonar in that order.
A missing tool, incomplete evidence, or unavailable approved Sonar service is a blocker; do not
weaken a threshold or rewrite evidence to make a check pass.

## Change hygiene

- Keep repository content in English and follow [`.editorconfig`](.editorconfig).
- Use pnpm exclusively and preserve the single lockfile.
- Keep workflow policy and quality configuration outside writing-role paths.
- Keep [`STATUS.md`](STATUS.md) concise and current. When implementation state or a blocker
  changes, update it; move detailed completed-increment evidence and superseded snapshots to
  [`STATUS-HISTORY.md`](STATUS-HISTORY.md), which is not current release evidence.
- Never commit credentials or raw secret findings.

See [`README.md`](README.md) for the product and local Sonar setup, and [`SECURITY.md`](SECURITY.md)
for the trust boundary and reporting guidance.
