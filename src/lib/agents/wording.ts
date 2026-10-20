/**
 * Every word people see about agents (owner, 2026-10-20). DRAFT wording by the coding agent, for the
 * owner's reread before anything is switched on. One file, so the reread is one file.
 */
export const AGENT_WORDING = {
  authorize: {
    title: (client: string) => `Connect ${client} to Snowmoon Party`,
    lede: (client: string, handle: string) => `${client} will work for you here as an agent, shown as “${client}, agent of @${handle}”.`,
    can: 'It can:',
    cannot: 'It can’t publish anything (you publish its drafts from your You page), spend your money, or speak as you. Everything it drafts is labelled as made by an agent.',
    limits: 'Each agent can make up to 50 drafts, 20 notes and 50 images a day. You can have up to 3 agents.',
    responsible: 'You are responsible for what it drafts, as if you had drafted it. Disconnect it on your You page at any time; that stops it at once.',
    back: (host: string) => `Afterwards you go back to ${host}.`,
    allow: 'Allow',
    deny: 'Don’t allow',
    signIn: 'Sign in first, as the person this agent will work for.',
    bad: 'This connection request can’t be used:',
    working: 'One moment…',
  },
  you: {
    agents: 'Agents',
    agentsNote: 'Software that works for you. It drafts; you publish. Disconnecting stops it at once; its drafts stay here.',
    none: 'No agents. Add Snowmoon Party to Claude or ChatGPT (see snowmoon.party/agents.md), or link a wallet agent below.',
    disconnect: 'Disconnect',
    via: (route: 'oauth' | 'wallet') => (route === 'oauth' ? 'connected by sign-in' : 'a wallet agent'),
    lastUsed: (when: string | null) => (when ? `last used ${when}` : 'not used yet'),
    waiting: 'Waiting for the agent to sign its link message.',
    walletTitle: 'Link a wallet agent',
    walletNote: 'For agents that have their own wallet. Give it a name and its address; it then signs a message naming you.',
    walletName: 'Name',
    walletAddress: 'Its wallet address',
    walletAdd: 'Link',
    walletMessage: 'Give your agent this message to sign:',
    review: 'Your agents’ drafts',
    reviewNote: 'Nothing here is public until you publish it.',
    noDrafts: 'Nothing waiting.',
    publish: 'Publish',
    discard: 'Discard',
    open: 'Open',
    noteOn: (title: string) => `A note on “${title}”`,
  },
  labels: {
    agent: (name: string, handle: string) => `${name}, agent of @${handle}`,
    words: (handle: string) => `words by @${handle}’s agent`,
    broughtIn: (handle: string) => `Brought in by @${handle}’s agent · recipe as declared, not checked`,
    revisedFrom: 'Revised from',
    humanOnly: 'Human-written words only',
  },
} as const;
