(function (global) {
  'use strict';

  const PLANS = Object.freeze({decode: 990, archive: 1990});
  const TOKEN_KEY = 'unlock_token';
  const PENDING_KEY = 'sixty_four_pending_orders';
  const PROFILE_ID = /^[A-Za-z0-9_-]{1,96}$/;
  const FACTION_ID = /^[a-z0-9_-]{1,64}$/;
  const ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/;
  const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
  const POLL_DELAYS = [0, 1100, 1900, 2800, 4300, 6100];

  class PaymentError extends Error {
    constructor(message) {
      super(message);
    }
  }

  function validContext(context) {
    return context && typeof context.profileId === 'string' && PROFILE_ID.test(context.profileId) &&
      typeof context.factionId === 'string' && FACTION_ID.test(context.factionId);
  }

  function validPlan(plan) {
    return typeof plan === 'string' && Object.prototype.hasOwnProperty.call(PLANS, plan);
  }

  function includesPlan(owned, requested) {
    return owned === 'archive' || owned === requested;
  }

  function randomId() {
    const bytes = global.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function validServerToken(token) {
    return typeof token === 'string' && token.length >= 20 && token.length <= 4096 &&
      !token.startsWith('preview-') && /^[A-Za-z0-9._~+\/=-]+$/.test(token);
  }

  function validatePayload(content, plan) {
    const nonempty = value => typeof value === 'string' && value.trim().length > 0;
    if (!content || !Array.isArray(content.modules) || content.modules.length !== 3 ||
        !content.modules.every(nonempty)) {
      throw new PaymentError('档案格式异常，请重新核验。');
    }
    if (plan === 'decode') return {modules: content.modules};
    if (!Array.isArray(content.slices) || content.slices.length !== 64 || !content.slices.every(nonempty)) {
      throw new PaymentError('完整档案尚未准备好，请重新核验。');
    }
    return {modules: content.modules, slices: content.slices};
  }

  function base64Bytes(value, limit) {
    if (typeof value !== 'string' || value.length > limit ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      throw new PaymentError('档案密文格式异常，请重新核验。');
    }
    return Uint8Array.from(global.atob(value), character => character.charCodeAt(0));
  }

  async function decryptPayload(envelope, context, plan) {
    if (!envelope || envelope.alg !== 'A256GCM' || !global.crypto || !global.crypto.subtle) {
      throw new PaymentError('此浏览器无法读取加密档案，请在支持安全连接的浏览器中重试。');
    }
    try {
      const rawKey = base64Bytes(envelope.key, 48);
      const iv = base64Bytes(envelope.iv, 24);
      const ciphertext = base64Bytes(envelope.ciphertext, 1400000);
      if (rawKey.length !== 32 || iv.length !== 12 || ciphertext.length <= 16) {
        throw new Error('Invalid envelope length');
      }
      const key = await global.crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
      const additionalData = new TextEncoder().encode(context.profileId + '|' + context.factionId + '|' + plan);
      const plaintext = await global.crypto.subtle.decrypt(
        {name: 'AES-GCM', iv, additionalData, tagLength: 128}, key, ciphertext
      );
      return validatePayload(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(plaintext)), plan);
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError('档案解密未完成，请重新核验。');
    }
  }

  function waitForBridge() {
    const ready = () => global.WeixinJSBridge && typeof global.WeixinJSBridge.invoke === 'function';
    if (ready()) return Promise.resolve(global.WeixinJSBridge);
    if (!/MicroMessenger/i.test(global.navigator.userAgent)) {
      return Promise.reject(new PaymentError('请在微信内打开此页，或使用收银台提供的其他方式。'));
    }
    return new Promise((resolve, reject) => {
      const onReady = () => {
        if (!ready()) return;
        global.clearTimeout(timer);
        document.removeEventListener('WeixinJSBridgeReady', onReady);
        resolve(global.WeixinJSBridge);
      };
      const timer = global.setTimeout(() => {
        document.removeEventListener('WeixinJSBridgeReady', onReady);
        reject(new PaymentError('微信收银台暂未就绪，请返回页面后重试。'));
      }, 4500);
      document.addEventListener('WeixinJSBridgeReady', onReady);
      onReady();
    });
  }

  async function invokeJsapi(params) {
    const fields = ['appId', 'timeStamp', 'nonceStr', 'package', 'signType', 'paySign'];
    if (!params || !fields.every(field => typeof params[field] === 'string' && params[field].length) ||
        params.signType !== 'RSA' || !/^\d+$/.test(params.timeStamp) ||
        !params.package.startsWith('prepay_id=')) {
      throw new PaymentError('收银台参数暂不可用，请稍后重试。');
    }
    const signed = {};
    fields.forEach(field => { signed[field] = params[field]; });
    const bridge = await waitForBridge();
    return new Promise((resolve, reject) => {
      const timer = global.setTimeout(() => resolve('timeout'), 45000);
      try {
        bridge.invoke('getBrandWCPayRequest', signed, result => {
          global.clearTimeout(timer);
          const status = result && result.err_msg;
          if (status === 'get_brand_wcpay_request:ok') resolve('ok');
          else if (status === 'get_brand_wcpay_request:cancel') resolve('cancel');
          else resolve('fail');
        });
      } catch (_) {
        global.clearTimeout(timer);
        reject(new PaymentError('未能打开微信收银台，请稍后重试。'));
      }
    });
  }

  class WeChatPayBridge {
    constructor(options) {
      const config = options || {};
      this.endpoint = config.endpoint || '/api/sixty-four';
      this.redirectOrigins = Array.isArray(config.redirectOrigins) ? config.redirectOrigins.slice() : [];
      const local = global.location.protocol === 'file:' || LOOPBACK.includes(global.location.hostname);
      Object.defineProperty(this, 'previewEnabled', {value: config.preview === true && local});
      this.loadPreview = config.loadPreview;
      this.onUpdate = typeof config.onUpdate === 'function' ? config.onUpdate : () => {};
      this.memory = new Map();
      this.operation = null;
    }

    recordKey(profileId) {
      return 'profile:' + profileId;
    }

    read(key, context) {
      const id = this.recordKey(context.profileId);
      const memoryId = key + '/' + id;
      try {
        let saved = this.memory.get(memoryId);
        if (saved === undefined) {
          const records = JSON.parse(global.localStorage.getItem(key) || '{}');
          saved = records && records[id];
        }
        return saved && saved.factionId === context.factionId ? saved : null;
      } catch (_) {
        return null;
      }
    }

    write(key, context, value) {
      const id = this.recordKey(context.profileId);
      const memoryId = key + '/' + id;
      const record = value ? Object.assign({factionId: context.factionId}, value) : null;
      try {
        const parsed = JSON.parse(global.localStorage.getItem(key) || '{}');
        const records = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        if (record) records[id] = record;
        else delete records[id];
        global.localStorage.setItem(key, JSON.stringify(records));
        this.memory.delete(memoryId);
      } catch (_) {
        this.memory.set(memoryId, record);
      }
    }

    update(context, state, message, extras) {
      const result = Object.assign({
        state, message, profileId: context.profileId, factionId: context.factionId
      }, extras);
      try { this.onUpdate(result); } catch (_) { /* UI errors never change payment state. */ }
      return result;
    }

    run(type, context, task) {
      if (!validContext(context)) {
        return Promise.resolve({state: 'error', message: '档案编号无效，请重新打开结果。'});
      }
      if (this.operation) {
        const active = this.operation;
        if (active.profileId === context.profileId &&
            ((active.type === type && active.plan === context.plan) || type === 'restore')) {
          return active.promise;
        }
        if (active.profileId === context.profileId && active.type === 'restore') {
          return active.promise.then(() => this.run(type, context, task));
        }
        return Promise.resolve({state: 'busy', message: '正在核验另一笔订单。'});
      }
      const operation = {type, profileId: context.profileId, plan: context.plan};
      operation.promise = Promise.resolve().then(task).catch(error => this.update(
        context, 'error', error instanceof PaymentError ? error.message : '连接暂时中断，请稍后重新核验。'
      )).then(result => {
        if (this.operation === operation) this.operation = null;
        return result;
      });
      this.operation = operation;
      return operation.promise;
    }

    async request(path, payload, accepted) {
      const base = new URL(this.endpoint.replace(/\/+$/, '') + '/', global.location.href);
      if (base.origin !== global.location.origin || base.username || base.password || base.search || base.hash ||
          (base.protocol !== 'https:' && !(base.protocol === 'http:' && LOOPBACK.includes(base.hostname)))) {
        throw new PaymentError('安全收银台暂未配置。');
      }
      const url = new URL(path, base);
      const controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
      const fetchResult = (async () => {
        const response = await global.fetch(url.href, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
          signal: controller ? controller.signal : undefined,
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          if (accepted && accepted.includes(response.status)) return {state: 'unauthorized'};
          throw new PaymentError('收银台暂不可用，请稍后重试。');
        }
        return response.json();
      })();
      let timer;
      const timeout = new Promise((resolve, reject) => {
        timer = global.setTimeout(() => {
          if (controller) controller.abort();
          reject(new PaymentError('网络等待超时，订单可稍后继续核验。'));
        }, 7500);
      });
      try {
        return await Promise.race([fetchResult, timeout]);
      } finally {
        global.clearTimeout(timer);
      }
    }

    async loadUnlocked(context, record) {
      if (!record || !validPlan(record.plan) || !validServerToken(record.value)) return null;
      const receipt = await this.request('content', {
        profileId: context.profileId, factionId: context.factionId, unlockToken: record.value
      }, [401, 403, 404, 410]);
      if (receipt && receipt.state === 'unauthorized') {
        const latest = this.read(TOKEN_KEY, context);
        if (latest && latest.value === record.value) this.write(TOKEN_KEY, context, null);
        return null;
      }
      if (!receipt || receipt.state !== 'unlocked' || !validPlan(receipt.plan) ||
          !includesPlan(receipt.plan, record.plan) || receipt.profileId !== context.profileId ||
          receipt.factionId !== context.factionId) {
        throw new PaymentError('档案权益暂未确认，请稍后重新核验。');
      }
      const content = await decryptPayload(receipt.envelope, context, receipt.plan);
      return this.update(context, 'unlocked', '档案已开启。', {plan: receipt.plan, content});
    }

    async fulfill(context, response, pending) {
      if (!response || response.state !== 'paid' || !validPlan(response.plan) ||
          !validServerToken(response.unlockToken) || response.profileId !== context.profileId ||
          response.factionId !== context.factionId ||
          (pending && !includesPlan(response.plan, pending.plan))) {
        throw new PaymentError('订单权益暂未确认，请稍后重新核验。');
      }
      const record = {plan: response.plan, value: response.unlockToken};
      this.write(TOKEN_KEY, context, record);
      const unlocked = await this.loadUnlocked(context, record);
      if (!unlocked) throw new PaymentError('支付已核验，档案凭证仍待签发。请稍后重新核验。');
      this.clearPending(context, pending);
      return Object.assign({}, unlocked, {fulfilledNow: true});
    }

    pending(context) {
      const saved = this.read(PENDING_KEY, context);
      return saved && validPlan(saved.plan) && typeof saved.requestId === 'string' &&
        ORDER_ID.test(saved.requestId) && (!saved.orderId ||
        (typeof saved.orderId === 'string' && ORDER_ID.test(saved.orderId))) ? saved : null;
    }

    clearPending(context, pending) {
      const current = this.pending(context);
      if (pending && current && current.requestId === pending.requestId) {
        this.write(PENDING_KEY, context, null);
      }
    }

    async check(context, pending, delays, pendingMessage) {
      const details = {orderId: pending.orderId, plan: pending.plan};
      this.update(context, 'checking', '正在核验支付状态…', details);
      for (const delay of delays) {
        if (delay) await new Promise(resolve => global.setTimeout(resolve, delay));
        const response = await this.request('orders/status', {
          orderId: pending.orderId || null,
          requestId: pending.requestId,
          profileId: context.profileId,
          factionId: context.factionId
        });
        if (!response || typeof response.state !== 'string') {
          throw new PaymentError('订单状态暂未同步，请稍后重新核验。');
        }
        if (response.state === 'paid') return this.fulfill(context, response, pending);
        if (response.state === 'closed') {
          this.clearPending(context, pending);
          return this.update(context, 'closed', '这笔订单已关闭，可以重新开启收银台。', details);
        }
        if (response.state !== 'pending') throw new PaymentError('订单状态暂未同步，请稍后重新核验。');
        if (document.hidden) break;
      }
      return this.update(context, 'pending', pendingMessage || '订单等待确认，可以返回此页重新核验。', details);
    }

    buy(context) {
      return this.run('buy', context, async () => {
        const plan = context.plan;
        if (!validPlan(plan)) throw new PaymentError('请选择有效的档案版本。');
        if (this.previewEnabled) {
          return this.update(context, 'preview', '本地预览，请使用预览入口体验解封。', {plan});
        }

        let pending = this.pending(context);
        if (pending && pending.plan !== plan) {
          const previous = await this.check(context, pending, [0], '上一笔订单仍待确认，请先完成或核验。');
          if (previous.state === 'pending' ||
              (previous.state === 'unlocked' && includesPlan(previous.plan, plan))) return previous;
          pending = null;
        }
        if (!pending) {
          pending = {plan, requestId: randomId(), orderId: null};
          this.write(PENDING_KEY, context, pending);
        }

        this.update(context, 'creating', '正在开启收银台…', {plan});
        const response = await this.request('orders', {
          profileId: context.profileId, factionId: context.factionId, plan,
          requestId: pending.requestId
        });
        if (response && response.state === 'paid') return this.fulfill(context, response, pending);
        if (response && response.state === 'closed') {
          this.clearPending(context, pending);
          return this.update(context, 'closed', '这笔订单已关闭，请重新开启收银台。', {plan});
        }
        if (!response || response.state !== 'pending' || response.plan !== plan ||
            typeof response.orderId !== 'string' || !ORDER_ID.test(response.orderId) ||
            (pending.orderId && pending.orderId !== response.orderId) ||
            (response.amountFen !== PLANS[plan] && !(plan === 'archive' && response.amountFen === 1000))) {
          throw new PaymentError('收银台订单暂未准备好，请稍后重试。');
        }

        pending.orderId = response.orderId;
        this.write(PENDING_KEY, context, pending);
        if (context.expectedAmountFen === 1000 && response.amountFen !== 1000) {
          throw new PaymentError('补差价格暂未准备好，请核对已有订单。');
        }
        const checkout = response.checkout;
        if (checkout && checkout.kind === 'jsapi') {
          this.update(context, 'checkout', '请在微信收银台确认。', {plan, orderId: pending.orderId});
          const result = await invokeJsapi(checkout.params);
          return this.check(context, pending, result === 'ok' || result === 'timeout' ? POLL_DELAYS : [0],
            result === 'cancel' ? '已返回档案页，订单仍可继续核验。' :
              result === 'fail' ? '收银台已返回，可重新核验或继续支付。' : undefined);
        }
        if (checkout && checkout.kind === 'redirect' && typeof checkout.url === 'string') {
          const target = new URL(checkout.url, global.location.href);
          const sameOrigin = target.origin === global.location.origin;
          if (target.username || target.password ||
              (target.protocol !== 'https:' && !(sameOrigin && target.protocol === 'http:' && LOOPBACK.includes(target.hostname))) ||
              (!sameOrigin && !this.redirectOrigins.includes(target.origin))) {
            throw new PaymentError('收银台地址暂不可用，请稍后重试。');
          }
          const result = this.update(context, 'redirecting', '正在前往收银台，完成后请返回本页。', {
            plan, orderId: pending.orderId
          });
          global.location.assign(target.href);
          return result;
        }
        return this.check(context, pending, [0]);
      });
    }

    restore(context) {
      return this.run('restore', context, async () => {
        const record = this.read(TOKEN_KEY, context);
        if (this.previewEnabled) {
          if (record && validPlan(record.plan) && /^preview-[a-f0-9]{32}$/.test(record.value)) {
            return this.preview(context, record);
          }
          return this.update(context, 'locked', '');
        }

        const pending = this.pending(context);
        let pendingChecked = false;
        if (pending && (!record || !includesPlan(record.plan, pending.plan))) {
          const result = await this.check(context, pending, record ? [0] : POLL_DELAYS);
          pendingChecked = true;
          if (result.state === 'unlocked' || !record) return result;
        }
        const unlocked = await this.loadUnlocked(context, record);
        if (unlocked) {
          if (pending && includesPlan(unlocked.plan, pending.plan)) this.clearPending(context, pending);
          return unlocked;
        }
        if (!pendingChecked && pending && this.pending(context)) return this.check(context, pending, POLL_DELAYS);
        return this.update(context, 'locked', '');
      });
    }

    simulate(context) {
      return this.run('simulate', context, async () => {
        if (!this.previewEnabled || !validPlan(context.plan)) return this.update(context, 'locked', '');
        const existing = this.read(TOKEN_KEY, context);
        if (existing && validPlan(existing.plan) && includesPlan(existing.plan, context.plan) &&
            /^preview-[a-f0-9]{32}$/.test(existing.value)) return this.preview(context, existing);
        const record = {plan: context.plan, value: 'preview-' + randomId()};
        return this.preview(context, record);
      });
    }

    async preview(context, record) {
      if (!this.previewEnabled || typeof this.loadPreview !== 'function') {
        return this.update(context, 'locked', '');
      }
      const content = validatePayload(await this.loadPreview({
        factionId: context.factionId, profileId: context.profileId, plan: record.plan, token: record.value
      }), record.plan);
      this.write(TOKEN_KEY, context, record);
      return this.update(context, 'unlocked', '本地档案预览已开启。', {
        plan: record.plan, content, simulated: true
      });
    }
  }

  WeChatPayBridge.PLANS = PLANS;
  global.WeChatPayBridge = WeChatPayBridge;
})(window);
