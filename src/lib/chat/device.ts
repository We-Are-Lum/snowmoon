/**
 * Private threads live on this device only (localStorage), never on the server.
 * The reading record (the furthest chapter opened in the reader) lives here too:
 * it sets each new thread's spoiler limit. Every read and write survives blocked
 * storage by doing nothing.
 */
import type { AskResult } from './ask';

export interface AskedMessage {
  role: 'user';
  text: string;
  at: string;
}
export interface AnsweredMessage {
  role: 'assistant';
  result: AskResult | { state: 'error'; error: string } | { state: 'unavailable' };
  /** The question this answers, so a held-back answer can be asked again with more chapters. */
  question: string;
  at: string;
}
export type Message = AskedMessage | AnsweredMessage;

export interface Thread {
  id: string;
  createdAt: string;
  /** The last chapter this thread may use. */
  limit: number;
  /** Blocks attached when the thread was opened ("ask about this"). */
  attached: string[];
  messages: Message[];
}

const THREADS = 'snowmoon.ask.threads.v1';
const READ_TO = 'snowmoon.read-to';
const NOTICE = 'snowmoon.ask.notice-seen';

function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function set(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the thread lasts until the page closes */
  }
}

export function readTo(): number {
  const n = get<number>(READ_TO, 1);
  return Number.isInteger(n) && n >= 1 && n <= 32 ? n : 1;
}
export function recordChapterOpened(n: number) {
  if (n > readTo()) set(READ_TO, n);
}

export function threads(): Thread[] {
  return get<Thread[]>(THREADS, []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
export function thread(id: string): Thread | null {
  return threads().find((t) => t.id === id) ?? null;
}
export function saveThread(t: Thread) {
  set(THREADS, [t, ...threads().filter((x) => x.id !== t.id)]);
}
export function deleteThread(id: string) {
  set(THREADS, threads().filter((x) => x.id !== id));
}
export function newThread(limit: number, attached: string[] = []): Thread {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
  const t: Thread = { id, createdAt: new Date().toISOString(), limit, attached, messages: [] };
  saveThread(t);
  return t;
}

export function noticeSeen(): boolean {
  return get<boolean>(NOTICE, false);
}
export function markNoticeSeen() {
  set(NOTICE, true);
}
