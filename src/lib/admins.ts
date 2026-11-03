import { ADMINS } from './config';

/** Whether this person is an admin (src/lib/config.ts, ADMINS). Safe in the browser. Every admin check goes through here. */
export const isAdmin = (fid: number | null | undefined): fid is number => typeof fid === 'number' && ADMINS.includes(fid);
