let DATA;
const STORAGE_KEY='dsasprint2026_checks';
const load=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||{}}catch{return{}}};
const save=c=>{
  localStorage.setItem(STORAGE_KEY,JSON.stringify(c));
  fetch('/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
    }).catch(err=>console.warn('sync failed', err));
};
function paint(){
  const c=load();
  document.querySelectorAll('.row').forEach(r=>{if(c[r.dataset.id])r.classList.add('ck');});
  refresh();
}
async function syncFromServer(){
  try{
  const res=await fetch('/progress');
  if(!res.ok) return;
  const server=await res.json();
  const merged={...load(),...server};
  save(merged);
  paint();
  }catch{}
}
async function boot(){
  try{
    const [res,layout]=await Promise.all([fetch('/data.json'),loadLayout()]);
    if(!res.ok) throw new Error('data.json: '+res.status);
    DATA=await res.json();
    LAYOUT=layout; applyLayout();
    buildChapters();
    buildHeroRing();
    paint();
    syncFromServer();
  }catch(e){
    console.error('boot failed:',e);
    chWrap.innerHTML=`
      <div style="max-width:520px;margin:64px auto;padding:32px 28px;text-align:center;
                  background:var(--card);border:1px solid var(--hair2);border-radius:14px">
        <div style="font-family:var(--serif);font-size:22px;color:var(--verm);margin-bottom:10px">
          Couldn't load the roadmap
        </div>
        <div style="font-family:var(--mono);font-size:13px;line-height:1.7;color:var(--faint)">
          The server didn't return the roadmap data.<br>
          Check that it's running, then reload the page.
        </div>
      </div>`;
  }
}

const tierOf=p=>p.tier==='done'?'core':p.tier;
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

/* ── reorder edit mode: layout overlay + persistence ── */
let LAYOUT={};
const TIERS=['core','stretch','bonus'];
const HANDLE='<span class="drag-handle" aria-hidden="true"><span class="dotgrid"><i></i><i></i><i></i><i></i><i></i><i></i></span></span>';
async function loadLayout(){ try{const r=await fetch('/layout');if(r.ok)return await r.json();}catch{} return {}; }
function saveLayout(){ fetch('/layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(LAYOUT)}).catch(err=>console.warn('layout sync failed',err)); }
/* reorder + retier each saved topic in DATA; problems missing from a saved order keep their place at the end */
function applyLayout(){
  DATA.sprints.forEach(sp=>sp.topics.forEach(t=>{
    const saved=LAYOUT[sp.id+'-'+slug(t[0])]; if(!saved||!saved.length)return;
    const byId=new Map(t[1].map(p=>[p.id,p])), ordered=[];
    saved.forEach(({id,tier})=>{const p=byId.get(id);if(p){if(tier)p.tier=tier;ordered.push(p);byId.delete(id);}});
    t[1].forEach(p=>{if(byId.has(p.id))ordered.push(p);});
    t[1]=ordered;
  }));
}

/* build chapters + topic index */
const chWrap=document.getElementById('chapters'), idx=document.getElementById('idx');
const ROMAN=['I','II','III','IV','V','VI','✦'];
function buildChapters(){
DATA.sprints.forEach((sp,si)=>{
  const d=document.createElement('details');
  d.className='chapter'; d.id='sec-'+sp.id; d.open = sp.load!=='bonus';
  d.style.animationDelay=(0.28+si*0.05)+'s';
  let body='';
  sp.topics.forEach(([tname,probs])=>{
    const tid=sp.id+'-'+slug(tname);
    body+=`<div class="tp" id="tp-${tid}"><span class="tp-name">${esc(tname)}</span><span class="tp-line"></span><span class="tp-mini" data-tpmini="${tid}">0/0</span></div>`;
    [['core','Core',null],['stretch','Stretch','— if ahead'],['bonus',null,null]].forEach(([tier,label,note])=>{
      const items=probs.filter(p=>tierOf(p)===tier);
      if(!items.length)return;
      if(label) body+=`<div class="tierlab ${tier}">${label}${note?`<span class="tl-note">${note}</span>`:''}</div>`;
      items.forEach(p=>{
        const badges=[`<span class="bdg b-${p.src}">${p.src}</span>`];
        if(p.fire)badges.push('<span class="bdg b-fire">🔥</span>');
        if(p.lock)badges.push('<span class="bdg b-lock">🔒</span>');
        const links=p.links.map(([t,u])=>`<a class="lk lk-${t}" href="${u}" target="_blank" rel="noopener">${t}</a>`).join('');
        body+=`<div class="row ${tier}" data-id="${p.id}" data-tier="${tier}" data-tp="${tid}" data-q="${esc((p.title+' '+tname).toLowerCase())}">
          ${HANDLE}
          <div class="cir"></div>
          <div class="pmain"><span class="pname">${esc(p.title)}</span>${p.note?`<span class="hint-mark"><span>✦</span></span>`:''}<span class="pbadges">${badges.join('')}</span>${p.note?`<div class="hint-note">${esc(p.note)}</div>`:''}</div>
          <div class="plinks">${links}</div></div>`;
      });
    });
    /* topic index card */
    idx.insertAdjacentHTML('beforeend',
     `<a class="tcard" href="#tp-${tid}">
        <span class="tring" data-tring="${tid}"><svg width="42" height="42" viewBox="0 0 42 42">
          <circle class="tr-track" cx="21" cy="21" r="17"/>
          <circle class="tr-arc" data-trarc="${tid}" cx="21" cy="21" r="17" stroke-dasharray="106.8" stroke-dashoffset="106.8"/>
        </svg><span class="tr-pct" data-trpct="${tid}">0%</span></span>
        <span><span class="tc-name">${esc(tname)}</span><br><span class="tc-count" data-trcount="${tid}">0 / 0</span></span>
      </a>`);
  });
  d.innerHTML=`<summary class="ch-head">
    <span class="ch-num">${ROMAN[si]||si+1}</span>
    <div class="ch-mid">
      <div class="ch-title">${esc(sp.title)}</div>
      <div class="ch-sub"><span>${sp.week} · ${sp.dates}</span>${si===0?'<span class="now">● active</span>':''}<span class="load-${sp.load}">${sp.load==='bonus'?'optional':sp.load+' load'}</span></div>
    </div>
    <span class="ch-ring"><svg width="54" height="54" viewBox="0 0 54 54">
      <circle class="chr-track" cx="27" cy="27" r="22"/>
      <circle class="chr-arc" id="chr-${sp.id}" cx="27" cy="27" r="22" stroke-dasharray="138.2" stroke-dashoffset="138.2"/>
    </svg><span class="chr-txt" id="chrtxt-${sp.id}">0%</span></span>
    <span class="ch-chev">▾</span>
  </summary><div class="ch-body">${body}</div>`;
  chWrap.appendChild(d);
});
}

/* toggling */
function toggle(id){
  const c=load(); const was=!!c[id];
  if(was)delete c[id]; else c[id]=true; save(c);
  document.querySelectorAll(`.row[data-id="${id}"]`).forEach(r=>r.classList.toggle('ck',!was));
  refresh();
}
chWrap.addEventListener('click',e=>{
  const r=e.target.closest('.row');
  if(!r||e.target.closest('a')||e.target.closest('.drag-handle'))return;
  const m=e.target.closest('.hint-mark');
  if(m){ m.classList.toggle('on'); r.querySelector('.hint-note').classList.toggle('on'); return; }
  toggle(r.dataset.id);
});

/* ── drag-to-reorder (native DnD + FLIP), scoped within a topic ── */
let dragged=null, lastAfter;
function rowAfter(tp,y){
  let closest=null, co=-Infinity;
  for(const row of chWrap.querySelectorAll(`.row[data-tp="${tp}"]:not(.dragging):not(.hidden)`)){
    const b=row.getBoundingClientRect(), off=y-b.top-b.height/2;
    if(off<0 && off>co){ co=off; closest=row; }
  }
  return closest;
}
function flip(reorder){
  const tp=dragged.dataset.tp, rows=[...chWrap.querySelectorAll(`.row[data-tp="${tp}"]`)];
  const tops=rows.map(r=>r.getBoundingClientRect().top);
  reorder();
  rows.forEach((r,i)=>{ if(r===dragged)return; const dy=tops[i]-r.getBoundingClientRect().top;
    if(dy) r.animate([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'}); });
}
function reclassRow(r){
  let n=r.previousElementSibling, found=null;
  while(n){ if(n.classList.contains('tierlab')){ found=TIERS.find(t=>n.classList.contains(t)); break; } n=n.previousElementSibling; }
  const tier=found||r.dataset.tier||'core';
  TIERS.forEach(t=>r.classList.toggle(t, t===tier)); r.dataset.tier=tier;
}
chWrap.addEventListener('mousedown',e=>{
  const h=e.target.closest('.drag-handle'); if(h) h.closest('.row').setAttribute('draggable','true');
});
chWrap.addEventListener('mouseup',e=>{
  if(dragged)return; const r=e.target.closest('.row[draggable="true"]'); if(r) r.removeAttribute('draggable');
});
chWrap.addEventListener('dragstart',e=>{
  const r=e.target.closest('.row'); if(!r)return;
  dragged=r; lastAfter=undefined; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain','');
  requestAnimationFrame(()=>r.classList.add('dragging'));   // defer so the drag-image stays solid
});
chWrap.addEventListener('dragover',e=>{
  if(!dragged)return; e.preventDefault();
  const tp=dragged.dataset.tp, after=rowAfter(tp,e.clientY);
  if(after===lastAfter)return; lastAfter=after;
  flip(()=>{
    if(after) after.parentNode.insertBefore(dragged,after);
    else { const rows=chWrap.querySelectorAll(`.row[data-tp="${tp}"]:not(.dragging):not(.hidden)`); if(rows.length) rows[rows.length-1].after(dragged); }
  });
  reclassRow(dragged);
});
chWrap.addEventListener('dragend',()=>{
  if(!dragged)return; const r=dragged;
  r.classList.remove('dragging'); r.removeAttribute('draggable'); reclassRow(r);
  r.animate([{transform:'scale(1.012)'},{transform:'none'}],{duration:200,easing:'ease-out'});   // settle
  persistTopic(r.dataset.tp); dragged=null; lastAfter=undefined;
});
function topicTierMap(tp){
  const m=new Map();
  for(const sp of DATA.sprints) for(const t of sp.topics) if(sp.id+'-'+slug(t[0])===tp) t[1].forEach(p=>m.set(p.id,tierOf(p)));
  return m;
}
function syncDataTopic(tp,order){
  for(const sp of DATA.sprints) for(const t of sp.topics){
    if(sp.id+'-'+slug(t[0])!==tp) continue;
    const byId=new Map(t[1].map(p=>[p.id,p])), arr=[];
    order.forEach(({id,tier})=>{const p=byId.get(id);if(p){p.tier=tier;arr.push(p);byId.delete(id);}});
    t[1].forEach(p=>{if(byId.has(p.id))arr.push(p);}); t[1]=arr; return;
  }
}
function persistTopic(tp){
  const order=[...chWrap.querySelectorAll(`.row[data-tp="${tp}"]`)].map(r=>({id:r.dataset.id,tier:r.dataset.tier}));
  const prev=topicTierMap(tp), tierChanged=order.some(o=>prev.get(o.id)!==o.tier);
  LAYOUT[tp]=order; syncDataTopic(tp,order); saveLayout();
  if(tierChanged) buildHeroRing();
  refresh();
}

/* segmented hero ring — one circle, three proportional arcs */
const RING={R:74,CX:86,CY:86,GAP:10,COLORS:['var(--verm)','var(--amber)','var(--web)']};
let ringFills=[];
function buildRing(totals){
  const C=2*Math.PI*RING.R, T=totals.reduce((a,b)=>a+b,0), g=document.getElementById('ringSegs');
  g.replaceChildren();
  let angle=0; ringFills=[];
  totals.forEach((n,i)=>{
    const segDeg=360*n/T, arcLen=C*(segDeg-RING.GAP)/360;
    const mk=cls=>{
      const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx',RING.CX);c.setAttribute('cy',RING.CY);c.setAttribute('r',RING.R);
      c.setAttribute('class','ringseg '+cls);c.setAttribute('stroke',RING.COLORS[i]);
      c.setAttribute('transform',`rotate(${angle-90} ${RING.CX} ${RING.CY})`);
      g.appendChild(c);return c;};
    const tr=mk('track'); tr.setAttribute('stroke-dasharray',`${arcLen} ${C-arcLen}`);
    const fl=mk('fill');  fl.setAttribute('stroke-dasharray',`0 ${C}`); fl.style.display='none';
    ringFills.push({el:fl,arcLen,C});
    angle+=segDeg;
  });
}
function updateRing(pairs){
  pairs.forEach(([d,t],i)=>{
    const f=ringFills[i]; if(!f)return;
    const p=t?d/t:0, len=f.arcLen*p;
    if(p<=0){f.el.style.display='none';return;}
    f.el.style.display='';
    f.el.setAttribute('stroke-dasharray',`${len} ${f.C-len}`);
  });
}
function buildHeroRing(){
  let ct=0,st=0,bt=0;
  DATA.sprints.forEach(sp=>sp.topics.forEach(([_,probs])=>probs.forEach(p=>{
    const t=tierOf(p); if(t==='core')ct++; else if(t==='stretch')st++; else bt++;
  })));
  buildRing([ct,st,bt]);
}

/* progress */
function refresh(){
  const c=load(); let cd=0,ct=0,sd=0,st=0,bd=0,bt=0; let next=null;
  const tp={};
  DATA.sprints.forEach(sp=>{
    let d=0,t=0;
    sp.topics.forEach(([tname,probs])=>{
      const tid=sp.id+'-'+slug(tname);
      tp[tid]=tp[tid]||{d:0,t:0,cd:0,ctt:0};
      probs.forEach(p=>{
        const tier=tierOf(p),done=!!c[p.id]; t++; tp[tid].t++;
        if(done){d++;tp[tid].d++;}
        if(tier==='core'){tp[tid].ctt++;if(done)tp[tid].cd++;}
        if(tier==='core'){ct++;if(done)cd++;else if(!next)next=p.title;}
        else if(tier==='stretch'){st++;if(done)sd++;}
        else{bt++;if(done)bd++;}
      });
    });
    const arc=document.getElementById('chr-'+sp.id),txt=document.getElementById('chrtxt-'+sp.id);
    if(arc){arc.style.strokeDashoffset=138.2*(1-(t?d/t:0));}
    if(txt){txt.textContent=Math.round(t?100*d/t:0)+'%';}
  });
  for(const [tid,o] of Object.entries(tp)){
    const {d,t,cd:tcd,ctt}=o;
    /* state color: amber → <20% · vermillion → >20% · green → core clear · purple → everything clear */
    let col='var(--amber)';
    if(t>0&&d===t)col='var(--web)';
    else if(ctt>0&&tcd===ctt)col='var(--green)';
    else if(t>0&&d/t>0.2)col='var(--verm)';
    const arc=document.querySelector(`[data-trarc="${tid}"]`);
    if(arc){arc.style.strokeDashoffset=106.8*(1-(t?d/t:0));arc.style.stroke=col;}
    const pct=document.querySelector(`[data-trpct="${tid}"]`); if(pct)pct.textContent=Math.round(t?100*d/t:0)+'%';
    const cnt=document.querySelector(`[data-trcount="${tid}"]`); if(cnt)cnt.textContent=d+' / '+t;
    const mini=document.querySelector(`[data-tpmini="${tid}"]`); if(mini)mini.textContent=d+'/'+t;
  }
  document.getElementById('brNum').textContent=cd+sd+bd;
  document.getElementById('brDen').textContent='of '+(ct+st+bt)+' solved';
  updateRing([[cd,ct],[sd,st],[bd,bt]]);
  document.getElementById('mCore').textContent=cd+' / '+ct;
  document.getElementById('fCore').style.width=(ct?100*cd/ct:0)+'%';
  document.getElementById('mStr').textContent=sd+' / '+st;
  document.getElementById('fStr').style.width=(st?100*sd/st:0)+'%';
  document.getElementById('mBon').textContent=bd+' / '+bt;
  document.getElementById('fBon').style.width=(bt?100*bd/bt:0)+'%';
  document.getElementById('nextUp').textContent=next||'all Core clear ✦';
}
boot();

/* countdown stamp */
function tick(){
  const d=Math.ceil((new Date('2026-07-13')-new Date())/86400000);
  document.getElementById('tmStamp').textContent=d>0?`T–${d} DAYS TO OA WINDOW`:'OA WINDOW LIVE';
}
tick();setInterval(tick,60000);

/* dark mode */
const THEME_KEY='dsasprint2026_theme';
const modeBtn=document.getElementById('modeBtn');
function applyTheme(t,anim){
  if(anim){document.documentElement.classList.add('theme-anim');
    setTimeout(()=>document.documentElement.classList.remove('theme-anim'),400);}
  document.documentElement.dataset.theme=t;
  modeBtn.textContent=t==='dark'?'☀':'☾';
}
applyTheme(localStorage.getItem(THEME_KEY)||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),false);
modeBtn.addEventListener('click',()=>{
  const t=document.documentElement.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem(THEME_KEY,t);applyTheme(t,true);
});

/* filters */
let tier='all',status='all',q='';
function applyFilters(){
  document.querySelectorAll('.row').forEach(r=>{
    const okT=tier==='all'||r.dataset.tier===tier;
    const done=r.classList.contains('ck');
    const okS=status==='all'||(status==='done'?done:!done);
    const okQ=!q||r.dataset.q.includes(q);
    r.classList.toggle('hidden',!(okT&&okS&&okQ));
  });
  document.querySelectorAll('.ch-body').forEach(b=>{
    b.querySelectorAll('.tierlab').forEach(tt=>{
      let n=tt.nextElementSibling,any=false;
      while(n&&n.classList.contains('row')){if(!n.classList.contains('hidden'))any=true;n=n.nextElementSibling;}
      tt.classList.toggle('hidden',!any);
    });
    b.querySelectorAll('.tp').forEach(t1=>{
      let n=t1.nextElementSibling,any=false;
      while(n&&!n.classList.contains('tp')){if(n.classList.contains('row')&&!n.classList.contains('hidden'))any=true;n=n.nextElementSibling;}
      t1.classList.toggle('hidden',!any);
    });
  });
}
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.trim().toLowerCase();applyFilters();});
document.getElementById('tierChips').addEventListener('click',e=>{
  const b=e.target.closest('.chip');if(!b)return;
  document.querySelectorAll('#tierChips .chip').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');tier=b.dataset.tier;applyFilters();
  if(tier==='bonus')document.getElementById('sec-pb').open=true;
});
document.getElementById('statusChips').addEventListener('click',e=>{
  const b=e.target.closest('.chip');if(!b)return;
  document.querySelectorAll('#statusChips .chip').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');status=b.dataset.st;applyFilters();
});
let allOpen=true;
document.getElementById('toggleAll').addEventListener('click',e=>{
  allOpen=!allOpen;
  document.querySelectorAll('details.chapter').forEach(d=>d.open=allOpen);
  e.target.textContent=allOpen?'⊟ Collapse':'⊞ Expand';
});

/* ── view tabs (Problems / Theory) ── */
const VIEW_KEY='dsasprint2026_view';
function setView(v){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.view===v));
  document.getElementById('view-probs').classList.toggle('on',v==='probs');
  document.getElementById('view-theory').classList.toggle('on',v==='theory');
  document.querySelector('.toolbar').style.display = v==='probs' ? '' : 'none';
  localStorage.setItem(VIEW_KEY,v);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>setView(t.dataset.view)));
if(localStorage.getItem(VIEW_KEY)==='theory') setView('theory');

/* ── Markdown export (concise, for pasting to an AI) ── */
function buildMarkdown(){
  const c=load();
  let cd=0,ct=0,sd=0,st=0,bd=0,bt=0;
  DATA.sprints.forEach(sp=>sp.topics.forEach(([_,probs])=>probs.forEach(p=>{
    const tier=tierOf(p),done=!!c[p.id];
    if(tier==='core'){ct++;if(done)cd++;}
    else if(tier==='stretch'){st++;if(done)sd++;}
    else{bt++;if(done)bd++;}
  })));
  const today=new Date().toISOString().slice(0,10);
  const lines=[
    `DSA sprint progress (${today}) — Core ${cd}/${ct}, Stretch ${sd}/${st}, Bonus ${bd}/${bt}. Go primary, Python fallback. (* = stretch tier)`,''
  ];
  DATA.sprints.forEach(sp=>{
    lines.push(`${sp.week} ${sp.title}`);
    sp.topics.forEach(([tname,probs])=>{
      const done=[],left=[];
      let d=0;
      probs.forEach(p=>{
        const star=tierOf(p)==='stretch'?'*':'';
        if(c[p.id]){done.push(p.title+star);d++;}
        else left.push(p.title+star);
      });
      let s=`- ${tname} [${d}/${probs.length}]`;
      if(done.length)s+=` done: ${done.join(', ')}`;
      if(done.length&&left.length)s+=' |';
      if(left.length)s+=` left: ${left.join(', ')}`;
      lines.push(s);
    });
    lines.push('');
  });
  return lines.join('\n');
}
function flash(btn,txt){
  const old=btn.textContent;btn.textContent=txt;
  setTimeout(()=>btn.textContent=old,1400);
}
document.getElementById('copyMd').addEventListener('click',async e=>{
  const md=buildMarkdown();
  try{await navigator.clipboard.writeText(md);flash(e.target,'Copied ✓');}
  catch{ /* clipboard API blocked — fallback */
    const ta=document.createElement('textarea');ta.value=md;document.body.appendChild(ta);
    ta.select();document.execCommand('copy');ta.remove();flash(e.target,'Copied ✓');
  }
});
document.getElementById('exportMd').addEventListener('click',e=>{
  const blob=new Blob([buildMarkdown()],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='dsa-roadmap-'+new Date().toISOString().slice(0,10)+'.md';
  a.click();URL.revokeObjectURL(a.href);
  flash(e.target,'Saved ✓');
});
