# Security

The portal in `frontend/` is a local, single-user research tool: its API routes have no
authentication and several of them spend provider credits or start long model runs. Run it
on localhost only and do not expose `next dev` to an untrusted network.

If you find a vulnerability (for example a way for a client to read or write files outside
`legal-workflow-data/`), please report it privately to the repository owner through GitHub's
"Report a vulnerability" button on the Security tab rather than a public issue. You should
get a reply within a week.
