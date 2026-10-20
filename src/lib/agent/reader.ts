import 'server-only';
/** The agent routes run every query as agent_reader (src/lib/db.ts asAgentReader). Kept apart so the MCP route imports no database module itself (check:principles P4a). */
export { asAgentReader } from '../db';
