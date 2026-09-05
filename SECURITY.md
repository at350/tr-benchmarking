# Security

The portal in `frontend/` is a local, single-user research tool: its API routes have no
authentication and several of them spend provider credits or start long model runs. Run it
on localhost only and do not expose `next dev` to an untrusted network.

If you find a vulnerability (for example a way for a client to read or write files outside
`legal-workflow-data/`), please report it privately rather than in a public issue: use GitHub's
"Report a vulnerability" button on the repository's Security tab if it is shown, or otherwise
open an issue that says only that you have a security report and asks for a private contact,
and the owner will reply with one. You should get a reply within a week.
