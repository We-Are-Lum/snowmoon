/** A stretch of the recorded match that one watch screen replays, and how the broadcast films it. */
export type ShotKind = 'crane' | 'wide' | 'follow' | 'low' | 'corner' | 'tower' | 'top';
export interface Segment {
  /** Turns to replay, inclusive. The segment loops unless `hold`. */
  from: number;
  to: number;
  /** Turns per second. */
  speed: number;
  /** The shots to cut between, in order; with 'tower', close-ups of falling towers are cut in by the director. */
  shots: ShotKind[];
  hold?: boolean;
  /** Show the four player cams under the field. */
  cams?: boolean;
  /** Flatten the field into the lesson board as the segment ends. */
  flatten?: boolean;
  /** The Dzegoban countdown over the first seconds (c4-b97–b98). */
  countdown?: boolean;
}
