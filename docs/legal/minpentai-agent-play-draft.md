# Minpentai agent play: consent, Terms and Privacy lines (DRAFT)

> DRAFT v3 for the owner's reread, 2026-10-31 (v1 and v2 earlier the same day). Written by the coding agent (Anthropic's Claude, a closed model). Nothing here is in `src/lib/legal.ts` or live. These lines describe what branch `minpentai-agent-play` does, and they ship with it when `AGENTS.minpentaiPlay` is switched on (owner, 2026-10-18: legal texts describe today).

## 1. Consent screen (the connector's "Allow" page, one line per scope)

> **play**: play Minpentai for you: start matches against the site computer, see only your side, and submit moves

(In code as `SCOPE_TEXT.play` in `src/lib/agents/oauth.ts`; shown only while agent play is switched on.)

## 2. Terms: a new section 6d (v2, owner's changes of 2026-10-31)

> **6d. Minpentai with your agent.** If we invite you, your agent can play Minpentai for you against the site's computer: start a match, see your side of the board (never the other side's while the match is on), try moves in a private sandbox, and send your moves. It sends the moves you choose, or, if you tell it how to play (a standing order), moves it chooses under it; you can also ask the site's computer to play a turn for you. Each turn's record says whether you, your agent or the site's computer chose it. When a match ends, its record is public: the board, every turn's moves, who chose them, and the model your agent said it runs (shown as self-reported; we don't check it). The record doesn't show your Farcaster name or ID, or your agent's name. Agent matches don't count toward one-on-one results. Most of Minpentai's rules are invented for this edition; the book edition's pieces are drawn from passages in the book.

## 3. Privacy: a new paragraph in section 4 (v2)

> If you play Minpentai through your agent (for now, only people the site has invited): each match it starts, kept with your account. That is the board, every turn's moves and who chose them (you, your agent or the site's computer), when each turn was played, your standing order (its words and the style it was matched to), any note your agent attached to a turn, your agent's name and the model it said it runs. While the match is on, only you can see your side, through your agent and your match link; the site's computer sees only its own side. When the match ends, the record is public: anyone can read the board, the moves, who chose them, and the model your agent named. It doesn't show your Farcaster name or ID, or your agent's name (which elsewhere on the site appears as "agent of" you), and your standing order's words and your agent's notes stay private. Your match link opens your side for anyone who has it, until your agent replaces it; the page tells browsers not to pass it on to other sites. Match records, finished or not, are kept until you ask us to remove them: write to us (section 11) with the match's link or id, and we delete the whole record by hand. Neither the site nor its database keys can delete a match record; only we can, on request.

## 4. Privacy section 7 (who else receives data)

No change: agent play sends nothing to another company. The site's computer runs on our own servers, and no AI model is called by us; your agent runs on your own AI app's account.

## Checked against the code

| Line | Where in the code |
|---|---|
| Your side only while the match is on | `solo.ts` `viewFor` (engine `fog()`), `simulate` (view plus your belief) |
| Who chose each turn | `Orders.source`: `agent`, `person`, `site-computer` |
| Public record at the end | `minpentai_get_record`: any connected agent with the scope, only when over |
| Standing order words and notes private | `recordOf` leaves out `standing` and `note` |
| Model, self-reported | `recordOf` `sides.C.model.label: 'self-reported'` |
| Match link | `/minpentai/m/<id>?k=`: secret stored hashed, replaced by `minpentai_new_live_link`; `referrer: no-referrer` |
| Not counted with one-on-one | separate table `studio.mp_agent_matches`, not read by one-on-one |
| Record doesn't show your name, ID or agent's name | `recordOf` has no person or agent field; `sides.C` is `{kind, model}` (test M27) |
| Removal by hand only | neither `studio_writer` nor `service_role` (the secret key) can delete or truncate (`NEXT_minpentai_agent_matches.sql`; test M26) |
