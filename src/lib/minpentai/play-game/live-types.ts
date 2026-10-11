/**
 * The contract between the Play page and the server for the computer ladder and one-on-one
 * (owner, 2026-10-09: invite links and a lobby that lists ready players by Farcaster username,
 * pick who you play; Farcaster sign-in only for playing other people; ladder progress in a new
 * private table). Shapes only; the routes are under src/app/api/minpentai/.
 *
 * Every request carries the Quick Auth bearer token (sdk.quickAuth.fetch / the web session).
 * Every response is `Cache-Control: private, no-store`: views are per player, and a cached one
 * would show one player's fog to the other.
 *
 * The server holds the whole match. A browser only sends placements on its own turn to act and
 * only ever receives what its towers light (rules page §5): its pieces, the rocks, anything within
 * sight, and "last seen" outlines. Both players act at once and in secret (rules page §4).
 */
import type { Piece, RuleId, Side } from './game';

/** A board as one player may see it. Keys are squares (K(x, y)). */
export interface BoardView {
  step: number;
  rock: number[];
  /** [square, owner] for towers this player can see (all of their own). */
  tw: [number, Side][];
  /** [square, owner, hit points] for squares this player can see. */
  sq: [number, Side, number][];
  /** [x, y, dx, dy, owner] for gliders this player can see. */
  gl: [number, number, number, number, Side][];
  /** Squares that broke this step, if this player can see them. */
  flash: number[];
}

/** GET /api/minpentai/ladder (signed in). */
export interface LadderProgress {
  /** Highest rung open, 1–5. */
  opened: number;
  /** Per rung: tries, and the step of the first win. */
  rec: Record<number, { tries: number; won?: number }>;
}
/** POST /api/minpentai/ladder/result. The match runs in the browser against the computer;
 * the server checks the rung is open and records the try. */
export interface LadderResultBody { rung: number; win: 'C' | 'A' | 'D'; step: number }

export interface Person { fid: number; username: string }

/** GET /api/minpentai/lobby (signed in). Polled every 3 s while the Play a person screen is open. */
export interface LobbyView {
  me: { ready: boolean; username: string | null; readyUntilMs: number | null };
  /** Other ready players, newest first, without anyone either side has blocked. */
  ready: Person[];
  /** Challenges to me, still open (20 s to accept). */
  incoming: { id: string; from: Person; msLeft: number }[];
  /** My open challenge, if any. */
  outgoing: { id: string; to: Person; msLeft: number } | null;
  /** A match I am in that has not ended: open it. */
  match: { id: string } | null;
  serverNow: number;
}
/** POST /api/minpentai/lobby/ready {nameProof} (ready for 3 minutes; repeat to stay), DELETE to stop. */
/** POST /api/minpentai/challenge {toFid} → { id }. POST /api/minpentai/challenge/:id/accept → { matchId }.
 *  POST /api/minpentai/challenge/:id/decline. */
/** POST /api/minpentai/invite {nameProof} → { token }. The link is /minpentai?invite=<token>.
 *  GET /api/minpentai/invite/:token → { from: Person, open: boolean }.
 *  POST /api/minpentai/invite/:token/accept {nameProof} → { matchId }. Expires after 24 h; one use. */
/** POST /api/minpentai/block {fid}: never list, challenge or match me with them again. */

export type LivePhase = 'act' | 'run' | 'paused' | 'over';

/** GET /api/minpentai/match/:id?v=<version>: 204 if the version is unchanged, else this. */
export interface MatchView {
  id: string;
  version: number;
  you: Side;
  opponent: Person;
  rule: RuleId;
  /** Sight (3, or 2 under sight2), turn interval (12, or 8), glider cost (4, or 3). */
  R: number;
  every: number;
  cost: number;
  phase: LivePhase;
  /** The board as you see it now (at the end of the latest run). */
  board: BoardView;
  /** Your towers when this turn to act began: where you may place (lit within R). */
  snap: number[];
  /** Where you last saw the opponent's towers: square → step. */
  lastSeen: Record<number, number>;
  /** The run that led to this turn to act (or to the end), one view per step, for playback at
   * 170 ms a step. Empty at setup. */
  frames: BoardView[];
  /** This turn to act: your placements so far, whether you have ended your turn, whether they have. */
  mine: { t: Piece; x: number; y: number; dx: number; dy: number }[];
  ended: boolean;
  oppEnded: boolean;
  /** Milliseconds until the act clock runs out (setup 90 s, then 45 s; starts after the frames play). */
  msLeft: number | null;
  /** Paused because a player has not been heard from: who, and milliseconds until it counts as resigning. */
  paused: { who: 'you' | 'opponent'; msLeft: number } | null;
  /** Once over: the whole board, the true counts, and why. */
  result: {
    win: Side | 'D';
    why: string;
    kind: 'end' | 'resign' | 'left' | 'gone' | 'cancelled';
    step: number;
    /** Every step, whole board, for "watch it again". */
    replay: BoardView[];
    /** Rematch: asked by you / by them, and milliseconds left (20 s, both must press). */
    rematch: { mine: boolean; theirs: boolean; msLeft: number; matchId: string | null };
  } | null;
  serverNow: number;
}
/** POST /api/minpentai/match/:id/turn { placements, ended } → MatchView. Replaces your placements
 * for this turn to act; refused (409) outside your act phase or after the clock. */
export interface TurnBody { placements: { t: Piece; x: number; y: number; dx: number; dy: number }[]; ended: boolean }
/** POST /api/minpentai/match/:id/resign · /leave (leaving at setup cancels with no result; later it
 * counts as resigning) · /rematch → MatchView. Polling the match also counts as being there: a
 * player not heard from for 15 s pauses the match for both; after 60 s more it counts as resigning. */
