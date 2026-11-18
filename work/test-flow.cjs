'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {webcrypto} = require('node:crypto');
const vm = require('node:vm');

const html = fs.readFileSync('outputs/64-thought-experiment.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const data = new Map();

function boot() {
  const ids = new Map();
  const events = new Map();
  const timers = new Map();
  const inspect = {renderedProgress: [], canvas: []};
  let now = 0;
  let timerId = 0;
  const noop = () => {};

  class Node {
    constructor(tag = '') {
      this.tag = tag;
      this.style = {};
      this.children = [];
      this.nodes = [];
      this.classList = {add: noop};
      this.dataset = {};
    }
    set innerHTML(value) {
      for (const entry of this.nodes) if (entry.id) ids.delete(entry.id);
      this.markup = value;
      this.nodes = Array.from(value.matchAll(/<([a-z][\w-]*)\s+([^>]+)>/gi), (match) => {
        const node = new Node(match[1]);
        const attr = Object.fromEntries(Array.from(match[2].matchAll(/([\w-]+)="([^"]*)"/g), (pair) => [pair[1], pair[2]]));
        node.id = attr.id;
        node.className = attr.class || '';
        node.dataset = Object.fromEntries(Object.entries(attr).filter(([key]) => key.startsWith('data-')).map(([key, v]) => [key.slice(5), v]));
        if (node.id) ids.set(node.id, node);
        if (node.id === 'segments') node.children = Array.from({length: 8}, () => ({firstElementChild: {style: {}}}));
        return node;
      });
    }
    get innerHTML() { return this.markup || ''; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const checks = selector.split(',').map((s) => s.trim());
      return this.nodes.filter((node) => checks.some((s) => {
        if (s.startsWith('#')) return node.id === s.slice(1);
        if (s.startsWith('.')) return node.className.split(' ').includes(s.slice(1));
        if (s.startsWith('[')) {
          return Array.from(s.matchAll(/\[data-([\w-]+)(?:="([^"]+)")?\]/g)).every((m) => m[2] ? node.dataset[m[1]] === m[2] : node.dataset[m[1]] !== undefined);
        }
        return node.tag === s;
      }));
    }
    setAttribute(key, value) { this[key] = value; }
    closest() { return this; }
    contains() { return true; }
    focus() { document.activeElement = this; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); }
    removeChild(node) { this.children = this.children.filter((child) => child !== node); }
    replaceChildren() { this.innerHTML = ''; this.children = []; }
    remove() { this.removed = true; }
  }
  const document = {
    body: new Node('body'),
    visibilityState: 'visible',
    addEventListener: (event, handler) => events.set(event, handler),
    getElementById: (id) => ids.get(id) || null,
    createElement(tag) {
      const node = new Node(tag);
      if (tag === 'canvas') {
        node.getContext = () => new Proxy({
          createRadialGradient: () => ({addColorStop: noop}),
          measureText: (value) => ({width: value.length * 29})
        }, {get: (target, property) => target[property] || noop});
        node.toDataURL = () => {
          inspect.canvas.push([node.width, node.height]);
          return 'data:image/png;base64,cG5n';
        };
      }
      return node;
    }
  };
  for (const id of ['app', 'overlay', 'sheet', 'announcer', 'masthead-side', 'texture']) ids.set(id, new Node(id));
  ids.get('overlay').hidden = true;
  const sandbox = vm.createContext({
    document, location: new URL('http://127.0.0.1:8766/?from=xhs'), URL, URLSearchParams, TextDecoder, TextEncoder, atob,
    crypto: webcrypto, performance: {now: () => now}, matchMedia: () => ({matches: false}), scrollTo: noop, addEventListener: noop,
    localStorage: {getItem: (key) => data.get(key) || null, setItem: (key, val) => data.set(key, val)},
    setTimeout: (callback, delay) => { timers.set(++timerId, {when: now + delay, callback}); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    Image: class { set src(value) { assert.match(value, /^data:image\/svg\+xml/); queueMicrotask(() => this.onload()); } },
    record: (count) => inspect.renderedProgress.push(count)
  });
  sandbox.window = sandbox;
  const application = code.replace('const QUIZ = ', 'Sigil.mount = () => {}; Sigil.update = record; const QUIZ = ');
  vm.runInContext(application, sandbox);

  function click(action, dataset = {}) {
    const target = new Node('button');
    target.dataset = {action, ...dataset};
    events.get('click')({target});
  }
  function tick(delta) {
    const end = now + delta;
    while (true) {
      const next = Array.from(timers).sort((a, b) => a[1].when - b[1].when)[0];
      if (!next || next[1].when > end) break;
      timers.delete(next[0]);
      now = next[1].when;
      next[1].callback();
    }
    now = end;
  }
  return {ids, document, inspect, click, tick, sandbox};
}

const progress = () => JSON.parse(data.get('sixty-four-progress.v1'));
const eventually = async (condition) => {
  for (let attempts = 0; attempts < 100; attempts++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 4));
  }
  assert.ok(condition(), 'async flow produced the expected state');
};

(async () => {
  let test = boot();
  assert.match(test.ids.get('app').innerHTML, /穿越 <em>64<\/em> 重/);
  assert.equal((test.ids.get('app').innerHTML.match(/data-sigil-node=/g) || []).length, 64);
  test.click('start');
  for (let index = 0; index < 64; index++) {
    assert.equal(test.ids.get('question-pane').querySelectorAll('[data-action="answer"]').length, 4);
    test.click('answer', {index: index % 4, question: index});
    assert.equal(progress().cursor, index + 1);
    assert.equal(progress().source, 'xhs');
    assert.equal(Object.values(progress().scores).reduce((sum, value) => sum + value, 0), 4 * (index + 1));
    test.tick(200);
    assert.equal(test.inspect.renderedProgress.at(-1), index + 1);
    if (index === 10) {
      test = boot();
      assert.match(test.ids.get('question-pane').innerHTML, /第 12 题/);
      assert.equal(test.inspect.renderedProgress.at(-1), 11);
      test.click('back');
      assert.match(test.ids.get('question-pane').innerHTML, /第 11 题/);
      test.click('answer', {index: 3, question: 10});
      test.tick(200);
      assert.equal(progress().answers.at(-1), 3);
    }
    if ((index + 1) % 8 === 0) {
      assert.match(test.ids.get('question-pane').innerHTML, /阶段精神显影/);
      if (index === 63) {
        test = boot();
        assert.match(test.ids.get('question-pane').innerHTML, /阶段精神显影/);
      } else test.click('advance');
    }
  }
  test.tick(2600);
  assert.match(test.ids.get('app').innerHTML, /正在收束 64 重思想切片/);
  assert.equal((test.ids.get('app').innerHTML.match(/class="sigil-calc-node"/g) || []).length, 64);
  test.tick(1950);
  assert.match(test.ids.get('compute-line').textContent, /正在剥离/);
  test.tick(2049);
  assert.equal(progress().stage, 'compute');
  test.tick(1);
  assert.equal(progress().stage, 'result');
  assert.match(test.ids.get('premium-area').innerHTML, /locked-noise/);
  const id = test.ids.get('app').innerHTML.match(/64-[0-9A-F]{4}-[0-9A-F]{4}/)[0];
  test.click('poster');
  await eventually(() => test.inspect.canvas.length === 1);
  assert.deepEqual(test.inspect.canvas[0], [1080, 1620]);
  assert.equal(test.ids.get('sheet').children.at(-1).download, `${id}-poster.png`);
  test.click('close');
  test.click('checkout');
  assert.match(test.ids.get('sheet').innerHTML, /¥9\.9/);
  assert.match(test.ids.get('sheet').innerHTML, /¥19\.9/);
  test.click('simulate');
  await eventually(() => /火漆已揭/.test(test.ids.get('premium-area').innerHTML));
  assert.match(test.ids.get('premium-area').innerHTML, /is-shattered/);
  assert.ok(!test.ids.get('premium-area').innerHTML.includes('locked-noise'));
  assert.ok(data.get('unlock_token').includes('preview-'));
  test = boot();
  await eventually(() => /火漆已揭/.test(test.ids.get('premium-area').innerHTML));
  assert.match(test.ids.get('app').innerHTML, new RegExp(id));
  test.click('checkout');
  assert.match(test.ids.get('sheet').innerHTML, /¥10\.0/);
  test.click('simulate');
  await eventually(() => /64 重抉择回望/.test(test.ids.get('premium-area').innerHTML));
  assert.equal((test.ids.get('premium-area').innerHTML.match(/<li>/g) || []).length, 64);
  assert.equal((test.ids.get('premium-area').innerHTML.match(/data-action="wallpaper"/g) || []).length, 8);
  test.click('wallpaper', {index: '7'});
  await eventually(() => test.inspect.canvas.length === 1);
  assert.deepEqual(test.inspect.canvas[0], [1080, 1920]);
  console.log('Integrated DOM-stub flow passed all 64 choices, 8 reveals, edited answer, reload, 4s timing, free result, preview, upgrade, archive, and Canvas calls.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
