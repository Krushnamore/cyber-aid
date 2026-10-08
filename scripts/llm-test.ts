// Verifies the Groq/xAI (OpenAI-compatible) integration against a local mock server.
import http from 'node:http';
import { freshDb } from './_db';

let seen: { path: string; model?: string; auth?: string; json?: boolean }[] = [];
const mock = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    seen.push({ path: req.url!, model: j.model, auth: req.headers.authorization, json: !!j.response_format });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'whisper-large' }, { id: 'grok-4-live' }, { id: 'grok-image' }] }));
    if (j.model === 'retired-model') { res.statusCode = 404; return res.end(JSON.stringify({ error: { message: 'model not found' } })); }
    const sys: string = j.messages[0].content;
    let content = 'Stay calm. 1. Call 1930 now. 2. Call your bank. 3. File on cybercrime.gov.in.';
    if (/public awareness dashboard/.test(sys)) content = JSON.stringify({ commentary: 'Reported cyber-crime complaints rose every year from 2021 to 2025 while FIRs stayed a small share, and investment fraud dominates the 2025 case mix.', states: { Telangana: 'Investment & loan fraud', Karnataka: 'Digital arrest scams', 'Uttar Pradesh': 'Mixed / not clear', Maharashtra: 'KYC phishing', Bihar: 'OTP fraud', 'Tamil Nadu': 'x'.repeat(80) } });
    if (/awareness quizzes/.test(sys)) content = JSON.stringify({ questions: [1, 2, 3, 4].map((i) => ({ q: `AI question ${i}?`, options: ['A' + i, 'B' + i, 'C' + i, 'D' + i], answer: 2, explanation: 'Because C.', topic: 'UPI' })) });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});

let fails = 0; const ok = (c: boolean, m: string) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };

mock.listen(0, async () => {
  const port = (mock.address() as { port: number }).port;
  await freshDb();
  process.env['LLM_BASE_URL'] = `http://localhost:${port}/v1`;
  process.env['GROK_API_KEY'] = 'xai-test-key';
  process.env['LLM_MODEL'] = 'retired-model';
  const { llmConfig, complete } = await import('../src/server/llm');
  const { chat } = await import('../src/server/assistant');
  const { refreshWithLlm, getNational } = await import('../src/server/national-data');
  const { startQuiz, gradeQuiz } = await import('../src/server/quiz');

  ok(llmConfig()?.provider === 'custom', 'config picks LLM_BASE_URL');
  delete process.env['LLM_BASE_URL']; ok(llmConfig()?.provider === 'xai' && llmConfig()!.baseUrl.includes('api.x.ai'), 'xai- key -> xAI endpoint');
  process.env['GROK_API_KEY'] = 'gsk_abc'; ok(llmConfig()?.provider === 'groq' && llmConfig()!.baseUrl.includes('api.groq.com'), 'gsk_ key -> Groq endpoint');
  process.env['GROK_API_KEY'] = 'xai-test-key'; process.env['LLM_BASE_URL'] = `http://localhost:${port}/v1`;

  const r = await chat([{ role: 'user', text: 'I shared my OTP' }]);
  ok(r.source === 'grok' || r.source === 'groq', `assistant answered via LLM (${r.source})`);
  ok(r.reply.includes('1930'), 'assistant reply used');
  ok(seen.some((s) => s.path === '/v1/models'), 'retired model -> model discovery');
  ok(seen.some((s) => s.model === 'grok-4-live'), 'retried with discovered grok model (skips whisper/image)');
  ok(seen.every((s) => !s.auth || s.auth === 'Bearer xai-test-key'), 'bearer key sent');

  const before = await getNational(); ok(before.commentary === null && before.states.every((s) => s.dominantScam === null), 'no AI content before refresh');
  const rf = await refreshWithLlm(); ok(rf.ok, 'national refresh ok: ' + rf.message);
  const after = await getNational();
  ok(after.commentary?.origin === 'ai' && after.states.find((s) => s.state === 'Telangana')?.dominantScamOrigin === 'ai', 'AI commentary + state labels cached and tagged origin=ai');
  ok(after.states.find((s) => s.state === 'Tamil Nadu')!.dominantScam!.length <= 40, 'over-long AI labels truncated');
  ok(after.years.every((y) => y.origin.complaints !== 'ai') && after.years[3].complaints === 2268346 && after.years[4].lossCrores === 22495, 'official numbers untouched by AI');

  const q = await startQuiz(4, true); ok(q.source === 'ai' && q.questions.length === 4, 'AI quiz generated');
  ok(!('answer' in (q.questions[0] as object)), 'answers not leaked to client');
  const g = gradeQuiz(q.sessionId, {}); ok(g?.total === 4 && g.score === 0, 'grading works, blanks are wrong');
  ok(gradeQuiz(q.sessionId, {}) === null, 'session is single-use');
  const b = await startQuiz(5, false); ok(b.source === 'bank' && b.questions.length === 5, 'bank quiz');

  delete process.env['GROK_API_KEY']; const none = await chat([{ role: 'user', text: 'upi pin shared' }]); ok(none.source === 'playbook', 'no key -> playbook fallback');
  process.env['GROK_API_KEY'] = 'xai-test-key'; process.env['LLM_BASE_URL'] = 'http://localhost:1/v1'; const down = await chat([{ role: 'user', text: 'upi pin shared' }]); ok(down.source === 'playbook', 'LLM unreachable -> playbook fallback');

  console.log(fails ? `\n${fails} FAILED` : '\nLLM INTEGRATION TESTS PASSED'); mock.close(); process.exit(fails ? 1 : 0);
});
