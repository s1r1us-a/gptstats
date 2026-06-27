/* ============================ STATE ============================ */
const STATE = {
  rawConvFiles: [],      // arrays of conversation objects
  assetMap: null,        // {file_id: name}
  conversations: [],     // parsed model
  stats: null,
  charts: [],
  currentSort: 'date',
  selectedConv: null,
  excludeVoice: false,
  demo: false,
};

/* private-use unicode markers used by ChatGPT export */
const PU = {start:'', sep:'', end:''};

/* ============================ FILE HANDLING ============================ */
const fileinput=document.getElementById('fileinput');
const dropzone=document.getElementById('dropzone');
const filelistEl=document.getElementById('filelist');
const analyzeBtn=document.getElementById('analyzeBtn');

dropzone.addEventListener('click',()=>fileinput.click());
fileinput.addEventListener('change',e=>handleFiles([...e.target.files]));
['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop',e=>handleFiles([...e.dataTransfer.files]));

function fileRow(name,size,badge,badgeClass,icon){
  const div=document.createElement('div');div.className='fileitem';
  div.innerHTML=`<div class="fic">${icon}</div>
    <div class="meta"><b>${escapeHtml(name)}</b><span>${size}</span></div>
    <span class="badge ${badgeClass}">${badge}</span>`;
  filelistEl.appendChild(div);
}

function fmtSize(b){return b>1048576?(b/1048576).toFixed(1)+' MB':(b/1024).toFixed(0)+' KB'}

async function handleFiles(files){
  if(STATE.demo){ STATE.demo=false; STATE.rawConvFiles=[]; STATE.assetMap=null; filelistEl.innerHTML=''; }
  for(const f of files){
    if(!f.name.toLowerCase().endsWith('.json')){
      fileRow(f.name,fmtSize(f.size),'kein JSON','err','⚠️');continue;
    }
    try{
      const text=await f.text();
      const data=JSON.parse(text);
      if(Array.isArray(data) && data.length && data[0] && data[0].mapping){
        STATE.rawConvFiles.push(data);
        fileRow(f.name,fmtSize(f.size)+` · ${data.length} Konversationen`,'Chats ✓','ok','💬');
      } else if(!Array.isArray(data) && typeof data==='object' && isAssetMap(data)){
        STATE.assetMap={...(STATE.assetMap||{}),...data};
        fileRow(f.name,fmtSize(f.size)+` · ${Object.keys(data).length} Assets`,'Assets ✓','assets','🖼️');
      } else {
        fileRow(f.name,fmtSize(f.size),'unbekannt','err','❓');
      }
    }catch(err){
      fileRow(f.name,fmtSize(f.size),'Fehler beim Lesen','err','⚠️');
    }
  }
  analyzeBtn.disabled = STATE.rawConvFiles.length===0;
}

function isAssetMap(obj){
  const keys=Object.keys(obj);
  if(!keys.length) return false;
  return keys.slice(0,5).every(k=>typeof obj[k]==='string') && keys.some(k=>k.startsWith('file_')||obj[k].includes('.'));
}

/* ============================ PARSING ============================ */
function cleanText(s){
  if(typeof s!=='string') return '';
  // entity / cite markers:  KIND  PAYLOAD ... 
  let out='';
  let i=0;
  while(i<s.length){
    const ch=s[i];
    if(ch===PU.start){
      const end=s.indexOf(PU.end,i);
      if(end===-1){i++;continue;}
      const inner=s.slice(i+1,end);
      const parts=inner.split(PU.sep);
      const kind=parts[0];
      if(kind==='entity' && parts[1]){
        try{const arr=JSON.parse(parts[1]); out+= (arr[1]||arr[2]||'');}
        catch{ /* drop */ }
      }
      // cite, attribution etc -> drop silently
      i=end+1;
    } else if(ch>='' && ch<=''){
      i++; // stray marker char
    } else {
      out+=ch;i++;
    }
  }
  return out;
}

function extractText(content){
  if(!content) return '';
  const ct=content.content_type;
  if(ct==='reasoning_recap') return typeof content.content==='string'? content.content : '';
  if(ct==='thoughts' && Array.isArray(content.thoughts))
    return content.thoughts.map(t=>(t.summary?('**'+t.summary+'**\n'):'')+(t.content||'')).join('\n\n');
  const parts=content.parts;
  if(Array.isArray(parts)){
    return parts.map(p=> typeof p==='string'? p : '').join('\n');
  }
  if(typeof content.text==='string') return content.text;
  return '';
}

// Walk the mapping tree from current_node back to root -> linear path
function linearPath(conv){
  const map=conv.mapping||{};
  const path=[];
  let nid=conv.current_node;
  let guard=0;
  while(nid && map[nid] && guard++<100000){
    path.push(map[nid]);
    nid=map[nid].parent;
  }
  path.reverse();
  if(path.length<=1){
    // fallback: all message nodes sorted by create_time
    return Object.values(map).filter(n=>n.message).sort((a,b)=>(a.message.create_time||0)-(b.message.create_time||0));
  }
  return path;
}

function attachmentsFor(msg){
  const out=[];
  const md=msg.metadata||{};
  if(Array.isArray(md.attachments)) md.attachments.forEach(a=>out.push(a.name||a.id||'Datei'));
  // multimodal parts with asset pointers
  const parts=msg.content&&msg.content.parts;
  if(Array.isArray(parts)) parts.forEach(p=>{
    if(p && typeof p==='object'){
      const ptr=p.asset_pointer||(p.image_url&&p.image_url.url)||'';
      if(ptr){
        const id=String(ptr).split('/').pop().split('.')[0];
        const named=STATE.assetMap&&Object.entries(STATE.assetMap).find(([k])=>k.includes(id));
        out.push(named?named[1]:(p.content_type||'Bild'));
      }
    }
  });
  return out;
}

function parseAll(){
  const convs=[];
  STATE.rawConvFiles.forEach(file=>{
    file.forEach(c=>{
      const nodes=linearPath(c);
      const messages=[];
      // Voice-Typ erkennen: Live/Advanced Voice (real_time-Teil) vs. Standard-Sprachnachricht
      let hasLive=false;
      Object.values(c.mapping||{}).forEach(n=>{
        const mm=n.message; if(!mm) return;
        const pp=mm.content&&mm.content.parts;
        if(Array.isArray(pp)) for(const p of pp){
          if(p&&typeof p==='object'&&p.content_type==='real_time_user_audio_video_asset_pointer'){hasLive=true;break;}
        }
      });
      nodes.forEach(n=>{
        const m=n.message;
        if(!m) return;
        const role=m.author&&m.author.role;
        if(!role||role==='system') return;
        const ct=m.content&&m.content.content_type;
        const isThinking = ct==='thoughts'||ct==='reasoning_recap';
        const txt=cleanText(extractText(m.content)).trim();
        if(!txt && role!=='user') return;
        const md=m.metadata||{};
        // hochgeladene Bilder zählen (image_asset_pointer ohne Generierungs-Marker = Upload)
        const parts=m.content&&m.content.parts;
        let imgUp=0;
        if(Array.isArray(parts)) for(const p of parts){
          if(p&&typeof p==='object'&&p.content_type==='image_asset_pointer'){
            const pm=p.metadata||{};
            if(!(pm.dalle||pm.generation||pm.watermarked_asset_pointer)) imgUp++;
          }
        }
        messages.push({
          role, ct, isThinking,
          text:txt,
          time:m.create_time||null,
          model:md.model_slug||null,
          attachments:attachmentsFor(m),
          web: Array.isArray(md.search_result_groups)&&md.search_result_groups.length>0,
          cites: Array.isArray(md.content_references)&&md.content_references.length>0,
          code: !!(md.code_blocks&&typeof md.code_blocks==='object'&&Object.keys(md.code_blocks).length>0),
          imgUp,
          imgReq: !!md.image_prompt_id,
        });
      });
      // dedupe consecutive identical (regeneration artifacts)
      convs.push({
        id:c.conversation_id||c.id,
        title:c.title||'(ohne Titel)',
        create:c.create_time||null,
        update:c.update_time||null,
        voice:!!c.voice,
        live:hasLive,
        messages,
      });
    });
  });
  STATE.conversations=convs;
  recomputeStats();
}

/* recompute over the current filter (all chats vs. without voice) */
function recomputeStats(){
  const convs = STATE.excludeVoice ? STATE.conversations.filter(c=>!c.voice) : STATE.conversations;
  computeStats(convs);
}

/* ============================ STATS ============================ */
function computeStats(convs){
  const s={
    nConv:convs.length, nMsg:0, nUser:0, nAssistant:0,
    nThinking:0, nWords:0, nUserWords:0, nAssistantWords:0,
    nVoice:0, nVoiceUser:0, nVoiceAssistant:0, nVoiceMsg:0, nAttachMsg:0,
    nLive:0, nStdVoice:0, nWeb:0, nCites:0, nCodeMsg:0, nImgUp:0, nImgReq:0,
    models:{}, contentTypes:{},
    perDay:{}, perHour:Array(24).fill(0), perWeekday:Array(7).fill(0),
    convLens:[], respLatencies:[], longestMsg:{len:0},
    minTime:Infinity, maxTime:0,
  };
  convs.forEach(c=>{
    if(c.voice){ s.nVoice++; if(c.live) s.nLive++; else s.nStdVoice++; }
    let len=0, lastUserTime=null, hadAttach=false;
    c.messages.forEach(m=>{
      s.nMsg++;
      if(m.web) s.nWeb++;
      if(m.cites) s.nCites++;
      if(m.code) s.nCodeMsg++;
      if(m.imgUp) s.nImgUp+=m.imgUp;
      if(m.imgReq) s.nImgReq++;
      const w=m.text?m.text.split(/\s+/).filter(Boolean).length:0;
      if(m.isThinking){ s.nThinking++; }
      else {
        len++;
        s.nWords+=w;
        if(m.role==='user'){ s.nUser++; s.nUserWords+=w; if(c.voice){s.nVoiceUser++;s.nVoiceMsg++;} }
        else if(m.role==='assistant'){ s.nAssistant++; s.nAssistantWords+=w; if(c.voice){s.nVoiceAssistant++;s.nVoiceMsg++;} }
      }
      if(m.ct) s.contentTypes[m.ct]=(s.contentTypes[m.ct]||0)+1;
      if(m.model && !m.isThinking) s.models[m.model]=(s.models[m.model]||0)+1;
      if(m.attachments&&m.attachments.length) hadAttach=true;
      if(!m.isThinking && w>s.longestMsg.len) s.longestMsg={len:w,title:c.title,id:c.id,role:m.role};
      if(m.time && !m.isThinking){
        s.minTime=Math.min(s.minTime,m.time);s.maxTime=Math.max(s.maxTime,m.time);
        const d=new Date(m.time*1000);
        const key=dayKey(d);
        s.perDay[key]=(s.perDay[key]||0)+1;
        s.perHour[d.getHours()]++;
        s.perWeekday[(d.getDay()+6)%7]++; // Mon=0
        if(m.role==='user') lastUserTime=m.time;
        else if(m.role==='assistant'&&lastUserTime){
          const dt=m.time-lastUserTime;
          if(dt>0&&dt<3600) s.respLatencies.push(dt);
          lastUserTime=null;
        }
      }
    });
    if(hadAttach) s.nAttachMsg++;
    s.convLens.push({len,title:c.title,id:c.id,words:c.messages.reduce((a,m)=>a+(!m.isThinking&&m.text?m.text.split(/\s+/).filter(Boolean).length:0),0)});
  });
  // top words
  s.topWords=topWords(convs);
  // assets
  s.assets=assetStats();
  STATE.stats=s;
}

function dayKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

const STOP=new Set(('der die das und ich du er sie es wir ihr ist sind war ein eine einen einem einer dem den nicht auch mit für fur auf von zu im in an als wie wenn dann also noch nur mehr sehr kann kannst könnte konnte muss müssen soll sollte wird werden wurde worden haben hat hatte habe hast hätte sein seine seinen ihre ihren ja nein oder aber weil dass man mir mich dir dich uns euch sich am beim zur zum vom des dessen daß so um bei nach aus über uber unter vor durch gegen ohne bis schon hier da dort wo was wer warum welche welcher welches dieses dieser diese jede jeder jeden alle allem allen viele viel vielen keine kein keinen etwas eher gibt geht gehen immer ganz wirklich eigentlich vielleicht dabei dazu damit darauf darin sowie bzw denn doch mal eines einige manche gut gute guten neue neuen gerade bisschen gleich macht machen machst sagen sagt sagte zwei drei steht stehen ähnlich z.b zb etc usw the a an and or of to in is are was for on with at by it this that be have has had i you he she we they not but if then will would can do does my your our their me him her its as so just like get got make made one two new use using used able into out up down off there them than ok okay yes no please thanks').split(/\s+/));

function topWords(convs,limit=60){
  const cnt={};
  convs.forEach(c=>c.messages.forEach(m=>{
    if(m.isThinking) return;
    const words=(m.text||'').toLowerCase().replace(/[^a-zäöüß0-9\s-]/g,' ').split(/\s+/);
    words.forEach(w=>{ if(w.length>3&&!STOP.has(w)&&!/^\d+$/.test(w)) cnt[w]=(cnt[w]||0)+1; });
  }));
  return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,limit);
}

function assetStats(){
  const r={total:0,audio:0,image:0,doc:0,other:0,byExt:{}};
  if(!STATE.assetMap) return r;
  Object.values(STATE.assetMap).forEach(name=>{
    r.total++;
    const ext=(name.includes('.')?name.split('.').pop():'').toLowerCase();
    r.byExt[ext]=(r.byExt[ext]||0)+1;
    if(['wav','mp3','m4a','ogg','opus'].includes(ext)) r.audio++;
    else if(['png','jpg','jpeg','webp','gif','svg','heic'].includes(ext)) r.image++;
    else if(['pdf','docx','pptx','xlsx','md','txt','csv'].includes(ext)) r.doc++;
    else r.other++;
  });
  return r;
}

/* ============================ DASHBOARD RENDER ============================ */
function nf(n){return (n||0).toLocaleString('de-DE')}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function renderDashboard(animate=true){
  const s=STATE.stats;
  const el=document.getElementById('dashContent');
  STATE.charts.forEach(c=>c.destroy());STATE.charts=[];

  const days=Object.keys(s.perDay);
  const activeDays=days.length;
  const dateRange = isFinite(s.minTime)? `${fmtDate(s.minTime)} – ${fmtDate(s.maxTime)}` : '–';
  const totalMsg=s.nUser+s.nAssistant;
  const avgMsg=(totalMsg/Math.max(1,s.nConv)).toFixed(1);
  const avgResp=s.nAssistant? Math.round(s.nAssistantWords/s.nAssistant):0;
  const avgUserLen=s.nUser? Math.round(s.nUserWords/s.nUser):0;
  const busiest=Object.entries(s.perDay).sort((a,b)=>b[1]-a[1])[0];
  const streak=longestStreak(days);
  const thinkPct=totalMsg? Math.round(s.nThinking/totalMsg*100):0;

  // weitere abgeleitete Werte
  const medResp=median(s.respLatencies);
  const avgRespT=s.respLatencies.length? s.respLatencies.reduce((a,b)=>a+b,0)/s.respLatencies.length:0;
  const avgWordsDay=activeDays? Math.round(s.nWords/activeDays):0;
  const fullWd=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  const peakHour=s.perHour.indexOf(Math.max(...s.perHour));
  const peakWd=s.perWeekday.indexOf(Math.max(...s.perWeekday));
  const modelE=Object.entries(s.models).sort((a,b)=>b[1]-a[1]);
  const nModels=modelE.length;
  // längste Pause zwischen zwei aktiven Tagen
  const sortedDays=days.slice().sort();
  let pause={days:0,from:null,to:null};
  for(let i=1;i<sortedDays.length;i++){
    const g=Math.round((new Date(sortedDays[i])-new Date(sortedDays[i-1]))/86400000);
    if(g>pause.days) pause={days:g,from:sortedDays[i-1],to:sortedDays[i]};
  }

  const msgTip='In Voice-Chats antwortet die KI per Audio – diese Antworten werden als .wav-Datei gespeichert und zählen nicht als Text. Darum erscheinen mehr Nachrichten von dir. Klick auf „Ohne Voice“ für die reine Text-Bilanz.';
  const liveTip='Live / Advanced Voice Mode: das durchgehende Echtzeit-Gespräch (der animierte Kreis). In deinem Export der häufigste Voice-Typ.';
  const stdVoiceTip='Klassische Sprachnachricht: du sprichst eine einzelne Nachricht ein, sie wird transkribiert, die KI antwortet rundenbasiert.';
  const imgTip='Nur von dir hochgeladene Bilder. KI-generierte Bilder sind im ChatGPT-Export leider nicht als Daten enthalten und lassen sich daher nicht zählen.';
  el.innerHTML=`
  ${STATE.demo?`<div class="demo-banner">✨ <span><b>Demo-Modus:</b> zufällig generierte Beispieldaten – kein echter Account.</span> <a class="x" id="exitDemo">Eigenen Export laden →</a></div>`:''}
  <div class="section-title with-ctrl">📊 Überblick
    <div class="vtoggle" id="vtoggle">
      <button data-vf="all" class="${STATE.excludeVoice?'':'active'}">Alle Chats</button>
      <button data-vf="novoice" class="${STATE.excludeVoice?'active':''}">Ohne Voice 🎙️</button>
    </div>
  </div>
  ${STATE.excludeVoice?'<div class="note" style="margin-bottom:16px">🎙️ Voice-Chats sind ausgeblendet – du siehst nur reine Text-Konversationen.</div>':''}
  <div class="grid g-stats">
    ${statCard('Konversationen',nf(s.nConv),'💬','c1','accentC1',dateRange)}
    ${statCard('Nachrichten gesamt',nf(totalMsg),'✉️','c2','accentC2',`${nf(s.nUser)} von dir · ${nf(s.nAssistant)} KI`, STATE.excludeVoice?'':msgTip)}
    ${statCard('Wörter geschrieben',nf(s.nWords),'✍️','c3','accentC3',`${nf(s.nUserWords)} von dir`)}
    ${statCard('Aktive Tage',nf(activeDays),'📅','c4','accentC4',`längste Serie: ${streak} Tage`)}
    ${statCard('Längste Pause',nf(pause.days),'⏸️','c5','accentC5', pause.days? `Tage ohne Chat · ${fmtDate2(pause.from)} → ${fmtDate2(pause.to)}`:'keine Lücke')}
    ${statCard('Ø Nachrichten / Chat',avgMsg,'📈','c1','accentC1','')}
    ${statCard('KI-Antwortzeit',medResp?fmtDur(medResp):'–','⚡','c2','accentC2', medResp?`Median · Ø ${fmtDur(avgRespT)}`:'keine Daten','Zeit zwischen deiner Nachricht und der KI-Antwort (nur Antworten unter 1 Stunde).')}
    ${statCard('Ø Antwortlänge',nf(avgResp)+' W','🤖','c3','accentC3','pro KI-Antwort')}
    ${statCard('Längste Antwort',nf(s.longestMsg.len)+' W','📜','c4','accentC4','in einer Nachricht')}
    ${statCard('Ø deine Nachricht',nf(avgUserLen)+' W','⌨️','c5','accentC5','Wörter pro Frage')}
    ${statCard('Ø Wörter / Tag',nf(avgWordsDay),'🗓️','c1','accentC1','an aktiven Tagen')}
    ${statCard('Aktivste Stunde',s.perHour[peakHour]? peakHour+':00':'–','🕐','c2','accentC2', s.perHour[peakHour]?`${nf(s.perHour[peakHour])} Nachrichten`:'')}
    ${statCard('Aktivster Tag',s.perWeekday[peakWd]? fullWd[peakWd]:'–','📆','c3','accentC3', s.perWeekday[peakWd]?`${nf(s.perWeekday[peakWd])} Nachrichten`:'')}
    ${statCard('Modelle genutzt',nf(nModels),'🧬','c4','accentC4', modelE.length?`meist: ${modelE[0][0]}`:'')}
    ${statCard('Live-Voice',nf(s.nLive),'🎧','c5','accentC5','Echtzeit-Gespräche',liveTip)}
    ${statCard('Sprachnachrichten',nf(s.nStdVoice),'🎙️','c1','accentC1','Standard (transkribiert)',stdVoiceTip)}
    ${statCard('Thinking-Blöcke',nf(s.nThinking),'🧠','c2','accentC2',thinkPct+'% aller Nachrichten')}
    ${s.nWeb? statCard('Web-Suchen',nf(s.nWeb),'🌐','c3','accentC3',`${nf(s.nCites)} Antworten mit Quellen`,'Wie oft die KI für ihre Antwort im Web gesucht hat.'):''}
    ${s.nCodeMsg? statCard('Antworten mit Code',nf(s.nCodeMsg),'💻','c4','accentC4','enthalten Code-Blöcke'):''}
    ${s.nImgUp? statCard('Hochgeladene Bilder',nf(s.nImgUp),'🖼️','c5','accentC5','von dir gesendet',imgTip):''}
    ${statCard('Chats mit Anhang',nf(s.nAttachMsg),'📎','c1','accentC1','')}
    ${statCard('Geteilte Dateien',nf(s.assets.total),'🗂️','c2','accentC2', s.assets.total? `${s.assets.audio} Audio · ${s.assets.image} Bilder`:'optional – conversations reichen')}
    ${statCard('Spitzentag',busiest?nf(busiest[1]):'–','🔥','c3','accentC3',busiest?fmtDate2(busiest[0]):'')}
  </div>

  <div class="section-title">🗓️ Aktivität</div>
  <div class="card accentC1">
    <h3 class="ct">🟩 Aktivitäts-Heatmap <small>Nachrichten pro Tag</small></h3>
    <div class="heatmap" id="heatmap"></div>
    <div class="heatlegend">weniger
      <span class="hc" style="background:rgba(0,113,227,.12)"></span>
      <span class="hc" style="background:rgba(0,113,227,.32)"></span>
      <span class="hc" style="background:rgba(0,113,227,.55)"></span>
      <span class="hc" style="background:rgba(0,113,227,.78)"></span>
      <span class="hc" style="background:var(--accent)"></span> mehr</div>
  </div>

  <div class="grid g-2" style="margin-top:18px">
    <div class="card accentC2"><h3 class="ct">📈 Verlauf <small>Nachrichten pro Tag</small></h3><div class="chartwrap"><canvas id="cTimeline"></canvas></div></div>
    <div class="card accentC3"><h3 class="ct">🕐 Tageszeit <small>wann du chattest</small></h3><div class="chartwrap"><canvas id="cHour"></canvas></div></div>
  </div>

  <div class="grid g-2" style="margin-top:18px">
    <div class="card accentC4"><h3 class="ct">📅 Wochentage</h3><div class="chartwrap"><canvas id="cWeekday"></canvas></div></div>
    <div class="card accentC5"><h3 class="ct">🤖 Modell-Nutzung</h3><div class="chartwrap"><canvas id="cModels"></canvas></div></div>
  </div>

  <div class="grid g-2" style="margin-top:18px">
    <div class="card accentC1"><h3 class="ct">📏 Chat-Längen <small>Verteilung</small></h3><div class="chartwrap"><canvas id="cLen"></canvas></div></div>
    <div class="card accentC2"><h3 class="ct">🧩 Nachrichten-Typen</h3><div class="chartwrap"><canvas id="cTypes"></canvas></div></div>
  </div>

  <div class="section-title">🏆 Bestenlisten</div>
  <div class="grid g-2">
    <div class="card accentC3"><h3 class="ct">📚 Längste Konversationen <small>klicken zum Öffnen</small></h3>
      <div class="lboard" id="lbLongest"></div></div>
    <div class="card accentC5"><h3 class="ct">📝 Meiste Wörter <small>klicken zum Öffnen</small></h3>
      <div class="lboard" id="lbWords"></div></div>
  </div>

  ${s.assets.total?`
  <div class="section-title">🗂️ Geteilte Dateien</div>
  <div class="grid g-2">
    <div class="card accentC4"><h3 class="ct">📦 Datei-Typen</h3><div class="chartwrap"><canvas id="cAssets"></canvas></div></div>
    <div class="card accentC1"><h3 class="ct">📊 Nach Dateiendung</h3><div class="lboard" id="lbExt"></div></div>
  </div>`:''}

  <div class="section-title">☁️ Häufigste Wörter</div>
  <div class="card accentC2"><div class="wordcloud" id="wordcloud"></div></div>
  `;

  // exit demo mode
  const exitD=document.getElementById('exitDemo');
  if(exitD) exitD.addEventListener('click',()=>switchView('upload'));

  // voice filter toggle (re-render instantly, no reveal replay)
  document.querySelectorAll('#vtoggle button').forEach(b=>b.addEventListener('click',()=>{
    const ex = b.dataset.vf==='novoice';
    if(ex===STATE.excludeVoice) return;
    STATE.excludeVoice=ex;
    recomputeStats();
    renderDashboard(false);
  }));

  buildHeatmap(s);
  buildCharts(s);
  buildLeaderboards(s);
  buildWordcloud(s);

  // scroll reveals + counter-on-reveal
  observeReveals(el, !animate);
}

function statCard(lbl,val,ic,vc,ac,sub,tip){
  const isNum=/^[\d.,]+$/.test(val);
  return `<div class="card stat ${ac}">
    <span class="lbl"><span class="ic">${ic}</span>${lbl}${tip?`<span class="tip" title="${escapeHtml(tip)}">ⓘ</span>`:''}</span>
    <span class="val ${vc}" ${isNum?`data-n="${val.replace(/\./g,'').replace(',','.')}" data-raw="${val}"`:''}>${val}</span>
    ${sub?`<span class="sub">${sub}</span>`:''}
  </div>`;
}

function animateCount(el){
  const target=parseFloat(el.dataset.n);
  if(isNaN(target))return;
  const raw=el.dataset.raw;
  const dec=raw.includes(',')?1:0;
  const dur=1100;const t0=performance.now();
  function step(t){
    const p=Math.min(1,(t-t0)/dur);
    const e=1-Math.pow(1-p,3);
    const v=target*e;
    el.textContent=v.toLocaleString('de-DE',{minimumFractionDigits:dec,maximumFractionDigits:dec});
    if(p<1)requestAnimationFrame(step); else el.textContent=raw;
  }
  requestAnimationFrame(step);
}

/* ---- heatmap ---- */
function buildHeatmap(s){
  const cont=document.getElementById('heatmap');
  if(!isFinite(s.minTime)){cont.innerHTML='<p class="muted">Keine Zeitdaten.</p>';return;}
  const start=new Date(s.minTime*1000); start.setHours(0,0,0,0);
  start.setDate(start.getDate()-((start.getDay()+6)%7)); // back to Monday
  const end=new Date(s.maxTime*1000);
  const max=Math.max(...Object.values(s.perDay),1);
  const monShort=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

  // in Wochen-Spalten (Mo–So) gruppieren
  const weeks=[]; let cur=[];
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    const key=dayKey(d);
    cur.push({key, v:s.perDay[key]||0, date:new Date(d)});
    if(((d.getDay()+6)%7)===6){ weeks.push(cur); cur=[]; }
  }
  if(cur.length) weeks.push(cur);

  // Monats-/Jahres-Labels je Wochen-Spalte
  let lastMonth=-1, lastYear=-1;
  const monthLabels=weeks.map(w=>{
    const dt=w[0].date, m=dt.getMonth(), y=dt.getFullYear();
    if(m!==lastMonth || y!==lastYear){
      const lbl=monShort[m]+((y!==lastYear)? " '"+String(y).slice(2):'');
      lastMonth=m; lastYear=y; return lbl;
    }
    return '';
  });

  const wrap=document.createElement('div'); wrap.className='heatwrap';
  wrap.appendChild(document.createElement('div')); // leere Ecke

  const monthRow=document.createElement('div'); monthRow.className='heatmonths';
  monthLabels.forEach(lbl=>{const sp=document.createElement('span');sp.className='hm';sp.textContent=lbl;monthRow.appendChild(sp);});
  wrap.appendChild(monthRow);

  const dayCol=document.createElement('div'); dayCol.className='heatdays';
  ['Mo','','Mi','','Fr','','So'].forEach(t=>{const sp=document.createElement('span');sp.textContent=t;dayCol.appendChild(sp);});
  wrap.appendChild(dayCol);

  const grid=document.createElement('div'); grid.className='heatgrid';
  weeks.forEach(w=>w.forEach(c=>{
    const cell=document.createElement('div'); cell.className='heatcell';
    if(c.v>0){
      const a=.18+(c.v/max)*.72;
      cell.style.background=`rgba(0,113,227,${a.toFixed(2)})`;
      cell.style.boxShadow='none';
    }
    cell.title=`${fmtDate2(c.key)}: ${c.v} Nachrichten`;
    grid.appendChild(cell);
  }));
  wrap.appendChild(grid);

  cont.innerHTML=''; cont.appendChild(wrap);
}

/* ---- charts ---- */
const FONT={family:"-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif"};
Chart.defaults.color='#6e6e73';Chart.defaults.font.family=FONT.family;Chart.defaults.borderColor='rgba(0,0,0,.08)';
function grad(ctx,c){const g=ctx.createLinearGradient(0,0,0,300);g.addColorStop(0,c+'cc');g.addColorStop(1,c+'08');return g;}
const PALETTE=['#0071e3','#34c759','#5e5ce6','#ff9f0a','#64d2ff','#bf5af2','#ff375f','#30b0c7'];

function buildCharts(s){
  // timeline
  const days=Object.keys(s.perDay).sort();
  const tctx=document.getElementById('cTimeline').getContext('2d');
  STATE.charts.push(new Chart(tctx,{type:'line',data:{labels:days.map(fmtDate2),datasets:[{data:days.map(d=>s.perDay[d]),
    borderColor:'#0071e3',backgroundColor:grad(tctx,'#0071e3'),fill:true,tension:.4,pointRadius:0,borderWidth:2}]},
    options:baseOpt({x:{ticks:{maxTicksLimit:8}}})}));

  // hour
  const hctx=document.getElementById('cHour').getContext('2d');
  STATE.charts.push(new Chart(hctx,{type:'bar',data:{labels:[...Array(24)].map((_,i)=>i+'h'),datasets:[{data:s.perHour,
    backgroundColor:grad(hctx,'#5e5ce6'),borderRadius:5}]},options:baseOpt({x:{ticks:{maxTicksLimit:12}}})}));

  // weekday
  const wctx=document.getElementById('cWeekday').getContext('2d');
  STATE.charts.push(new Chart(wctx,{type:'bar',data:{labels:['Mo','Di','Mi','Do','Fr','Sa','So'],datasets:[{data:s.perWeekday,
    backgroundColor:'#34c759',borderRadius:6}]},options:baseOpt()}));

  // models
  const mEntries=Object.entries(s.models).sort((a,b)=>b[1]-a[1]);
  const mctx=document.getElementById('cModels').getContext('2d');
  STATE.charts.push(new Chart(mctx,{type:'doughnut',data:{labels:mEntries.map(e=>e[0]),datasets:[{data:mEntries.map(e=>e[1]),
    backgroundColor:PALETTE,borderColor:'#fff',borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'right',labels:{boxWidth:12,font:{size:11}}}}}}));

  // length histogram
  const buckets=[1,3,6,11,21,41,81];const labels=['1-2','3-5','6-10','11-20','21-40','41-80','80+'];
  const hist=Array(labels.length).fill(0);
  s.convLens.forEach(c=>{let b=buckets.findIndex((x,i)=>c.len< (buckets[i+1]||Infinity));if(b<0)b=labels.length-1;hist[b]++;});
  const lctx=document.getElementById('cLen').getContext('2d');
  STATE.charts.push(new Chart(lctx,{type:'bar',data:{labels,datasets:[{data:hist,backgroundColor:grad(lctx,'#0071e3'),borderRadius:6}]},options:baseOpt()}));

  // content types
  const ctLabels={text:'Antworten/Fragen',multimodal_text:'Mit Medien',thoughts:'Thinking',reasoning_recap:'Reasoning-Recap'};
  const cEntries=Object.entries(s.contentTypes).sort((a,b)=>b[1]-a[1]);
  const cctx=document.getElementById('cTypes').getContext('2d');
  STATE.charts.push(new Chart(cctx,{type:'polarArea',data:{labels:cEntries.map(e=>ctLabels[e[0]]||e[0]),datasets:[{data:cEntries.map(e=>e[1]),
    backgroundColor:PALETTE.map(c=>c+'cc'),borderColor:'#fff',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,
    scales:{r:{ticks:{display:false},grid:{color:'rgba(0,0,0,.08)'}}},plugins:{legend:{position:'right',labels:{boxWidth:12,font:{size:11}}}}}}));

  // assets
  if(s.assets.total){
    const actx=document.getElementById('cAssets').getContext('2d');
    STATE.charts.push(new Chart(actx,{type:'doughnut',data:{labels:['Audio 🎤','Bilder 🖼️','Dokumente 📄','Sonstige'],
      datasets:[{data:[s.assets.audio,s.assets.image,s.assets.doc,s.assets.other],backgroundColor:[PALETTE[3],PALETTE[0],PALETTE[4],PALETTE[1]],borderColor:'#fff',borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{position:'right',labels:{boxWidth:12,font:{size:11}}}}}}));
  }
}

function baseOpt(scales){
  return {responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
    scales:Object.assign({y:{beginAtZero:true,grid:{color:'rgba(0,0,0,.06)'}},x:{grid:{display:false}}},scales||{})};
}

/* ---- leaderboards ---- */
function buildLeaderboards(s){
  const byLen=[...s.convLens].sort((a,b)=>b.len-a.len).slice(0,7);
  document.getElementById('lbLongest').innerHTML=byLen.map((c,i)=>lrow(i,c.title,c.len+' Nachr.',c.id)).join('');
  const byWords=[...s.convLens].sort((a,b)=>b.words-a.words).slice(0,7);
  document.getElementById('lbWords').innerHTML=byWords.map((c,i)=>lrow(i,c.title,nf(c.words)+' W',c.id)).join('');
  if(s.assets.total){
    const ext=Object.entries(s.assets.byExt).sort((a,b)=>b[1]-a[1]).slice(0,10);
    document.getElementById('lbExt').innerHTML=ext.map((e,i)=>lrow(i,'.'+e[0],nf(e[1])+'×',null)).join('');
  }
  document.querySelectorAll('.lrow.clickable').forEach(r=>r.addEventListener('click',()=>openConversationById(r.dataset.id)));
}
function lrow(i,title,val,id){
  return `<div class="lrow ${id?'clickable':''}" ${id?`data-id="${id}"`:''}>
    <span class="rank ${i===0?'top':''}">${i+1}</span>
    <span class="lt">${escapeHtml(title)}</span><span class="lv">${val}</span></div>`;
}

/* ---- wordcloud ---- */
function buildWordcloud(s){
  const el=document.getElementById('wordcloud');
  if(!s.topWords.length){el.innerHTML='<p class="muted">Nicht genug Text.</p>';return;}
  const max=s.topWords[0][1],min=s.topWords[s.topWords.length-1][1];
  const cols=['#a1a1a6','#86868b','#6e6e73','#5e5ce6','#0071e3','#34c759'];
  el.innerHTML=s.topWords.map(([w,c])=>{
    const f=(c-min)/Math.max(1,max-min);
    const sz=15+f*44;
    const col=cols[Math.min(cols.length-1,Math.floor(f*cols.length))];
    return `<span style="font-size:${sz.toFixed(0)}px;color:${col}" title="${c}×">${escapeHtml(w)}</span>`;
  }).join('');
}

/* ============================ READER ============================ */
function dispLen(c){return c.messages.filter(m=>!m.isThinking).length}
function renderConvList(){
  const q=document.getElementById('convSearch').value.toLowerCase().trim();
  let list=[...STATE.conversations];
  if(q) list=list.filter(c=>c.title.toLowerCase().includes(q)||c.messages.some(m=>m.text&&m.text.toLowerCase().includes(q)));
  if(STATE.currentSort==='date') list.sort((a,b)=>(b.update||b.create||0)-(a.update||a.create||0));
  else if(STATE.currentSort==='len') list.sort((a,b)=>dispLen(b)-dispLen(a));
  else list.sort((a,b)=>a.title.localeCompare(b.title,'de'));
  const el=document.getElementById('convList');
  el.innerHTML=list.map(c=>`<div class="citem ${STATE.selectedConv===c.id?'active':''}" data-id="${c.id}">
    <div class="t">${c.voice?'🎙️ ':''}${escapeHtml(c.title)}</div>
    <div class="m"><span>${c.create?fmtDate(c.create):''}</span><span>${c.messages.filter(m=>!m.isThinking).length} Nachr.</span></div>
  </div>`).join('')|| '<div class="emptyreader"><p>Keine Treffer.</p></div>';
  el.querySelectorAll('.citem').forEach(it=>it.addEventListener('click',()=>openConversation(it.dataset.id)));
}

function openConversationById(id){
  switchView('reader');
  openConversation(id);
  const it=document.querySelector(`.citem[data-id="${id}"]`);
  if(it) it.scrollIntoView({block:'center'});
}

function openConversation(id){
  const c=STATE.conversations.find(x=>x.id===id);
  if(!c)return;
  STATE.selectedConv=id;
  document.querySelectorAll('.citem').forEach(i=>i.classList.toggle('active',i.dataset.id===id));
  document.getElementById('convTitle').textContent=c.title;
  renderMessages(c);
}

function renderMessages(c){
  const showThink=document.getElementById('showThinking').checked;
  const body=document.getElementById('convBody');
  let html='';
  c.messages.forEach(m=>{
    if(m.isThinking && !showThink) return;
    if(!m.text && !(m.attachments&&m.attachments.length)) return;
    const cls=m.isThinking?'thinking':m.role;
    const who=m.isThinking?'🧠 Thinking':(m.role==='user'?'Du':'ChatGPT');
    const rendered=m.text?DOMPurify.sanitize(marked.parse(m.text)):'';
    const att=(m.attachments&&m.attachments.length)?`<div class="attachnote">📎 ${m.attachments.map(a=>`<span class="attachchip">${escapeHtml(a)}</span>`).join('')}</div>`:'';
    const badge=m.model&&!m.isThinking&&m.role==='assistant'?`<span class="modelbadge">${escapeHtml(m.model)}</span>`:'';
    const time=m.time?`<span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">${fmtDateTime(m.time)}</span>`:'';
    html+=`<div class="msg ${cls}"><div class="who">${who} ${badge} ${time}</div><div class="bubble">${rendered}${att}</div></div>`;
  });
  body.innerHTML=html||'<div class="emptyreader"><p>Leere Konversation.</p></div>';
  body.scrollTop=0;
}

/* sort + search bindings */
document.getElementById('convSearch').addEventListener('input',renderConvList);
document.querySelectorAll('.rsort button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.rsort button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');STATE.currentSort=b.dataset.sort;renderConvList();
}));
document.getElementById('showThinking').addEventListener('change',()=>{
  if(STATE.selectedConv) openConversation(STATE.selectedConv);
});

/* ============================ HELPERS ============================ */
function fmtDate(ts){return new Date(ts*1000).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}
function fmtDate2(key){const[y,m,d]=key.split('-');return new Date(y,m-1,d).toLocaleDateString('de-DE',{day:'2-digit',month:'short'})}
function fmtDateTime(ts){return new Date(ts*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function fmtDur(sec){if(sec<60)return Math.round(sec)+' s';return Math.round(sec/60)+' min'}
function median(arr){if(!arr.length)return 0;const a=[...arr].sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function longestStreak(days){
  if(!days.length)return 0;
  const set=new Set(days);let best=0;
  days.forEach(d=>{
    const prev=new Date(d);prev.setDate(prev.getDate()-1);
    if(!set.has(dayKey(prev))){
      let cur=1,nx=new Date(d);
      while(true){nx.setDate(nx.getDate()+1);if(set.has(dayKey(nx)))cur++;else break;}
      best=Math.max(best,cur);
    }
  });
  return best;
}

/* ============================ NAV ============================ */
function switchView(v){
  document.querySelectorAll('.view').forEach(s=>s.classList.remove('active'));
  document.getElementById('view-'+v).classList.add('active');
  document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  window.scrollTo({top:0,behavior:'smooth'});
  if(STATE._heroUpdate) requestAnimationFrame(STATE._heroUpdate);
}
document.querySelectorAll('nav.tabs button').forEach(b=>b.addEventListener('click',()=>{if(!b.disabled)switchView(b.dataset.view)}));

analyzeBtn.addEventListener('click',()=>{
  STATE.demo=false;
  analyzeBtn.disabled=true;analyzeBtn.textContent='⏳ Wird ausgewertet…';
  setTimeout(()=>{
    parseAll();
    document.getElementById('tab-dash').disabled=false;
    document.getElementById('tab-read').disabled=false;
    switchView('dashboard');     // make view visible BEFORE building charts so canvases get a real size
    renderDashboard(true);
    renderConvList();
    analyzeBtn.textContent='✨ Erneut auswerten';analyzeBtn.disabled=false;
  },60);
});

marked.setOptions({breaks:true,gfm:true});

/* ============================ MOTION + DEMO ============================ */
function prefersReduced(){return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;}

/* reveal-on-scroll with stagger + counter-on-reveal */
let revealObserver=null;
function observeReveals(container,instant){
  if(!container) return;
  const els=container.querySelectorAll('.card,.section-title,.demo-banner,[data-reveal]');
  if(instant || prefersReduced()){
    els.forEach(el=>el.classList.add('reveal','in'));
    container.querySelectorAll('.val[data-n]').forEach(v=>{if(!v.hasAttribute('data-counted')){v.setAttribute('data-counted','1');animateCount(v);}});
    return;
  }
  if(!revealObserver){
    revealObserver=new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(!e.isIntersecting) return;
        e.target.classList.add('in');
        e.target.querySelectorAll('.val[data-n]:not([data-counted])').forEach(v=>{v.setAttribute('data-counted','1');animateCount(v);});
        revealObserver.unobserve(e.target);
      });
    },{rootMargin:'0px 0px -8% 0px',threshold:.08});
  }
  els.forEach(el=>{
    if(el.classList.contains('in')) return;
    el.classList.add('reveal');
    const sibs=[...el.parentElement.children].filter(c=>c.classList.contains('reveal')&&!c.classList.contains('in'));
    el.style.transitionDelay=Math.min(Math.max(0,sibs.indexOf(el))*55,330)+'ms';
    revealObserver.observe(el);
  });
}

/* cinematic pinned hero: scale + fade headline, parallax mesh */
function initHero(){
  const stage=document.getElementById('heroStage');
  if(!stage) return;
  const inner=document.getElementById('heroInner');
  const mesh=document.getElementById('heroMesh');
  let ticking=false;
  function update(){
    ticking=false;
    if(prefersReduced()||stage.offsetParent===null){inner.style.transform='';inner.style.opacity='';if(mesh)mesh.style.transform='';return;}
    const total=stage.offsetHeight-window.innerHeight;
    if(total<=0) return;
    const prog=Math.min(1,Math.max(0,-stage.getBoundingClientRect().top/total));
    inner.style.transform=`translateY(${(-44*prog).toFixed(1)}px) scale(${(1-0.12*prog).toFixed(3)})`;
    inner.style.opacity=(1-prog*0.92).toFixed(3);
    if(mesh) mesh.style.transform=`translateY(${(prog*130).toFixed(1)}px) scale(${(1+0.18*prog).toFixed(3)})`;
  }
  STATE._heroUpdate=update;
  const onScroll=()=>{if(!ticking){ticking=true;requestAnimationFrame(update);}};
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});
  update();
}

/* demo mode */
function runDemo(btn){
  if(!window.buildDemoExport){alert('Demo-Daten konnten nicht geladen werden.');return;}
  const old=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='⏳ Lädt Demo…';}
  setTimeout(()=>{
    STATE.demo=true;
    STATE.rawConvFiles=[buildDemoExport()];
    STATE.assetMap=buildDemoAssets();
    parseAll();
    document.getElementById('tab-dash').disabled=false;
    document.getElementById('tab-read').disabled=false;
    switchView('dashboard');
    renderDashboard(true);
    renderConvList();
    if(btn){btn.disabled=false;btn.textContent=old;}
    window.scrollTo({top:0});
  },40);
}
document.querySelectorAll('[data-demo]').forEach(b=>b.addEventListener('click',()=>runDemo(b)));

initHero();
observeReveals(document.getElementById('view-upload'));
