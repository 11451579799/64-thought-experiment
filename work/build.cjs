'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/^\uFEFF/, '');
const quiz = JSON.parse(read('narrative.json'));
const sample = JSON.parse(read('premium-preview.json'));
const ids = quiz.factions.map((faction) => faction.id);
const questions = quiz.chapters.flatMap((chapter) => chapter.questions);
const options = questions.flatMap((question) => question.options);
if (quiz.chapters.length !== 8 || quiz.chapters.some((chapter) => !chapter.reveal || chapter.questions.length !== 8) ||
    ids.length !== 8 || new Set(ids).size !== 8 || questions.length !== 64 || options.length !== 256 ||
    questions.some((question) => !question.prompt || question.options.length !== 4) ||
    new Set(questions.map((question) => question.prompt)).size !== 64 ||
    new Set(options.map((option) => option.text)).size !== 256 ||
    options.some((option) => {
      const entries = Object.entries(option.scores);
      return entries.length !== 2 || entries.some(([id, value]) => !ids.includes(id) || ![1, 3].includes(value)) ||
        entries.map(([, value]) => value).sort().join(',') !== '1,3';
    }) || ids.some((id) => [1, 3].some((weight) => options.filter((option) => option.scores[id] === weight).length !== 32)) ||
    sample.slices.length !== 64 || new Set(sample.slices).size !== 64 ||
    ids.some((id) => sample.modulesByFaction[id]?.length !== 3) ||
    /算命|占卜|充值/.test(JSON.stringify([quiz, sample]))) throw new Error('Quiz or preview structure is invalid.');

const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(JSON.stringify(sample), 'utf8'), cipher.final(), cipher.getAuthTag()]);
const preview = `// BEGIN LOCAL PREVIEW
// Demo data and its demo key ship together for offline testing. Production removes this entire block.
async function loadPreviewContent({factionId, plan}) {
  const toBytes = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', toBytes('${key.toString('base64')}'), 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({name:'AES-GCM', iv:toBytes('${iv.toString('base64')}')}, key, toBytes('${ciphertext.toString('base64')}'));
  const data = JSON.parse(new TextDecoder().decode(decrypted));
  return plan === 'archive' ? {modules:data.modulesByFaction[factionId], slices:data.slices} : {modules:data.modulesByFaction[factionId]};
}
// END LOCAL PREVIEW`;

const fragments = {
  '/*__STYLE__*/': `${read('app.css')}\n${read('visual.css')}`,
  '/*__VISUAL__*/': read('visual.js'),
  '/*__PAYMENT__*/': read('payment.js'),
  '/*__PREVIEW__*/': preview,
  '/*__QUIZ__*/': JSON.stringify(quiz, null, 2).replace(/</g, '\\u003c'),
  '/*__APP__*/': read('app.js')
};
let html = read('shell.html');
for (const [marker, value] of Object.entries(fragments)) html = html.replace(marker, () => value);
if (html.includes('/*__') || /算命|占卜|充值/.test(html)) throw new Error('Unexpected marker or public-facing terminology.');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script, {filename:'64-thought-experiment.html'});
const output = path.resolve(__dirname, '../outputs/64-thought-experiment.html');
fs.writeFileSync(output, html, 'utf8');
console.log(`Standalone source built (${Buffer.byteLength(html, 'utf8')} bytes).`);
