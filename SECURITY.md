# Security

TSQH is a local version 0 controller for a trusted operator. It is not a production sandbox,
multi-tenant service, or isolation boundary against another process running as the same operating
system user.

The controller keeps transition selection in validated configuration, runs one action at a time,
limits process output, restricts forwarded environment values, and checks Git-visible changes after
agents and native quality gates. These checks detect policy violations after execution; they do not
prevent every local filesystem or network operation and they do not provide rollback.

Do not disclose credentials, tokens, or other sensitive data in a public issue. Use the repository
host's private security reporting mechanism when one is available. For ordinary documentation or
reproducible non-sensitive defects, open a normal issue with the smallest useful reproduction.

Version 0 does not provide remote execution, managed worktrees, crash-safe resume, persistent
leases, automatic rollback, or hostile same-user containment. These are explicit boundaries of the
current design.
