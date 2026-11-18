const {strict: assert} = require('node:assert');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
const {createCipheriv, randomBytes, webcrypto} = require('node:crypto');

const context = {profileId: 'DX-01234', factionId: 'absurdist'};
const report = {modules: ['甲', '乙', '丙'], slices: Array(64).fill('记录')};
const serverToken = 'server.token.abcdefghijklmnop';
const params = {
  appId: 'wx1234567890', timeStamp: '1234567890', nonceStr: 'test',
  package: 'prepay_id=test', signType: 'RSA', paySign: 'mockMerchantSignature'
};
const source = readFileSync('./work/payment.js', 'utf8');

function fixture(config = {}) {
  const page = new URL(config.url || 'https://merchant.test/start');
  const map = config.map || new Map();
  const visited = [];
  const windows = {
    crypto: webcrypto,
    location: {protocol: page.protocol, hostname: page.hostname, origin: page.origin, href: page.href,
      assign: value => visited.push(value)},
    navigator: {userAgent: 'MicroMessenger'},
    setTimeout: (callback, ms) => setTimeout(callback, ms < 7000 ? 1 : ms),
    clearTimeout, atob, AbortController,
    localStorage: {getItem: name => map.get(name), setItem: (name, value) => map.set(name, value)},
    fetch: config.fetch || (() => { throw Error('unexpected network request'); }),
    WeixinJSBridge: config.jsapi
  };
  const document = {hidden: false, addEventListener() {}, removeEventListener() {}};
  runInNewContext(source, {window: windows, document, TextEncoder, TextDecoder, URL});
  const updates = [];
  const bridge = new windows.WeChatPayBridge({
    preview: config.preview, loadPreview: config.loadPreview, redirectOrigins: config.redirectOrigins,
    onUpdate: result => updates.push(result)
  });
  return {bridge, map, updates, visited};
}

function json(payload, status = 200) {
  return {status, ok: status === 200, json: async () => payload};
}

function envelope(plan, payload) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context.profileId + '|' + context.factionId + '|' + plan));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return {alg: 'A256GCM', key: key.toString('base64'), iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64')};
}

async function main() {
  const loadPreview = async () => report;
  const preview = fixture({preview: true, url: 'file:///C:/preview.html', loadPreview});
  assert.equal(preview.bridge.previewEnabled, true);
  assert.equal((await preview.bridge.restore(context)).state, 'locked');
  assert.equal((await preview.bridge.buy({...context, plan: 'decode'})).state, 'preview');
  const simulated = await preview.bridge.simulate({...context, plan: 'decode'});
  assert.equal(simulated.state, 'unlocked');
  assert.equal(simulated.simulated, true);
  assert.equal(simulated.content.slices, undefined);
  const simulatedArchive = await preview.bridge.simulate({...context, plan: 'archive'});
  assert.equal(simulatedArchive.content.slices.length, 64);
  assert(!preview.map.get('unlock_token').includes('记录'));
  const reopened = fixture({preview: true, url: 'file:///C:/preview.html', loadPreview, map: preview.map});
  assert.equal((await reopened.bridge.restore(context)).content.slices.length, 64);
  const hosted = fixture({preview: true, url: 'https://merchant.test/', map: preview.map, loadPreview});
  assert.equal(hosted.bridge.previewEnabled, false);
  assert.equal((await hosted.bridge.restore(context)).state, 'locked');
  assert.equal((await hosted.bridge.simulate({...context, plan: 'archive'})).state, 'locked');

  const plans = ['decode', 'archive'];
  const calls = [];
  let lastPlan = null;
  let allowed = false;
  const firstContent = envelope('decode', report);
  const secondContent = envelope('archive', report);
  const prod = fixture({
    jsapi: {invoke(method, given, callback) {
      assert.equal(method, 'getBrandWCPayRequest');
      assert.deepEqual(JSON.parse(JSON.stringify(given)), params);
      callback({err_msg: 'get_brand_wcpay_request:ok'});
    }},
    fetch: async (url, options) => {
      const sent = JSON.parse(options.body);
      calls.push([url, sent]);
      assert.equal(options.redirect, 'error');
      if (url.endsWith('/orders')) {
        assert.equal(sent.amountFen, undefined);
        assert(plans.includes(sent.plan));
        lastPlan = sent.plan;
        return json({state: 'pending', plan: lastPlan, amountFen: lastPlan === 'decode' ? 990 : 1000,
          orderId: 'ord-' + lastPlan, checkout: {kind: 'jsapi', params}});
      }
      if (url.endsWith('/status')) {
        assert.equal(sent.orderId, 'ord-' + lastPlan);
        return allowed ? json({...context, state: 'paid', plan: lastPlan, unlockToken: serverToken}) : json({state: 'pending'});
      }
      assert.equal(sent.unlockToken, serverToken);
      return json({...context, state: 'unlocked', plan: lastPlan,
        envelope: lastPlan === 'decode' ? firstContent : secondContent});
    }
  });
  assert.equal((await prod.bridge.buy({...context, plan: 'decode'})).state, 'pending');
  assert(!calls.some(([url]) => url.endsWith('/content')));
  const intent = calls[0][1].requestId;
  allowed = true;
  const decoded = await prod.bridge.restore(context);
  assert.equal(decoded.state, 'unlocked');
  assert.equal(decoded.content.modules[2], '丙');
  assert(calls.filter(([url]) => url.endsWith('/status')).every(([, body]) => body.requestId === intent));
  assert.equal((await prod.bridge.buy({...context, plan: 'archive'})).content.slices.length, 64);
  const fresh = fixture({map: prod.map, fetch: async (url, options) => {
    assert(url.endsWith('/content'));
    assert.equal(JSON.parse(options.body).unlockToken, serverToken);
    return json({}, 403);
  }});
  assert.equal((await fresh.bridge.restore(context)).state, 'locked');
  assert(!fresh.map.get('unlock_token').includes(serverToken));

  const checkout = {kind: 'redirect', url: 'https://gateway.test/pay'};
  const createRedirect = async () => json({state: 'pending', plan: 'decode', orderId: 'agg-001', amountFen: 990, checkout});
  const blocked = fixture({fetch: createRedirect});
  assert.equal((await blocked.bridge.buy({...context, plan: 'decode'})).state, 'error');
  assert.equal(blocked.visited.length, 0);
  const redirect = fixture({fetch: createRedirect, redirectOrigins: ['https://gateway.test']});
  assert.equal((await redirect.bridge.buy({...context, plan: 'decode'})).state, 'redirecting');
  assert.equal(redirect.visited[0], checkout.url);
  const returned = fixture({map: redirect.map, fetch: async (url, options) => {
    if (url.endsWith('/status')) {
      assert.equal(JSON.parse(options.body).orderId, 'agg-001');
      return json({...context, state: 'paid', plan: 'decode', unlockToken: serverToken});
    }
    return json({...context, state: 'unlocked', plan: 'decode', envelope: firstContent});
  }});
  assert.equal((await returned.bridge.restore(context)).state, 'unlocked');
  console.log('Payment module passed preview, hosted isolation, JSAPI trust boundary, server encryption, tier upgrade, token revocation, redirect whitelist, and return recovery checks.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
