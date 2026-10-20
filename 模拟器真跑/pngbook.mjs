import fs from 'node:fs';
const buf = fs.readFileSync(process.argv[2]);
let p = 8; const out = {};
while (p < buf.length) { const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
  if (type === 'tEXt') { const d = buf.subarray(p + 8, p + 8 + len); const z = d.indexOf(0); out[d.toString('latin1', 0, z)] = d.toString('latin1', z + 1); } p += 12 + len; }
const j = JSON.parse(Buffer.from(out.ccv3 || out.chara, 'base64').toString('utf8')); const d = j.data;
fs.writeFileSync(process.argv[3], JSON.stringify(j));
for (const e of d.character_book.entries) console.log(`${e.enabled === false ? '关' : '开'} ${e.constant ? '常驻' : '触发'} [${e.comment || e.name}] ${e.content.length}字 ｜ ${e.content.slice(0, 90).replace(/\n/g, ' ')}`);
console.log('world:', d.extensions.world, '| depth_prompt:', JSON.stringify(d.extensions.depth_prompt).slice(0, 200));
