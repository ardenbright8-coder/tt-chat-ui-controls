// node impcard.mjs <png> <card.json>：导卡 + 把卡里世界书建出来并绑上
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const png = fs.readFileSync(process.argv[2]).toString('base64');
const j = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const d = j.data;
const pos = { before_char: 0, after_char: 1 };
const entries = {};
d.character_book.entries.forEach((e, i) => {
  const x = e.extensions || {};
  entries[i] = { uid: i, key: e.keys || [], keysecondary: e.secondary_keys || [], comment: e.comment || e.name || '', content: e.content, constant: !!e.constant, selective: !!e.selective,
    disable: e.enabled === false, order: e.insertion_order ?? 100, position: x.position ?? pos[e.position] ?? 0, depth: x.depth ?? 4, role: x.role ?? 0, probability: x.probability ?? 100, useProbability: true };
});
const name = d.extensions.world || d.name;
const code = `const c=SillyTavern.getContext(); const h=c.getRequestHeaders();
const w=await fetch('/api/worldinfo/edit',{method:'POST',headers:h,body:JSON.stringify({name:${JSON.stringify(name)},data:{entries:${JSON.stringify(entries)}}})});
const bin=Uint8Array.from(atob(${JSON.stringify(png)}),ch=>ch.charCodeAt(0));
const fd=new FormData(); fd.append('avatar',new File([bin],${JSON.stringify(d.name + '.png')},{type:'image/png'})); fd.append('file_type','png');
const h2={...h}; delete h2['Content-Type'];
const r=await fetch('/api/characters/import',{method:'POST',headers:h2,body:fd});
await c.getCharacters(); await c.updateWorldInfoList?.();
return 'wi '+w.status+' card '+r.status+' '+(await r.text()).slice(0,80);`;
fs.writeFileSync('_imp.js', code);
console.log(execFileSync('node', ['cdp.mjs', 'file', '_imp.js'], { maxBuffer: 1e8 }).toString());
