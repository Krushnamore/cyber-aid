/**
 * Minimal OpenAI-compatible chat client for Groq or xAI Grok.
 *   GROK_API_KEY (or GROQ_API_KEY / XAI_API_KEY / LLM_API_KEY)
 *   key prefix  gsk_  -> Groq  (https://api.groq.com/openai/v1)
 *   key prefix  xai-  -> xAI   (https://api.x.ai/v1)
 *   LLM_BASE_URL / LLM_MODEL override both.
 */
export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }
interface Cfg { provider: 'groq' | 'xai' | 'custom'; baseUrl: string; key: string; model: string }

const DEFAULTS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  xai: { baseUrl: 'https://api.x.ai/v1', model: 'grok-4' },
};

export function llmConfig(): Cfg | null {
  const env = process.env;
  const key = (env['GROK_API_KEY'] || env['GROQ_API_KEY'] || env['XAI_API_KEY'] || env['LLM_API_KEY'] || '').trim();
  if (!key || /^(MY_|your|changeme)/i.test(key)) return null;
  const provider: Cfg['provider'] = env['LLM_BASE_URL'] ? 'custom' : key.startsWith('xai-') ? 'xai' : 'groq';
  const d = provider === 'xai' ? DEFAULTS.xai : DEFAULTS.groq;
  return { provider, key, baseUrl: (env['LLM_BASE_URL'] || d.baseUrl).replace(/\/$/, ''), model: env['LLM_MODEL'] || d.model };
}

export const llmEnabled = () => llmConfig() !== null;
export const llmProvider = () => llmConfig()?.provider ?? null;

let resolvedModel: string | null = null;

async function pickModel(c: Cfg): Promise<string | null> {
  try {
    const r = await fetch(`${c.baseUrl}/models`, { headers: { Authorization: `Bearer ${c.key}` }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const ids: string[] = ((await r.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
    const ok = ids.filter((id) => !/whisper|guard|tts|embed|image|imagine|vision|moderation|orpheus|playai/i.test(id));
    return (c.provider === 'xai' ? ok.find((i) => /^grok-/.test(i)) : ok.find((i) => /llama-3\.3-70b|llama-3\.1-70b|gpt-oss-120b/.test(i))) ?? ok[0] ?? null;
  } catch { return null; }
}

export async function complete(opts: { messages: LlmMessage[]; json?: boolean; maxTokens?: number; temperature?: number }): Promise<string> {
  const c = llmConfig();
  if (!c) throw new Error('No LLM key configured');
  const call = async (model: string) => {
    const r = await fetch(`${c.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages: opts.messages, temperature: opts.temperature ?? 0.4, max_tokens: opts.maxTokens ?? 700,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    return r;
  };
  let model = resolvedModel ?? c.model;
  let r = await call(model);
  if (!r.ok && [400, 404].includes(r.status) && !resolvedModel) {
    // configured/default model name may be retired: discover a live one once
    const alt = await pickModel(c);
    if (alt && alt !== model) { model = alt; r = await call(model); }
  }
  if (!r.ok) throw new Error(`${c.provider} API ${r.status}: ${(await r.text()).slice(0, 200)}`);
  resolvedModel = model;
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty LLM response');
  return text;
}

/** Parses JSON even if the model wrapped it in prose or code fences. */
export function parseJsonLoose<T>(text: string): T {
  try { return JSON.parse(text) as T; } catch { /* fall through */ }
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error('No JSON in LLM output');
  return JSON.parse(m[0]) as T;
}
