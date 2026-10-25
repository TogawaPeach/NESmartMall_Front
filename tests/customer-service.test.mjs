import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server, createPinia, useAuthStore, useCustomerServiceStore, http, configureAuth, fixture
let respond
const entries = new Map()
const requests = []
const user = { id: 'customer-1', account: 'demo', nickname: '用户', role: 1 }
const delta = (text) => `data: ${JSON.stringify({ type: 'delta', payload: { text } })}\n\n`
const done = 'data: {"type":"done","payload":{}}\n\n'
const encoder = new TextEncoder()
function session(token = 'customer-token', id = 'customer-1') {
  entries.set(
    'nesmartmall.auth',
    JSON.stringify({
      accessToken: token,
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600000,
      user: { ...user, id },
    }),
  )
}
function sse(text) {
  return new Response(text, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
}
function controlledStream() {
  let controller,
    cancelled = false
  const body = new ReadableStream({
    start(value) {
      controller = value
    },
    cancel() {
      cancelled = true
    },
  })
  return {
    respond(request) {
      request.signal.addEventListener(
        'abort',
        () => {
          cancelled = true
          controller.error(new DOMException('Aborted', 'AbortError'))
        },
        { once: true },
      )
      return sse(body)
    },
    push: (text) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
    get cancelled() {
      return cancelled
    },
  }
}
async function settle(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await new Promise(setImmediate)
  }
  assert.ok(predicate(), 'Expected asynchronous state to settle')
}
before(async () => {
  globalThis.localStorage = {
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => entries.set(k, v),
    removeItem: (k) => entries.delete(k),
  }
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
  globalThis.window = Object.assign(new EventTarget(), {
    location: { href: 'https://mall.example.test/' },
  })
  server = await createServer({
    configFile: false,
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  http.defaults.baseURL = 'https://mall.example.test'
  http.defaults.env.fetch = async (request) => {
    requests.push(request)
    return respond(request)
  }
})
beforeEach(() => {
  entries.clear()
  requests.length = 0
  respond = () => sse(delta('回答') + done)
})
afterEach(() => {
  fixture?.support?.$dispose()
  fixture?.auth.logout()
  fixture?.auth.$dispose()
  fixture = undefined
})
after(async () => {
  await server?.close()
  delete globalThis.localStorage
  delete globalThis.sessionStorage
  delete globalThis.window
})
async function mount(authenticated = true, withStore = true) {
  if (authenticated) session()
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  configureAuth(auth)
  fixture = { auth, pinia }
  if (withStore) {
    ;({ useCustomerServiceStore } = await server.ssrLoadModule('/src/stores/customerService.ts'))
    fixture.support = useCustomerServiceStore(pinia)
  }
  return fixture
}
async function stream(entry = 'guide', text = '本轮问题', options = {}) {
  const { streamCustomerServiceTurn } = await server.ssrLoadModule('/src/api/customerService.ts')
  return streamCustomerServiceTurn(entry, text, {
    expectedAuthorization: 'Bearer customer-token',
    onDelta: () => {},
    ...options,
  })
}

for (const [entry, path] of [
  ['guide', '/api/guide/turns/stream'],
  ['support', '/api/support/turns/stream'],
]) {
  test(`${entry} POST uses its fixed Gateway path, Bearer and only this turn's text`, async () => {
    await mount(true, false)
    const chunks = []
    await stream(entry, '我想买户外测量设备', { onDelta: (value) => chunks.push(value) })
    assert.equal(requests.length, 1)
    const request = requests[0]
    assert.equal(new URL(request.url).pathname, path)
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.get('Authorization'), 'Bearer customer-token')
    assert.equal(request.headers.get('Content-Type'), 'application/json')
    assert.equal(request.headers.get('Accept'), 'text/event-stream')
    assert.deepEqual(await request.json(), { text: '我想买户外测量设备' })
    assert.deepEqual(chunks, ['回答'])
  })
}
test('SSE incrementally decodes split UTF-8, CRLF, heartbeat and multiline data', async () => {
  await mount(true, false)
  let controller
  respond = () =>
    sse(
      new ReadableStream({
        start(c) {
          controller = c
        },
      }),
    )
  const chunks = []
  const result = stream('guide', '问题', { onDelta: (value) => chunks.push(value) })
  await settle(() => controller)
  const bytes = encoder.encode(
    ': heartbeat\r\n\r\ndata: {"type":"delta",\r\ndata: "payload":{"text":"中文🙂\\n下一行"}}\r\n\r\n',
  )
  for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
  await settle(() => chunks.length === 1)
  assert.deepEqual(chunks, ['中文🙂\n下一行'])
  controller.enqueue(encoder.encode(delta('尾段') + done + delta('不能出现')))
  await result
  assert.deepEqual(chunks, ['中文🙂\n下一行', '尾段'])
})
test('done stops and cancels the upstream stream without waiting for EOF', async () => {
  await mount(true, false)
  const source = controlledStream()
  respond = (request) => source.respond(request)
  const result = stream()
  await settle(() => requests.length === 1)
  source.push(done)
  await result
  await settle(() => source.cancelled)
})
for (const [name, body] of [
  ['EOF without done', delta('部分回答')],
  ['truncated final frame', delta('部分回答') + 'data: {"type":"done","payload":{}}'],
  ['malformed JSON', 'data: {broken}\n\n'],
  ['malformed delta', 'data: {"type":"delta","payload":{"text":9}}\n\n'],
  ['unknown event', 'data: {"type":"other","payload":{}}\n\n'],
  ['error event', delta('部分回答') + 'data: {"type":"error","payload":{"message":"failure"}}\n\n'],
]) {
  test(`${name} fails instead of claiming completion`, async () => {
    await mount(true, false)
    respond = () => sse(body)
    await assert.rejects(stream())
    assert.equal(requests.length, 1)
  })
}
test('a non-SSE JSON response is rejected and not rendered as an answer', async () => {
  await mount(true, false)
  respond = () => Response.json({ code: 500, message: 'failed' })
  await assert.rejects(stream())
})
test('HTTP 401 clears only the rejected login', async () => {
  const { auth } = await mount(true, false)
  respond = () => Response.json({ code: 401 }, { status: 401 })
  await assert.rejects(stream())
  assert.equal(auth.isAuthenticated, false)
})
test('an old request HTTP 401 does not clear a new account', async () => {
  const { auth } = await mount(true, false)
  let resolve
  respond = () =>
    new Promise((r) => {
      resolve = r
    })
  const result = stream()
  await settle(() => resolve)
  session('new-token', 'customer-2')
  auth.getAuthorization()
  resolve(Response.json({ code: 401 }, { status: 401 }))
  await assert.rejects(result)
  assert.equal(auth.getAuthorization(), 'Bearer new-token')
})
test('a stale request is cancelled before transport and never borrows a new token', async () => {
  await mount(true, false)
  session('new-token', 'customer-2')
  await assert.rejects(stream())
  assert.equal(requests.length, 0)
})
test('aborting a waiting stream releases its reader and rejects', async () => {
  await mount(true, false)
  const source = controlledStream()
  respond = (request) => source.respond(request)
  const controller = new AbortController()
  const result = stream('guide', '问题', { signal: controller.signal })
  await settle(() => requests.length === 1)
  controller.abort()
  await assert.rejects(result)
  await settle(() => source.cancelled)
})

test('guest send opens the existing login dialog without network or local fake reply', async () => {
  const { support, pinia } = await mount(false)
  const { useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts')
  support.open()
  support.draft = '想了解商品'
  assert.equal(support.sendText(), false)
  assert.equal(useLoginPromptStore(pinia).visible, true)
  assert.equal(support.messages.length, 1)
  assert.equal(requests.length, 0)
})
test('text is trimmed and the real incremental answer replaces simulated replies', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.open()
  support.draft = '  户外测量  '
  assert.equal(support.sendText(), true)
  assert.equal(support.draft, '')
  assert.equal(support.isReplying, true)
  await settle(() => requests.length === 1)
  assert.deepEqual(await requests[0].json(), { text: '户外测量' })
  source.push(delta('先看'))
  await settle(() => support.messages.at(-1).text === '先看')
  source.push(delta('精度') + done)
  await settle(() => !support.isReplying)
  assert.equal(support.messages.at(-1).text, '先看精度')
  assert.equal(support.error, '')
})
test('guide and product support have separate drafts, histories and endpoints', async () => {
  const { support } = await mount()
  support.open()
  support.draft = '导购问题'
  support.sendText()
  await settle(() => !support.isReplying)
  support.draft = '导购草稿'
  const guideHistory = support.messages.map((item) => item.text)
  support.open('support')
  assert.equal(support.entry, 'support')
  assert.equal(support.draft, '')
  assert.equal(support.messages.length, 1)
  support.draft = '售后问题'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(new URL(requests[1].url).pathname, '/api/support/turns/stream')
  support.open()
  assert.equal(support.entry, 'guide')
  assert.equal(support.draft, '导购草稿')
  assert.deepEqual(
    support.messages.map((item) => item.text),
    guideHistory,
  )
})
test('each entry rejects duplicate sends and quick questions while its answer is pending', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '第一条'
  support.sendText()
  support.draft = '第二条'
  assert.equal(support.sendText(), false)
  support.sendQuestion('shipping')
  await settle(() => requests.length === 1)
  assert.equal(support.draft, '第二条')
  assert.equal(support.messages.filter((item) => item.sender === 'visitor').length, 1)
  source.push(delta('回复') + done)
  await settle(() => !support.isReplying)
})
test('empty or oversized text does not send and exactly 500 characters does', async () => {
  const { support } = await mount()
  support.draft = ' \n '
  assert.equal(support.sendText(), false)
  support.draft = '字'.repeat(501)
  assert.equal(support.sendText(), false)
  assert.ok(support.error)
  assert.equal(requests.length, 0)
  support.draft = '字'.repeat(500)
  assert.equal(support.sendText(), true)
  await settle(() => !support.isReplying)
  assert.equal((await requests[0].json()).text.length, 500)
})
test('close preserves a draft and counts one unread answer, not one per delta', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.open()
  support.draft = '问题'
  support.sendText()
  support.draft = '草稿'
  support.close()
  await settle(() => requests.length === 1)
  source.push(delta('一') + delta('二') + done)
  await settle(() => !support.isReplying)
  assert.equal(support.unreadCount, 1)
  assert.equal(support.draft, '草稿')
  support.open()
  assert.equal(support.unreadCount, 0)
  assert.equal(support.messages.at(-1).text, '一二')
})
test('deltas from a hidden entry never append into the visible entry', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '导购问题'
  support.sendText()
  await settle(() => requests.length === 1)
  support.open('support')
  source.push(delta('导购回答') + done)
  await settle(() => source.cancelled)
  assert.equal(support.messages.length, 1)
  support.open()
  assert.equal(support.messages.at(-1).text, '导购回答')
})
test('clear cancels the current stream and late data cannot restore cleared messages', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '问题'
  support.sendText()
  await settle(() => requests.length === 1)
  support.clearConversation()
  await settle(() => source.cancelled)
  assert.equal(support.messages.length, 1)
  assert.equal(support.isReplying, false)
  assert.equal(support.error, '')
})
test('logout clears both entries and cancels in-flight replies', async () => {
  const { support, auth } = await mount()
  support.draft = '导购隐私'
  support.sendText()
  await settle(() => !support.isReplying)
  support.open('support')
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '客服隐私'
  support.sendText()
  await settle(() => requests.length === 2)
  auth.logout()
  await settle(() => source.cancelled)
  assert.equal(support.messages.length, 1)
  assert.equal(support.visible, false)
  support.open()
  assert.equal(support.messages.length, 1)
  assert.equal(support.draft, '')
})
test('account switch discovered on an incoming delta prevents old content leaking', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '旧问题'
  support.sendText()
  await settle(() => requests.length === 1)
  session('other-token', 'customer-2')
  source.push(delta('旧回答'))
  await settle(() => !support.isReplying)
  assert.equal(support.messages.length, 1)
  assert.equal(support.draft, '')
})
test('same-account token renewal keeps history but cancels the old pending turn', async () => {
  const { support, auth } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '问题'
  support.sendText()
  await settle(() => requests.length === 1)
  session('renewed-token')
  auth.getAuthorization()
  await settle(() => source.cancelled)
  assert.equal(support.messages[1].text, '问题')
  assert.equal(support.isReplying, false)
  assert.ok(support.error)
})
test('disconnect preserves a partial answer with a visible error and no automatic retry', async () => {
  const { support } = await mount()
  respond = () => sse(delta('已收到的部分'))
  support.draft = '问题'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(support.messages.at(-1).text, '已收到的部分')
  assert.ok(support.error)
  assert.equal(requests.length, 1)
})
test('product and order entries select support, with context kept out of the request', async () => {
  const { support, pinia } = await mount()
  useCustomerServiceStore(pinia)
  const { useCustomerServiceContext } = await server.ssrLoadModule(
    '/src/composables/useCustomerServiceContext.ts',
  )
  const entry = useCustomerServiceContext()
  entry.consultProduct({ id: '9007199254740993123', name: '仪器', model: 'RTK', priceFen: 0 })
  assert.equal(support.entry, 'support')
  assert.equal(support.pendingContext.name, '仪器')
  assert.equal(requests.length, 0)
  support.draft = '型号怎么选'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.deepEqual(await requests[0].json(), { text: '型号怎么选' })
  entry.consultOrder({
    orderNo: 'JW123',
    status: 'PENDING_PAYMENT',
    paidAmountFen: null,
    payableAmountFen: 100,
    recipient: { name: 'private' },
  })
  assert.equal(support.entry, 'support')
  assert.equal(JSON.stringify(support.pendingContext).includes('private'), false)
})
test('quick question keeps the unsent draft and posts only the selected question', async () => {
  const { support } = await mount()
  support.draft = '还在编辑'
  support.sendQuestion('shipping')
  assert.equal(support.draft, '还在编辑')
  await settle(() => !support.isReplying)
  assert.deepEqual(await requests[0].json(), { text: '购买后什么时候发货？' })
})
test('a quick question after an account change never restores the old private draft', async () => {
  const { support } = await mount()
  support.draft = '旧草稿'
  session('other-token', 'customer-2')
  support.sendQuestion('shipping')
  assert.equal(support.draft, '')
  assert.equal(JSON.stringify(support.messages).includes('旧草稿'), false)
})
test('Enter sends once while composition, keyCode 229 and Shift+Enter remain editor input', async () => {
  const { support } = await mount()
  const { useCustomerServiceComposer } = await server.ssrLoadModule(
    '/src/composables/useCustomerServiceComposer.ts',
  )
  const composer = useCustomerServiceComposer()
  let prevented = 0
  const event = (overrides = {}) => ({
    key: 'Enter',
    shiftKey: false,
    isComposing: false,
    keyCode: 13,
    preventDefault: () => prevented++,
    ...overrides,
  })
  support.draft = '键盘消息'
  for (const overrides of [
    { isComposing: true },
    { keyCode: 229 },
    { shiftKey: true },
    { key: 'a' },
  ])
    composer.handleKeydown(event(overrides))
  assert.equal(support.messages.length, 1)
  composer.handleKeydown(event())
  assert.equal(support.messages[1].text, '键盘消息')
  assert.equal(prevented, 1)
  await settle(() => !support.isReplying)
  assert.equal(requests.length, 1)
})

test('idle timeout resets on heartbeats and aborts a stalled stream without retry', async (context) => {
  await mount(true, false)
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const source = controlledStream()
  respond = (request) => source.respond(request)
  const result = stream()
  const rejection = assert.rejects(result, (error) => error.kind === 'timeout')
  await settle(() => requests.length === 1)
  context.mock.timers.tick(50_000)
  source.push(': heartbeat\n\n')
  await new Promise(setImmediate)
  context.mock.timers.tick(59_000)
  assert.equal(requests[0].signal.aborted, false)
  context.mock.timers.tick(1_000)
  await rejection
  assert.equal(requests[0].signal.aborted, true)
  assert.equal(requests.length, 1)
  context.mock.timers.reset()
})

test('a JSON business 401 clears the matching session and prompts login', async () => {
  const { support, auth, pinia } = await mount()
  respond = () => Response.json({ code: 401, message: 'expired', data: null })
  support.draft = '问题'
  support.sendText()
  await settle(() => !auth.isAuthenticated)
  const { useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts')
  assert.equal(useLoginPromptStore(pinia).visible, true)
  assert.equal(support.messages.length, 1)
})

test('HTTP 403 shows failure without clearing the login or retrying', async () => {
  const { support, auth } = await mount()
  respond = () => Response.json({ code: 403 }, { status: 403 })
  support.draft = '问题'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.ok(support.error)
  assert.equal(auth.isAuthenticated, true)
  assert.equal(requests.length, 1)
})

test('clearing support leaves a concurrent guide answer running and isolated', async () => {
  const { support } = await mount()
  const guide = controlledStream(),
    service = controlledStream()
  respond = (request) =>
    request.url.includes('/guide/') ? guide.respond(request) : service.respond(request)
  support.draft = '导购问题'
  support.sendText()
  support.open('support')
  support.draft = '客服问题'
  support.sendText()
  await settle(() => requests.length === 2)
  support.clearConversation()
  await settle(() => service.cancelled)
  assert.equal(guide.cancelled, false)
  guide.push(delta('导购仍然完成') + done)
  await settle(() => guide.cancelled)
  assert.equal(support.messages.length, 1)
  support.open()
  assert.equal(support.messages.at(-1).text, '导购仍然完成')
})

test('clearing all on widget teardown cancels both conversations and removes local context', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '导购问题'
  support.sendText()
  await settle(() => requests.length === 1)
  support.open('support', { kind: 'product', id: '123', name: '商品', model: null, priceFen: null })
  support.draft = '客服草稿'
  support.clearAllConversations()
  await settle(() => source.cancelled)
  assert.equal(support.messages.length, 1)
  assert.equal(support.pendingContext, null)
  assert.equal(support.draft, '')
  support.open()
  assert.equal(support.messages.length, 1)
  assert.equal(support.isReplying, false)
})

test('HTTP 401 during a store turn still opens login after the auth watcher cancels the stream', async () => {
  const { support, auth, pinia } = await mount()
  respond = () => Response.json({ code: 401 }, { status: 401 })
  support.open()
  support.draft = '问题'
  support.sendText()
  const { useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts')
  await settle(() => !support.isReplying)
  assert.equal(auth.isAuthenticated, false)
  assert.equal(useLoginPromptStore(pinia).visible, true)
})
