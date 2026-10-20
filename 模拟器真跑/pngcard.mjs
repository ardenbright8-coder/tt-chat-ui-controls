import fs from 'node:fs';
const buf = fs.readFileSync(process.argv[2]);
let p = 8; const out = {};
while (p < buf.length) {
  const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
  if (type === 'tEXt') { const d = buf.subarray(p + 8, p + 8 + len); const z = d.indexOf(0); out[d.toString('latin1', 0, z)] = d.toString('latin1', z + 1); }
  p += 12 + len;
}
const raw = out.ccv3 || out.chara;
const j = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
const d = j.data || j;
const ext = d.extensions || {};
const scripts = JSON.stringify(ext.tavern_helper || ext.TavernHelper_scripts || '').slice(0, 1500);
console.log(JSON.stringify({ keys: Object.keys(out), name: d.name, spec: j.spec, desc: d.description?.length, first: d.first_mes?.slice(0, 200), book: d.character_book?.entries?.length, initvar: d.character_book?.entries?.filter((e) => /initvar/i.test(e.comment || e.name || '')).length, extKeys: Object.keys(ext), regex: (ext.regex_scripts || []).map((r) => r.scriptName).slice(0, 30) }, null, 1));
console.log('SCRIPTS', scripts);
