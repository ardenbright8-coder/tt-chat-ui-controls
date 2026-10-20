const seen=[];
for(let k=0;k<8;k++){
  await new Promise(r=>setTimeout(r,2500));
  const p=[...document.querySelectorAll('dialog[open], .popup')].filter(p=>p.offsetParent||p.open).at(-1);
  if(!p) continue;
  seen.push(p.innerText.slice(0,120).replace(/\n/g,' '));
  const ok=[...p.querySelectorAll('.popup-button-ok, .menu_button, button')].find(b=>/确定|确认|是|允许|OK|Yes/i.test(b.innerText.trim()) && b.offsetParent);
  ok?.click();
}
const c=SillyTavern.getContext();
return JSON.stringify({seen, chat:c.chat.length, name:c.name2});
