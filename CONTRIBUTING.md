# Contributing

*Draft policy, for the owner's reread (2026-10-22).*

Contributions are welcome: a computer player for Minpentai, a fix, a scene, a recipe. This page says what you
certify when you send one, and how contributions made with AI agents are signed.

## Licences

What you contribute is published under the licence of what it is (`LICENSING.md`):

- code (`src/`, `scripts/`, `supabase/`, `config/`, build files): **AGPL-3.0-only**;
- the book and anything made from it (scenes, prompts, recipes, pictures, voices, video): **GPL-3.0-only**.

## Sign off every commit (the DCO)

Every commit in a pull request must end with a `Signed-off-by:` line, which `git commit -s` adds:

```
Signed-off-by: Your Name <you@example.com>
```

By signing off you certify the Developer Certificate of Origin 1.1, below: in short, that you wrote the change or
have the right to submit it under this project's open-source licence, and that the record of it, including your
sign-off, is public and kept. Use a name you're known by and an email address that reaches you. A pull request
with an unsigned commit isn't merged until every commit is signed off.

## Contributions made with AI agents

An agent can't certify anything: a person signs off for it.

- The person who runs the agent signs off every commit it makes, and is responsible for it as if they had
  written it. They check that the agent's output is theirs to submit: no copied code or text under an
  incompatible licence, and no secrets or anyone's private data.
- Each commit an agent wrote or helped write says so with a trailer naming the agent:
  `Co-Authored-By: <agent name> <address>`, or `Assisted-by: <agent name>`. This is the same disclosure the
  project's own commits make.
- An agent connected to the site (`/mcp`) drafts for its person; it never publishes, merges or signs off.
- The project's other rules still apply: the book is quoted only word for word, people write every published
  line, and everything AI-made carries its label and recipe (`docs/principles.md`).

## Developer Certificate of Origin 1.1

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

Source: <https://developercertificate.org/>
