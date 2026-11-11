import { CHALLENGE } from '../config';
import { momentById, type Moment } from './moments';

/**
 * The moments switch (CHALLENGE.moments; owner, 2026-11-08: off, the code and data kept). Every page and text that
 * would show a picture's moment asks shownMoment: with the switch off it is always null, so nothing shows a moment, even
 * for a picture made with one.
 */
export const momentsOn = (on: boolean = CHALLENGE.moments) => on;
export const shownMoment = (id: string | null | undefined, on: boolean = CHALLENGE.moments): Moment | null => (on ? momentById(id) : null);
