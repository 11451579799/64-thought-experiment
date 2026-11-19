(() => {
  'use strict';

  const CONFIG = {
    endpoint: '/api/sixty-four',
    preview: true, // WeChatPayBridge restricts this to file:// and loopback origins.
    redirectOrigins: [] // Add exact HTTPS origins only for your configured payment provider.
  };
  const STORAGE_KEY = 'sixty-four-progress.v1';
  const ACT_NUMBERS = '一二三四五六七八';
  const questions = QUIZ.chapters.flatMap((chapter) => chapter.questions);
  const factions = QUIZ.factions;
  const modules = [
    '你的精神病灶与潜意识盲区',
    '与平庸世俗和解的现实生存处方',
    '你的宿命同路人与灵魂克星'
  ];
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');
  const sheet = document.getElementById('sheet');
  const announcer = document.getElementById('announcer');
  const headerStatus = document.getElementById('masthead-side');
  let saveFailed = false;
  let state = readProgress();
  let screen = '';
  let latestResult = null;
  let grant = null;
  let transitionTimer = 0;
  let computeTimer = 0;
  let finalRevealTimer = 0;
  let dialogSerial = 0;
  let dialogTrigger = null;
  let dialogKind = '';
  let selectedPlan = 'decode';
  let paymentStatus = '';
  let busy = false;
  let restoreTask = null;
  let readyForNextAnswer = 0;

  const pay = new WeChatPayBridge({
    ...CONFIG,
    loadPreview: typeof loadPreviewContent === 'function' ? loadPreviewContent : undefined,
    onUpdate(update) {
      if (update && latestResult && update.profileId === latestResult.profileId && update.message) sayPayment(update.message);
    }
  });

  document.getElementById('texture').innerHTML = Sigil.texture();
  window.addEventListener('pageshow', restoreWhenReady);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restoreWhenReady();
  });

  function scoresFor(answers) {
    const scores = Object.fromEntries(factions.map(({id}) => [id, 0]));
    answers.forEach((answer, index) => {
      for (const [id, value] of Object.entries(questions[index].options[answer].scores)) {
        scores[id] += value;
      }
    });
    return scores;
  }

  function newSession() {
    const bytes = new Uint8Array(12);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    const seed = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    const source = new URLSearchParams(location.search).get('from');
    return {version: 1, seed, source: ['poster', 'xhs'].includes(source) ? source : 'direct', started: false, answers: [], cursor: 0, reveal: null, stage: 'quiz', scores: scoresFor([])};
  }

  function readProgress() {
    let entry;
    try {
      entry = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      if (!(error instanceof SyntaxError)) saveFailed = true;
    }
    if (!entry || entry.version !== 1 || !/^[a-f0-9]{24}$/.test(entry.seed)) return newSession();
    const answers = [];
    if (Array.isArray(entry.answers)) {
      for (const answer of entry.answers.slice(0, 64)) {
        if (!Number.isInteger(answer) || answer < 0 || answer > 3) break;
        answers.push(answer);
      }
    }
    const complete = answers.length === 64;
    const stage = complete && ['compute', 'result'].includes(entry.stage) ? entry.stage : 'quiz';
    const cursor = Number.isInteger(entry.cursor) ? Math.max(0, Math.min(entry.cursor, answers.length)) : answers.length;
    const reveal = cursor === answers.length && cursor > 0 && cursor % 8 === 0 && entry.reveal === cursor / 8 - 1 ? entry.reveal : null;
    return {
      version: 1, seed: entry.seed, source: ['poster', 'xhs'].includes(entry.source) ? entry.source : 'direct', started: Boolean(entry.started || answers.length), answers,
      cursor: cursor === 64 && stage === 'quiz' && reveal === null ? 63 : cursor,
      reveal, stage, scores: scoresFor(answers)
    };
  }

  function saveProgress() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveFailed = false;
    } catch {
      saveFailed = true;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
  }

  function focusHeading() {
    const heading = app.querySelector('h1, h2');
    if (heading) heading.focus({preventScroll: true});
  }

  function goTop() {
    window.scrollTo(0, 0);
  }

  function renderIntro() {
    screen = 'intro';
    headerStatus.textContent = '思想实验 · 64';
    app.innerHTML = `<div class="hero">
      <div class="hero-content">
        <p class="kicker eyebrow-line">沉浸式哲学人格侧写</p>
        <h1 tabindex="-1">穿越 <em>64</em> 重<br>思想切片</h1>
        <p class="lead">《易经》以六爻展开六十四种变易。莱布尼茨后来在卦序中辨认出与二进制相通的结构。六次二择，恰好展开 64 种形状。</p>
        <p class="invocation">八幕之后，你将得到一份由抉择写成的精神档案。</p>
        <div class="facts"><span>64 道思想实验</span><span>约 6–8 分钟</span><span>免费查看侧写</span></div>
        <button type="button" class="btn primary" data-action="start">进入第一幕 <span aria-hidden="true">↗</span></button>
        <p class="hint">答题进度保存在本机。完整档案为可选付费内容。</p>
      </div>
      <div class="art-orbit hero-art" aria-hidden="true">${Sigil.badge(64, 0)}</div>
    </div>`;
  }

  function renderQuiz(moveFocus = false) {
    clearTimeout(finalRevealTimer);
    const newScreen = screen !== 'quiz';
    if (newScreen) {
      screen = 'quiz';
      app.innerHTML = `<div class="quiz">
        <div class="art-orbit quiz-art" id="quiz-art" aria-hidden="true"></div>
        <div class="quiz-stage">
          <div class="progress-label"><p class="kicker" id="chapter-label"></p><strong id="progress-label"></strong></div>
          <div class="segments" role="progressbar" aria-label="已完成题数" aria-valuemin="0" aria-valuemax="64" id="segments">${'<div class="segment"><span></span></div>'.repeat(8)}</div>
          <div id="question-pane"></div>
        </div>
      </div>`;
      Sigil.mount(document.getElementById('quiz-art'));
    }
    const index = state.reveal === null ? state.cursor : state.reveal * 8;
    const chapterIndex = Math.min(7, Math.floor(index / 8));
    const chapter = QUIZ.chapters[chapterIndex];
    headerStatus.textContent = `第${ACT_NUMBERS[chapterIndex]}幕 · ${chapter.name}`;
    document.getElementById('chapter-label').textContent = chapter.name;
    document.getElementById('progress-label').textContent = `${String(state.answers.length).padStart(2, '0')} / 64`;
    const segments = document.getElementById('segments');
    segments.setAttribute('aria-valuenow', state.answers.length);
    Array.from(segments.children).forEach((bar, idx) => {
      bar.firstElementChild.style.width = `${Math.min(8, Math.max(0, state.answers.length - idx * 8)) * 12.5}%`;
    });
    Sigil.update(state.answers.length);
    const pane = document.getElementById('question-pane');
    if (state.reveal !== null) {
      pane.innerHTML = `<div class="reveal">
        <p class="kicker eyebrow-line">第${ACT_NUMBERS[chapterIndex]}幕 · 阶段精神显影</p>
        <h2 tabindex="-1">${escapeHtml(chapter.name)}</h2>
        <p>${escapeHtml(chapter.reveal)}</p>
        ${chapterIndex === 7 ? '' : `<p class="next-chapter">下一幕 · ${escapeHtml(QUIZ.chapters[chapterIndex + 1].name)}</p>`}
        <div class="action-row"><button type="button" class="btn primary" data-action="advance">${chapterIndex === 7 ? '开始 64 重演算' : '进入下一幕'} <span aria-hidden="true">→</span></button>
        <button type="button" class="text-btn" data-action="back">返回上一题</button></div>
      </div>`;
      if (chapterIndex === 7) finalRevealTimer = setTimeout(startCompute, 2600);
    } else {
      const question = questions[state.cursor];
      const previous = state.answers[state.cursor];
      pane.innerHTML = `<p class="question-index">第 ${state.cursor + 1} 题</p>
        <h2 class="question" id="question" tabindex="-1">${escapeHtml(question.prompt)}</h2>
        <div class="options" role="group" aria-labelledby="question">${question.options.map((option, i) => `<button type="button" class="choice${previous === i ? ' chosen' : ''}" ${previous === i ? 'aria-pressed="true"' : 'aria-pressed="false"'} data-action="answer" data-index="${i}" data-question="${state.cursor}"><span aria-hidden="true">${'ABCD'[i]}</span><span>${escapeHtml(option.text)}</span></button>`).join('')}</div>
        <div class="quiz-meta">
          <button type="button" class="text-btn" data-action="back">${state.cursor > 0 ? '上一题' : '返回序言'}</button>
          <span class="hint">${saveFailed ? '本机存储不可用' : '进度自动保存'}</span>
        </div>`;
    }
    if (newScreen || (moveFocus && matchMedia('(max-width: 700px)').matches)) goTop();
    if (moveFocus) focusHeading();
  }

  function choose(option, question) {
    if (screen !== 'quiz' || state.reveal !== null || question !== state.cursor || performance.now() < readyForNextAnswer) return;
    if (!Number.isInteger(option) || option < 0 || option > 3) return;
    const chosen = app.querySelector(`[data-question="${question}"][data-index="${option}"]`);
    if (chosen) chosen.classList.add('chosen');
    const wasFrontier = state.cursor >= state.answers.length - 1;
    state.answers[state.cursor] = option;
    state.cursor++;
    if (wasFrontier && state.cursor % 8 === 0) state.reveal = state.cursor / 8 - 1;
    state.scores = scoresFor(state.answers);
    saveProgress();
    clearTimeout(transitionTimer);
    readyForNextAnswer = performance.now() + 185;
    transitionTimer = setTimeout(() => renderQuiz(true), 125);
  }

  function startCompute() {
    if (screen === 'compute') return;
    clearTimeout(finalRevealTimer);
    state.stage = 'compute';
    state.reveal = null;
    saveProgress();
    screen = 'compute';
    headerStatus.textContent = '64 重演算';
    goTop();
    app.innerHTML = `<section class="compute">${Sigil.collapse()}<h1 tabindex="-1">64 重演算</h1><p id="compute-line" role="status">正在收束 64 重思想切片……</p></section>`;
    focusHeading();
    clearTimeout(computeTimer);
    setTimeout(() => {
      const line = document.getElementById('compute-line');
      if (line) line.textContent = '正在剥离你的社会面具……';
    }, 1950);
    computeTimer = setTimeout(() => {
      state.stage = 'result';
      saveProgress();
      showResult(true);
    }, 4000);
  }

  function resultForState() {
    const ranked = factions.map((faction, index) => ({faction, index, score: state.scores[faction.id]}));
    ranked.sort((a, b) => b.score - a.score || a.index - b.index);
    const winner = ranked[0];
    let hash = 2166136261;
    const signature = `${state.seed}:${state.answers.join('')}`;
    for (const character of signature) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    const code = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return {
      ...winner.faction, factionId: winner.faction.id, variant: winner.index,
      id: `64-${code.slice(0, 4)}-${code.slice(4)}`, profileId: `${state.seed}-${code}`
    };
  }

  function showResult(moveFocus) {
    screen = 'result';
    latestResult = resultForState();
    const {name, id, quote, profile, variant} = latestResult;
    headerStatus.textContent = '公开侧写';
    app.innerHTML = `<section class="result">
      <article class="result-card">
        <div>
          <p class="kicker">精神档案 · ${escapeHtml(id)}</p>
          <h1 tabindex="-1">${escapeHtml(name)}</h1>
          <blockquote>「${escapeHtml(quote)}」</blockquote>
          <p class="profile">${escapeHtml(profile)}</p>
        </div>
        <div class="art-orbit result-art" aria-hidden="true">${Sigil.badge(64, variant)}</div>
      </article>
      <div class="action-row result-actions">
        <button type="button" class="btn" data-action="poster">生成分享海报</button>
        ${location.protocol === 'https:' ? '<button type="button" class="btn" data-action="share">复制实验入口</button>' : ''}
      </div>
      <div id="premium-area"></div>
      <div class="result-footer"><button type="button" class="text-btn" data-action="restart">重新开始实验</button></div>
    </section>`;
    grant = null;
    paymentStatus = '';
    renderPremium();
    goTop();
    if (moveFocus) focusHeading();
    restoreWhenReady();
  }

  function renderPremium(shatter = false) {
    const frame = document.getElementById('premium-area');
    if (!frame) return;
    const opened = Boolean(grant);
    const archive = opened && grant.plan === 'archive';
    frame.innerHTML = `<section class="premium${opened ? '' : ' locked'}" aria-labelledby="premium-title">
      <div class="premium-head"><div><p class="kicker">${opened ? '火漆已揭' : '火漆封存'}</p><h2 id="premium-title" tabindex="-1">${archive ? '完整 64 象档案' : '深度精神档案'}</h2></div>
        ${!opened || shatter ? `<div class="seal${shatter ? ' is-shattered' : ''}" aria-hidden="true">${Sigil.wax()}</div>` : ''}</div>
      <div class="modules">${modules.map((title, i) => `<article class="module"><h3>${title}</h3>${opened ? `<p>${escapeHtml(grant.content.modules[i])}</p>` : `<p class="locked-noise" aria-hidden="true">${['ϟ▰··· ░ ▧ ▥ ▦ ░ ∴···▓▒∵··· ▱ ▰ ··· ░▧ ▧ ▥ ▦', '▓·· ∵··· ▱ ▰ ░▧ ∴··· ▧ ▥ ▦ ░ ▦ ░ ∴···▓▒', '∵· ░▧ ▧ ▥ ▦ ░ ∴···▓▒∵··· ▱ ▰ ···ϟ▰··· ░'][i]}</p>`}</article>`).join('')}</div>
      ${archive ? renderArchive() : `<div class="unlock-row"><button type="button" class="btn primary" data-action="checkout">${opened ? '升级完整 64 象档案' : '揭开火漆封印'}</button><span class="hint">${opened ? '升级规则以爱发电页面为准' : '¥9.99 / 月起 · 会员有效期内解锁'}</span></div>`}
      ${archive || pay.previewEnabled ? '' : '<button type="button" class="text-btn" data-action="restore">核对已有订单</button>'}
      <p class="hint" id="result-status" role="status">${escapeHtml(paymentStatus)}</p>
    </section>`;
    if (shatter) {
      const seal = frame.querySelector('.is-shattered');
      if (seal) setTimeout(() => seal.remove(), 1200);
    }
  }

  function renderArchive() {
    const acts = QUIZ.chapters.map((chapter, c) => `<details><summary>第${ACT_NUMBERS[c]}幕 · ${escapeHtml(chapter.name)}</summary><ol start="${c * 8 + 1}">${chapter.questions.map((question, q) => {
      const index = c * 8 + q;
      const answer = question.options[state.answers[index]].text;
      return `<li><strong>${escapeHtml(answer)}</strong><p>${escapeHtml(grant.content.slices[index])}</p></li>`;
    }).join('')}</ol></details>`).join('');
    return `<section class="archive"><h3>64 重抉择回望</h3>${acts}</section>
      <section class="archive"><h3>高清炼金壁纸包</h3><p class="hint">8 张 · 1080 × 1920 · 选择一张预览并保存</p>
      <div class="wall-list">${QUIZ.chapters.map((chapter, i) => `<button type="button" class="btn" data-action="wallpaper" data-index="${i}" aria-label="${escapeHtml(chapter.name)}壁纸">${escapeHtml(chapter.name)}</button>`).join('')}</div></section>`;
  }

  function context() {
    return {factionId: latestResult.factionId, profileId: latestResult.profileId};
  }

  function sayPayment(message) {
    paymentStatus = String(message || '');
    const sheetStatus = sheet.querySelector('#payment-status');
    if (sheetStatus) sheetStatus.textContent = paymentStatus;
    const resultStatus = document.getElementById('result-status');
    if (resultStatus) resultStatus.textContent = paymentStatus;
  }

  function validContent(result) {
    const content = result && result.content;
    const hasText = (value) => typeof value === 'string' && value.trim() !== '';
    return content && ['decode', 'archive'].includes(result.plan) && Array.isArray(content.modules)
      && content.modules.length === 3 && content.modules.every(hasText)
      && (result.plan === 'decode' || (Array.isArray(content.slices) && content.slices.length === 64 && content.slices.every(hasText)));
  }

  function applyGrant(result, animate) {
    if (!validContent(result)) {
      sayPayment('档案载入失败，请核对已有订单。');
      return;
    }
    if (grant && (grant.plan === 'archive' || grant.plan === result.plan)) return;
    const firstUnlock = !grant;
    grant = result;
    if (dialogKind === 'checkout') closeDialog(false);
    sayPayment('');
    renderPremium(animate && firstUnlock);
    announcer.textContent = '精神档案已解锁';
    if (animate) document.getElementById('premium-title').focus({preventScroll: true});
  }

  async function restoreWhenReady(voluntary = false) {
    if (screen !== 'result' || !latestResult || busy || restoreTask || (grant && grant.plan === 'archive')) return;
    const active = latestResult.profileId;
    if (voluntary === true) sayPayment('正在核对订单……');
    restoreTask = Promise.resolve().then(() => pay.restore(context()));
    try {
      const result = await restoreTask;
      if (screen !== 'result' || latestResult.profileId !== active) return;
      if (result && result.state === 'unlocked') applyGrant(result, voluntary === true || result.fulfilledNow === true);
      else if (voluntary === true) sayPayment(result && result.message || '当前档案暂无已确认的订单。');
    } catch {
      if (voluntary === true) sayPayment('暂时无法核对订单，请稍后重试。');
    } finally {
      restoreTask = null;
    }
  }

  function openDialog(kind, title, content) {
    if (overlay.hidden) dialogTrigger = document.activeElement;
    dialogKind = kind;
    dialogSerial++;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    sheet.innerHTML = `<button type="button" class="close" data-action="close" aria-label="关闭">×</button><h2 id="dialog-title">${escapeHtml(title)}</h2>${content}`;
    sheet.scrollTop = 0;
    sheet.focus({preventScroll: true});
    return dialogSerial;
  }

  function closeDialog(restoreFocus = true) {
    if (overlay.hidden) return;
    overlay.hidden = true;
    dialogKind = '';
    dialogSerial++;
    document.body.style.overflow = '';
    sheet.replaceChildren();
    if (restoreFocus && dialogTrigger && dialogTrigger.isConnected) dialogTrigger.focus({preventScroll: true});
    dialogTrigger = null;
  }

  function openCheckout() {
    openDialog('checkout', '选择会员档位', `
      <p class="hint">在爱发电完成赞助。会员有效期内享有对应权益，具体规则以爱发电页面为准。</p>
      <div class="plan-list">
        <div class="plan"><strong>精神解码</strong><b class="price">¥9.99 / 月</b><small>解锁互动测试的深度内容</small></div>
        <div class="plan"><strong>完整档案</strong><b class="price">¥19.99 / 月</b><small>包含基础权益与高级版功能</small></div>
      </div>
      <a class="btn primary checkout-action" href="https://ifdian.net/a/lomoxyz" target="_blank" rel="noopener noreferrer">前往爱发电选择档位</a>
      <p class="hint">付款后自动核验功能正在接入，当前页面暂不能确认付款或解锁报告。</p>
      ${pay.previewEnabled ? '<details class="preview-tools"><summary>本地预览工具</summary><button type="button" class="text-btn" data-action="simulate" data-plan="decode">模拟基础会员</button>　<button type="button" class="text-btn" data-action="simulate" data-plan="archive">模拟高级会员</button></details>' : ''}`);
  }

  async function executePayment(simulate) {
    if (!simulate || busy || !latestResult || dialogKind !== 'checkout') return;
    busy = true;
    try {
      const result = await pay.simulate({...context(), plan: selectedPlan});
      if (result && result.state === 'unlocked') applyGrant(result, true);
      else sayPayment(result && result.message || '本地预览暂不可用。');
    } catch {
      sayPayment('本地预览暂不可用。');
    } finally {
      busy = false;
    }
  }

  async function openMedia(wallIndex) {
    const wall = Number.isInteger(wallIndex);
    if (!latestResult || (wall && (!grant || grant.plan !== 'archive' || wallIndex < 0 || wallIndex > 7))) return;
    const result = {...latestResult, entryLabel: location.protocol === 'https:' ? location.host + (location.pathname === '/' ? '' : location.pathname) : ''};
    const title = wall ? `${QUIZ.chapters[wallIndex].name} · 高清壁纸` : '分享精神侧写';
    const serial = openDialog('media', title, '<p class="hint" role="status">图像生成中……</p>');
    try {
      const imageUrl = await (wall ? Sigil.wallpaper(result, wallIndex) : Sigil.poster(result));
      if (serial !== dialogSerial) return;
      const hint = sheet.querySelector('.hint');
      hint.textContent = '在微信中可长按图片保存。';
      const image = document.createElement('img');
      image.className = 'media';
      image.alt = wall ? title : `${result.name} · ${result.id} · ${result.quote}`;
      image.src = imageUrl;
      const download = document.createElement('a');
      download.className = 'btn standalone';
      download.href = imageUrl;
      download.download = `${result.id}-${wall ? `wallpaper-${wallIndex + 1}` : 'poster'}.png`;
      download.textContent = '下载 PNG';
      sheet.append(image, download);
    } catch {
      if (serial === dialogSerial) sheet.querySelector('.hint').textContent = '图像生成失败，请关闭后重试。';
    }
  }

  async function shareEntry() {
    const url = new URL(location.href);
    url.search = '?from=poster';
    url.hash = '';
    try {
      await navigator.clipboard.writeText(url.href);
      sayPayment('实验入口已复制。');
    } catch {
      openDialog('link', '实验入口', `<p class="hint">长按此链接复制。</p><p><a href="${escapeHtml(url.href)}">${escapeHtml(url.href)}</a></p>`);
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target === overlay) closeDialog();
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled || (!overlay.hidden && !sheet.contains(control))) return;
    switch (control.dataset.action) {
      case 'start':
        state.started = true;
        saveProgress();
        renderQuiz(true);
        break;
      case 'answer':
        choose(Number(control.dataset.index), Number(control.dataset.question));
        break;
      case 'back':
        clearTimeout(transitionTimer);
        if (state.cursor === 0) {
          state.started = state.answers.length > 0;
          saveProgress();
          renderIntro();
          focusHeading();
        } else {
          state.reveal = null;
          state.cursor--;
          saveProgress();
          renderQuiz(true);
        }
        break;
      case 'advance':
        if (state.cursor === 64) startCompute();
        else {
          state.reveal = null;
          saveProgress();
          renderQuiz(true);
        }
        break;
      case 'poster': openMedia(); break;
      case 'wallpaper': openMedia(Number(control.dataset.index)); break;
      case 'share': shareEntry(); break;
      case 'checkout': openCheckout(); break;
      case 'restore': restoreWhenReady(true); break;
      case 'simulate': selectedPlan = control.dataset.plan; executePayment(true); break;
      case 'close': closeDialog(); break;
      case 'restart':
        if (busy) sayPayment('请等待订单核对结束。');
        else openDialog('restart', '重新开始这次实验？', '<p class="hint">重新开始会清除本机的当前作答和侧写。请先保存你想留下的海报。</p><button type="button" class="btn primary" data-action="confirm-restart">清除作答并返回序言</button>');
        break;
      case 'confirm-restart':
        if (busy) break;
        closeDialog(false);
        latestResult = null;
        grant = null;
        state = newSession();
        saveProgress();
        renderIntro();
        goTop();
        focusHeading();
        break;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') closeDialog();
    if (event.key !== 'Tab') return;
    const focusable = Array.from(sheet.querySelectorAll('button:not(:disabled), a[href], summary')).filter((element) => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
      event.preventDefault();
      if (last) last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      if (first) first.focus();
    }
  });

  if (state.stage === 'result') showResult(false);
  else if (state.stage === 'compute') startCompute();
  else if (state.started) renderQuiz();
  else renderIntro();
})();
