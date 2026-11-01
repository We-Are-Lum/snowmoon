/**
 * The deep funding test's models (docs/proposals/deep-funding-runner.md): about six that read images, through the
 * Vercel AI Gateway the site already uses (CHAT.endpoint, OpenAI-compatible), never OpenRouter. Each is pinned to one
 * provider that the gateway lists with zero data retention (`has_zdr: true`) and image input for that model, and every
 * request asks for zero data retention (providerOptions.gateway.zeroDataRetention) and no prompt training. A reply
 * that doesn't confirm zero data retention is not used.
 *
 * Open-weight models first (principle 3 prefers open models); closed ones are allowed when labelled (owner,
 * 2026-10-18) and are listed separately, off by default. Prices are USD per million tokens, the gateway's list price
 * for that provider (the gateway adds no markup), read from https://ai-gateway.vercel.sh/v1/models and
 * /v1/models/<id>/endpoints on 2026-11-01. Re-read them before a run.
 */
export interface JudgeModel {
  id: string;
  maker: string;
  /** The one provider the gateway may route to (zero data retention and image input listed for it). */
  provider: string;
  openWeights: boolean;
  /** USD per million input and output tokens at that provider. */
  price: { input: number; output: number };
  /** The endpoint lists structured output (json_schema); otherwise the schema is sent as json_object plus the prompt. */
  structured: boolean;
  /** Whether it reasons (bills hidden reasoning tokens as output). */
  reasons: boolean;
}

export const JUDGES: JudgeModel[] = [
  { id: 'alibaba/qwen3.8-27b', maker: 'Alibaba (Qwen)', provider: 'parasail', openWeights: true, price: { input: 0.24, output: 2.2 }, structured: true, reasons: true },
  { id: 'mistral/mistral-large-3', maker: 'Mistral AI', provider: 'mistral', openWeights: true, price: { input: 0.5, output: 1.5 }, structured: true, reasons: false },
  { id: 'deepseek/deepseek-v4.1-flash', maker: 'DeepSeek', provider: 'baseten', openWeights: true, price: { input: 0.3, output: 1.2 }, structured: true, reasons: true },
  { id: 'zai/glm-5.3-flash', maker: 'Z.ai (GLM)', provider: 'baseten', openWeights: true, price: { input: 0.15, output: 0.5 }, structured: true, reasons: true },
  { id: 'google/gemma-4-31b-it', maker: 'Google (Gemma)', provider: 'parasail', openWeights: true, price: { input: 0.15, output: 0.4 }, structured: true, reasons: true },
  /**
   * In place of Kimi K3 (owner, 2026-11-01: "swap Kimi K3 for a cheaper reserve model"): the cheapest reserve, with
   * structured output, zero data retention on two providers (Baseten, Together AI), and a sixth maker. Pinned to
   * Together AI: unquantized there (Baseten serves it in fp4), and $0.15 in rather than $0.20.
   */
  { id: 'nvidia/nemotron-3.5-super-vl', maker: 'NVIDIA', provider: 'togetherai', openWeights: true, price: { input: 0.15, output: 0.5 }, structured: true, reasons: true },
];

/** Stand-ins if one of the six is unavailable on the day (each open-weight, ZDR and image input on that provider). */
export const RESERVES: JudgeModel[] = [
  /** Was in the six until 2026-11-01; 71% of the run's cost alone. */
  { id: 'moonshotai/kimi-k3', maker: 'Moonshot AI', provider: 'baseten', openWeights: true, price: { input: 3, output: 15 }, structured: true, reasons: true },
  { id: 'minimax/minimax-m3', maker: 'MiniMax', provider: 'fireworks', openWeights: true, price: { input: 0.3, output: 1.2 }, structured: true, reasons: true },
  { id: 'meta/llama-4-maverick', maker: 'Meta', provider: 'bedrock', openWeights: true, price: { input: 0.24, output: 0.97 }, structured: false, reasons: false },
];

/** Closed models, for comparison only if the owner wants them (labelled "closed model" wherever results show them). Off. */
export const CLOSED_OPTIONAL: JudgeModel[] = [
  { id: 'anthropic/claude-sonnet-5.5', maker: 'Anthropic', provider: 'anthropic', openWeights: false, price: { input: 2, output: 10 }, structured: true, reasons: true },
  { id: 'openai/gpt-6.1-terra', maker: 'OpenAI', provider: 'openai', openWeights: false, price: { input: 1, output: 5 }, structured: true, reasons: true },
];

/** Every request's gateway options: the one provider, zero data retention, no prompt training. */
export const gatewayOptions = (m: JudgeModel) => ({ gateway: { only: [m.provider], zeroDataRetention: true, disallowPromptTraining: true } });

/**
 * A run's estimated cost, before any call: every model × runs × nodes, at `tokens` per call (input includes the
 * pictures; output includes reasoning). The default, 12,000 in and 2,500 out per call, is a guess for a node with one
 * parent (up to six pictures, about 1,500 tokens each, plus the text); a node with several parents sends more pictures.
 * The runner records each call's real tokens and cost, and stops before the budget.
 */
export function estimateUsd(models: JudgeModel[], runs: number, nodes: number, tokens = { input: 12000, output: 2500 }) {
  const perCall = models.map((m) => ({ id: m.id, usd: (tokens.input * m.price.input + tokens.output * m.price.output) / 1e6 }));
  const perNodeRun = perCall.reduce((s, x) => s + x.usd, 0);
  return { perCall, perNodeRun, total: perNodeRun * runs * nodes };
}
