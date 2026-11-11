# Grading rubric (blind)

Each question in `pack.json` has four answers under letters. You don't know which model wrote which; don't try
to find out (don't open the run files or a key). Grade each answer against the book's text in `blocks`
(the answering blocks in `gold`, every block an answer cites, and the block before each).

Per answer:
- `claims`: the separate statements it makes about the book (0 if it shows nothing or only says the passages don't say).
- `supported`: claims a block it cites states (with the block before it as context).
- `unsupported_but_true`: claims true of the book (checkable in `blocks`) but not stated by the block it cites.
- `unsupported`: claims not supported: wrong, invented, or not checkable from the blocks.
  supported + unsupported_but_true + unsupported = claims.
- `correct`: `yes` (answers the question as `answer_fact` and the gold block give it), `partly` (some of it, nothing false),
  `cant` (says it can't tell, or was not shown), `no` (answers something else, nothing false), `wrong`
  (states anything false about the book, even one changed detail).
- `note`: one line for anything not `yes`.

Write `grades-<you>.json`: `{ "grader": "...", "items": [{ "id", "label", "claims", "supported", "unsupported_but_true", "unsupported", "correct", "note" }] }`, one item per answer (200).
