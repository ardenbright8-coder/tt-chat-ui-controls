const c=SillyTavern.getContext();
const before=c.chat.length;
const box=document.getElementById('send_textarea');
box.value=globalThis.__msg; box.dispatchEvent(new Event('input',{bubbles:true}));
document.getElementById('send_but').click();
const t0=Date.now();
const gen=()=>{const s=document.getElementById('mes_stop'); return s&&getComputedStyle(s).display!=='none';};
while(Date.now()-t0<240000){ await new Promise(r=>setTimeout(r,2000)); if(c.chat.length>before+1 && !gen() && !globalThis.Mvu?.isDuringExtraAnalysis?.()) break; }
await new Promise(r=>setTimeout(r,8000));
const id=c.chat.length-1, m=c.chat[id];
const st=x=>x?.variables?.[x.swipe_id||0]?.stat_data;
const pick=s=>s&&({日期:s.世界?.当前日期?.[0],时间:s.世界?.当前时间?.[0],地点:s.世界?.当前地点?.[0],修为:s.主角?.修为?.[0],堕落度:s.陆雪琪?.堕落度?.[0],交合人数:s.陆雪琪?.交合人数?.[0],背德之力:s.阴阳锁情镜?.背德之力充盈度?.[0]});
const el=document.querySelector(`#chat .mes[mesid="${id}"]`);
return JSON.stringify({id, secs:Math.round((Date.now()-t0)/1000), len:m.mes.length, hasUpd:/<UpdateVariable>/i.test(m.mes), tail:m.mes.slice(-700), prev:pick(st(c.chat[id-2])), now:pick(st(m)), card:el?.querySelector('.tt-mvu-card')?.innerText||'没有小框', iframe:el?.querySelectorAll('iframe').length, toasts:[...document.querySelectorAll('#toast-container .toast')].map(t=>t.innerText), log:JSON.parse(localStorage.getItem('tt-varlog')||'[]').slice(-8).map(x=>String(x).slice(0,260))},null,1);
