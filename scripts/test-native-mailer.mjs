import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Run with: pnpm test:mail. No application build, asset generation, real bindings or network.
// The only worker exports added below exist in an in-memory test bundle, not production.
const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(root, 'worker/template.ts'), 'utf8');
const nativeSource = await readFile(path.join(root, 'worker/native-mailer.ts'), 'utf8');
const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
const unexpectedNetwork = [];
const originalFetch = globalThis.fetch;
const originalConnect = net.Socket.prototype.connect;
const blockNetwork = (description) => {
  unexpectedNetwork.push(description);
  throw new Error(`Network is forbidden in mail tests: ${description}`);
};
const forbiddenFetch = async (url) => blockNetwork(`unmocked fetch ${String(url)}`);
globalThis.fetch = forbiddenFetch;
net.Socket.prototype.connect = function () { return blockNetwork('socket connection'); };
after(() => {
  globalThis.fetch = originalFetch;
  net.Socket.prototype.connect = originalConnect;
  assert.deepEqual(unexpectedNetwork, [], 'no unmocked network attempts, even if caught by production');
});

// A tiny in-memory fixture replaces the asset symbol only for these tests. No dist is read/written.
const bundled = await build({
  stdin: {
    contents: `${source}\nexport { createNativeMailer, sendCode, sendPublicationDecision, sendCustodyInvitation };\n`,
    resolveDir: path.join(root, 'worker'), sourcefile: 'mail-regression.ts', loader: 'ts'
  },
  define: { __STATIC_ASSETS__: JSON.stringify({
    'index.html': { body: Buffer.from('<!doctype html><title>mail test fixture</title>').toString('base64'), type: 'text/html', immutable: false }
  }) },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent'
});
const { default: worker, createNativeMailer, sendCode, sendPublicationDecision, sendCustodyInvitation } =
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const FROM = 'Saudi CV Support <support@saudi.cv>';
const REPLY = 'support@saudi.cv';
const RECIPIENT = 'person@example.test';
const message = { to: RECIPIENT, subject: 'Mail regression', text: 'Test-only content', html: '<p>Test-only content</p>' };
const providerResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const primaryOK = () => providerResponse(200, { id: 'mock-resend-id' });
const primaryQuota = (code, field = 'name') => () => providerResponse(429, { [field]: code });
function request(input = message, headers = {}, method = 'POST', pathname = '/v1/support/send') {
  return new Request(`https://mailer${pathname}`, {
    method, headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(input) })
  });
}
async function withProvider(primary, action, { configured = true, fallback = 'ok' } = {}) {
  const calls = [], fallbackCalls = [];
  const env = {
    ...(configured ? { RESEND_API_KEY: 'unit-test-placeholder' } : {}),
    ...(fallback === 'missing' ? {} : { EMAIL: { async send(mail) {
      fallbackCalls.push(mail);
      if (fallback === 'reject') throw new Error('Mock fallback rejection');
      return fallback === 'void' ? undefined : { messageId: 'mock-cloudflare-id' };
    } } })
  };
  globalThis.fetch = async (url, init) => {
    if (String(url) !== 'https://api.resend.com/emails') return blockNetwork(`unexpected provider URL ${String(url)}`);
    calls.push({ url: String(url), method: init?.method, headers: new Headers(init?.headers), body: JSON.parse(init.body) });
    return primary();
  };
  try { return { value: await action(env), calls, fallbackCalls }; }
  finally { globalThis.fetch = forbiddenFetch; }
}
async function deliver(env, mailRequest = request()) {
  const response = await createNativeMailer(env).fetch(mailRequest);
  return { status: response.status, headers: response.headers, body: await response.json() };
}
const hash = (value) => createHash('sha256').update(value).digest('base64');
const escape = (value) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

await test('copied shared module matches the parent-approved byte snapshot', () => {
  assert.equal(createHash('sha256').update(nativeSource).digest('hex'), 'b65da02008318e6c416b991290e0060521324ed9f423587c16a640349ce49f67');
});
await test('all three original mail calls use the local transport; upstream callers remain connected', () => {
  assert.match(source, /interface Env extends NativeMailEnv/);
  assert.match(source, /MAILER\?: MailTransport/);
  assert.match(source, /return env\.MAILER \?\? createNativeMailer\(env\)/);
  assert.doesNotMatch(source, /env\.MAILER\.fetch/);
  assert.equal((source.match(/await mailer\(env\)\.fetch\(/g) ?? []).length, 3);
  assert.equal((source.match(/https:\/\/mailer\/v1\/support\/send/g) ?? []).length, 3);
  assert.equal((source.match(/await sendCode\(env, email, code, locale\)/g) ?? []).length, 3, 'registration, login, owner setup');
  assert.match(source, /sendPublicationDecision\(env, recordRequest\.owner_email, recordRequest\.submission_locale, decision, note, requestId\)/);
  assert.match(source, /sendCustodyInvitation\(env, recipient, rawToken, locale, subjectType\)/);
  // Keep Turnstile untouched; all other external mail fetching is confined to native-mailer.ts.
  assert.equal((source.match(/await fetch\(/g) ?? []).length, 1);
  assert.match(source, /await fetch\('https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify'/);
  assert.doesNotMatch(source, /saudi-cv-email-failover|api\.resend\.com/);
});
await test('production removes the remote MAILER binding and preserves non-mail configuration', () => {
  assert.deepEqual(config.send_email, [{ name: 'EMAIL', allowed_sender_addresses: ['support@saudi.cv'] }]);
  assert.equal(config.services, undefined);
  assert.equal(config.workers_dev, true);
  assert.equal(config.keep_vars, true);
  assert.equal(config.compatibility_date, '2026-11-01');
  assert.equal(config.name, 'vipdid-platform');
  assert.equal(config.main, 'dist-worker/worker.mjs');
  assert.deepEqual(config.observability, { enabled: true });
  assert.deepEqual(config.d1_databases, [{ binding: 'DB', database_name: 'vipdid-platform', database_id: 'be117780-1c27-46c2-8f6d-d3aa03bc09c0' }]);
  assert.deepEqual(config.r2_buckets, [{ binding: 'MEDIA', bucket_name: 'vipdid-media' }]);
  assert.deepEqual(config.kv_namespaces, [{ binding: 'RATE_LIMIT', id: '40fc6c20795c49a09e64b5a429511046' }]);
  assert.doesNotMatch(JSON.stringify(config), /MAILER|PlatformMailer|saudi-cv-email-failover|RESEND_API_KEY/);
});
await test('module creation and normal public requests do not send mail; no public mail endpoint exists', async () => {
  createNativeMailer({});
  const env = { DB: { prepare() { throw new Error('Unexpected database access'); } } };
  assert.equal((await worker.fetch(new Request('https://vipdid.app/api/health'), env)).status, 200);
  assert.equal((await worker.fetch(new Request('https://vipdid.app/'), env)).status, 200);
  for (const pathname of ['/v1/support/send', '/api/mail/send', '/api/support/send']) {
    const response = await worker.fetch(new Request(`https://vipdid.app${pathname}`, { method: 'POST', body: JSON.stringify(message) }), env);
    assert.equal(response.status, 404);
  }
});
await test('primary acceptance returns 202, one attempt, fixed sender/reply, recipients and header key', async () => {
  const input = { ...message, to: [RECIPIENT, 'second@example.test'], cc: ['copy@example.test'], bcc: 'blind@example.test',
    from: 'Ignore <wrong@example.test>', replyTo: 'wrong@example.test', idempotencyKey: 'body-key' };
  const { value, calls, fallbackCalls } = await withProvider(primaryOK, (env) => deliver(env, request(input, { 'Idempotency-Key': 'header-key' })));
  assert.equal(value.status, 202);
  assert.equal(value.body.provider, 'resend');
  assert.equal(value.body.messageId, 'mock-resend-id');
  assert.match(value.body.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(value.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.get('authorization'), 'Bearer unit-test-placeholder');
  assert.equal(calls[0].headers.get('content-type'), 'application/json');
  assert.equal(calls[0].headers.get('Idempotency-Key'), 'header-key');
  assert.deepEqual(calls[0].body, { from: FROM, to: input.to, cc: input.cc, bcc: ['blind@example.test'], subject: message.subject, text: message.text, html: message.html, reply_to: REPLY });
  assert.equal(fallbackCalls.length, 0);
});
await test('body idempotency key is preserved when the header is absent', async () => {
  const { value, calls } = await withProvider(primaryOK, (env) => deliver(env, request({ ...message, idempotencyKey: 'server-body-key' })));
  assert.equal(value.status, 202);
  assert.equal(calls[0].headers.get('Idempotency-Key'), 'server-body-key');
  assert.equal(calls[0].body.idempotencyKey, undefined);
});
await test('missing idempotency key uses the response request ID without retries', async () => {
  const { value, calls } = await withProvider(primaryOK, (env) => deliver(env));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.get('Idempotency-Key'), `platform-mail-${value.body.requestId}`);
});

for (const [label, input] of [
  ['null body', null], ['array body', []], ['missing recipient', { ...message, to: undefined }],
  ['empty recipients', { ...message, to: [] }], ['invalid recipient', { ...message, to: 'not-an-email' }],
  ['mixed recipient types', { ...message, to: [RECIPIENT, 42] }], ['invalid cc', { ...message, cc: ['wrong'] }],
  ['invalid bcc', { ...message, bcc: null }], ['blank subject', { ...message, subject: '  ' }],
  ['oversized subject', { ...message, subject: 'x'.repeat(999) }], ['missing content', { to: RECIPIENT, subject: 'Subject' }]
]) {
  await test(`invalid input: ${label}, no provider/fallback attempt`, async () => {
    const { value, calls, fallbackCalls } = await withProvider(primaryOK, (env) => deliver(env, request(input)));
    assert.equal(value.status, 400);
    assert.equal(calls.length, 0);
    assert.equal(fallbackCalls.length, 0);
  });
}
await test('malformed JSON returns 400 before either provider', async () => {
  const malformed = new Request('https://mailer/v1/support/send', { method: 'POST', body: '{invalid' });
  const { value, calls, fallbackCalls } = await withProvider(primaryOK, (env) => deliver(env, malformed));
  assert.equal(value.status, 400);
  assert.equal(calls.length, 0);
  assert.equal(fallbackCalls.length, 0);
});
for (const [method, pathname] of [['GET', '/v1/support/send'], ['PUT', '/v1/support/send'], ['POST', '/wrong']]) {
  await test(`internal contract rejects ${method} ${pathname}`, async () => {
    const { value, calls, fallbackCalls } = await withProvider(primaryOK, (env) => deliver(env, request(message, {}, method, pathname)));
    assert.equal(value.status, 404);
    assert.equal(calls.length, 0);
    assert.equal(fallbackCalls.length, 0);
  });
}
for (const key of ['has space', 'x'.repeat(257), 'غير-صالح', 'line\nfeed']) {
  await test(`invalid body idempotency key (${JSON.stringify(key.slice(0, 20))}) is rejected before providers`, async () => {
    const { value, calls, fallbackCalls } = await withProvider(primaryOK, (env) => deliver(env, request({ ...message, idempotencyKey: key })));
    assert.equal(value.status, 400);
    assert.equal(calls.length, 0);
    assert.equal(fallbackCalls.length, 0);
  });
}
await test('unconfigured primary returns 503 without attempting EMAIL as a default', async () => {
  const { value, calls, fallbackCalls } = await withProvider(primaryOK, (env) => deliver(env), { configured: false });
  assert.equal(value.status, 503);
  assert.equal(calls.length, 0);
  assert.equal(fallbackCalls.length, 0);
});
for (const input of [{ to: RECIPIENT, subject: ' text only ', text: 'Text' }, { to: RECIPIENT, subject: 'HTML only', html: '<p>HTML</p>' }]) {
  await test(`valid content form: ${input.subject.trim()}`, async () => {
    const { value, calls } = await withProvider(primaryOK, (env) => deliver(env, request(input)));
    assert.equal(value.status, 202);
    assert.equal(calls[0].body.subject, input.subject.trim());
  });
}
for (const code of ['daily_quota_exceeded', 'monthly_quota_exceeded']) {
  for (const field of ['name', 'type', 'code']) {
    await test(`only confirmed 429 ${field}=${code} enables EMAIL fallback`, async () => {
      const { value, calls, fallbackCalls } = await withProvider(primaryQuota(code.toUpperCase(), field), (env) => deliver(env));
      assert.equal(value.status, 202);
      assert.equal(value.body.provider, 'cloudflare');
      assert.equal(value.body.failover, 'resend_quota_exceeded');
      assert.equal(value.body.messageId, 'mock-cloudflare-id');
      assert.equal(calls.length, 1);
      assert.deepEqual(fallbackCalls, [{ from: FROM, ...message, to: [RECIPIENT], replyTo: REPLY }]);
    });
  }
}
for (const [label, primary] of [
  ['network error', () => { throw new TypeError('Mock network failure'); }],
  ['timeout / abort', () => { throw new DOMException('Mock timeout', 'AbortError'); }],
  ['401 authentication failure', () => providerResponse(401, { name: 'validation_error' })],
  ['422 rejection', () => providerResponse(422, { name: 'validation_error' })],
  ['500 even with quota code', () => providerResponse(500, { name: 'daily_quota_exceeded' })],
  ['502 upstream error', () => providerResponse(502, { name: 'upstream_error' })],
  ['generic 429 rate limit', primaryQuota('rate_limit_exceeded')],
  ['unknown 429', () => providerResponse(429, {})],
  ['non-JSON 429', () => new Response('not-json', { status: 429 })]
]) {
  await test(`${label}: 503, exactly one attempt, never fallback or retry`, async () => {
    const { value, calls, fallbackCalls } = await withProvider(primary, (env) => deliver(env));
    assert.equal(value.status, 503);
    assert.equal(calls.length, 1);
    assert.equal(fallbackCalls.length, 0);
    assert.doesNotMatch(JSON.stringify(value.body), /unit-test-placeholder|Test-only content/);
  });
}
for (const fallback of ['missing', 'reject', 'void']) {
  await test(`quota fallback ${fallback} preserves acceptance/failure status and no retry`, async () => {
    const { value, calls, fallbackCalls } = await withProvider(primaryQuota('daily_quota_exceeded'), (env) => deliver(env), { fallback });
    assert.equal(value.status, fallback === 'void' ? 202 : 503);
    assert.equal(calls.length, 1);
    assert.equal(fallbackCalls.length, fallback === 'missing' ? 0 : 1);
    if (fallback === 'void') assert.equal(value.body.messageId, null);
  });
}

// Golden mail content copied from the pre-merge worker, independently of production exports.
const otpCopy = {
  ar: { subject: 'رمز التحقق من الهوية الرقمية لكبار الشخصيات', intro: 'رمز التحقق الخاص بك هو', expiry: 'ينتهي الرمز خلال عشر دقائق. لا تشاركه مع أي شخص.', text: 'رمز التحقق من الهوية الرقمية لكبار الشخصيات' },
  en: { subject: 'Your VIP Digital ID verification code', intro: 'Your verification code is', expiry: 'This code expires in ten minutes. Do not share it with anyone.', text: 'VIP Digital ID verification code' }
};
const decisionCopy = {
  ar: {
    approved: { subject: 'تم اعتماد موقعك في الهوية الرقمية لكبار الشخصيات', title: 'تم اعتماد موقعك', text: 'اعتمد المشرف البشري النسخة التي أرسلتها، وأصبحت متاحة للزوار.' },
    changes_requested: { subject: 'طُلب تعديل موقعك في الهوية الرقمية لكبار الشخصيات', title: 'طُلب تعديل موقعك', text: 'راجع ملاحظة المشرف وعدّل المسودة ثم أرسلها للمراجعة من جديد.' },
    rejected: { subject: 'لم يُعتمد طلب موقعك في الهوية الرقمية لكبار الشخصيات', title: 'لم يُعتمد طلب موقعك', text: 'راجع ملاحظة المشرف قبل إرسال طلب جديد.' }
  },
  en: {
    approved: { subject: 'Your VIP Digital ID site was approved', title: 'Your site was approved', text: 'A human reviewer approved the version you submitted, and it is now available to visitors.' },
    changes_requested: { subject: 'Changes were requested for your VIP Digital ID site', title: 'Changes were requested', text: 'Review the reviewer note, update your draft, and submit it again.' },
    rejected: { subject: 'Your VIP Digital ID site request was not approved', title: 'Your request was not approved', text: 'Review the reviewer note before submitting a new request.' }
  }
};
const sendCases = [];
for (const locale of ['ar', 'en']) {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const code = '012345';
  const copy = otpCopy[locale];
  sendCases.push({
    label: `OTP ${locale}`, run: (env) => sendCode(env, RECIPIENT, code, locale), key: `vipdid-code-${hash(`${RECIPIENT}:${code}`)}`,
    payload: { to: [RECIPIENT], subject: copy.subject, text: `${copy.text}\n\n${copy.intro}: ${code}\n\n${copy.expiry}`,
      html: `<div dir="${dir}" lang="${locale}"><p>${copy.intro}</p><p style="font-size:28px;font-weight:700;letter-spacing:5px">${code}</p><p>${copy.expiry}</p></div>` }
  });
  for (const decision of ['approved', 'changes_requested', 'rejected']) {
    const publication = decisionCopy[locale][decision];
    const note = decision === 'approved' ? '' : `<review & "note"> 'مثال'`;
    const noteLabel = locale === 'ar' ? 'ملاحظة المشرف:' : 'Reviewer note:';
    sendCases.push({
      label: `publication ${decision} ${locale}`, run: (env) => sendPublicationDecision(env, RECIPIENT, locale, decision, note, 'request-fixture'), key: `vipdid-publication-request-fixture-${decision}`,
      payload: { to: [RECIPIENT], subject: publication.subject, text: `${publication.title}\n\n${publication.text}${note ? `\n\n${noteLabel}\n${note}` : ''}`,
        html: `<div dir="${dir}" lang="${locale}"><h1>${escape(publication.title)}</h1><p>${escape(publication.text)}</p>${note ? `<p><strong>${noteLabel}</strong><br>${escape(note)}</p>` : ''}</div>` }
    });
  }
  for (const subject of ['user', 'tenant']) {
    const token = 'mock-token+/= &';
    const link = `https://vipdid.app/accept-custody?custody=${encodeURIComponent(token)}`;
    const heading = subject === 'tenant' ? (locale === 'ar' ? 'دعوة تسليم عهدة العضيد' : 'Partner custody invitation') : (locale === 'ar' ? 'دعوة تسليم عهدة الحساب' : 'Account custody invitation');
    sendCases.push({
      label: `custody ${subject} ${locale}`, run: (env) => sendCustodyInvitation(env, RECIPIENT, token, locale, subject), key: `vipdid-custody-${hash(token)}`,
      payload: { to: [RECIPIENT], subject: heading,
        text: locale === 'ar' ? `${heading}\n\nأكمل الاستلام عبر الرابط الآمن التالي:\n${link}\n\nينتهي الرابط خلال 72 ساعة.` : `${heading}\n\nComplete the transfer through this secure link:\n${link}\n\nThis link expires in 72 hours.`,
        html: `<div dir="${dir}" lang="${locale}"><h1>${escape(heading)}</h1><p>${escape(locale === 'ar' ? 'أكمل الاستلام عبر الرابط الآمن:' : 'Complete the transfer through this secure link:')}</p><p><a href="${escape(link)}">${escape(link)}</a></p></div>` }
    });
  }
}
for (const sendCase of sendCases) {
  for (const [label, primary, accepted, fallbackCount] of [
    ['Resend accepted', primaryOK, true, 0],
    ['daily quota fallback', primaryQuota('daily_quota_exceeded'), true, 1],
    ['monthly quota fallback', primaryQuota('monthly_quota_exceeded'), true, 1],
    ['uncertain network outcome', () => { throw new TypeError('Mock uncertainty'); }, false, 0],
    ['primary rejection', () => providerResponse(422, { name: 'validation_error' }), false, 0]
  ]) {
    await test(`${sendCase.label}: ${label}, original payload/key, production env without MAILER`, async () => {
      const { value, calls, fallbackCalls } = await withProvider(primary, (env) => {
        assert.equal('MAILER' in env, false);
        return sendCase.run(env);
      });
      assert.equal(value, accepted);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].headers.get('Idempotency-Key'), sendCase.key);
      assert.deepEqual(calls[0].body, { from: FROM, ...sendCase.payload, reply_to: REPLY });
      assert.equal(fallbackCalls.length, fallbackCount);
      if (fallbackCount) assert.deepEqual(fallbackCalls[0], { from: FROM, ...sendCase.payload, replyTo: REPLY });
    });
  }
  await test(`${sendCase.label}: optional isolated MAILER seam receives original internal Request`, async () => {
    for (const status of [202, 503]) {
      const calls = [];
      const env = { MAILER: { async fetch(mailRequest) {
        calls.push(mailRequest);
        return new Response('{}', { status });
      } } };
      assert.equal(await sendCase.run(env), status === 202);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://mailer/v1/support/send');
      assert.equal(calls[0].method, 'POST');
      assert.equal(calls[0].headers.get('Idempotency-Key'), sendCase.key);
      assert.deepEqual(await calls[0].json(), { ...sendCase.payload, to: RECIPIENT });
    }
  });
}
