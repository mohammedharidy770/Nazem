/* ================== Helpers & State ================== */
const SUBJECT_POOL = [
    {name:'رياضة', dur:120},{name:'إنجليزي', dur:120},{name:'فيزياء', dur:120},{name:'كيمياء', dur:120},{name:'أحياء', dur:120},
    {name:'قرآن', dur:60},{name:'حديث', dur:60},{name:'تفسير', dur:60},{name:'توحيد', dur:60},{name:'فقه', dur:60},
    {name:'صرف', dur:60},{name:'أدب', dur:60},{name:'نصوص', dur:60},{name:'تعبير', dur:60},{name:'بلاغة', dur:60},{name:'نحو', dur:60}
  ];
  
  const SCHEDULE_KEY = 'nazem_day_schedule_v1';
  const STATS_KEY = 'nazem_pause_stats_v1';
  const GOALS_KEY = 'nazem_goals_v1';
  
  const startBtn = document.getElementById('startBtn');
  const startBtn2 = document.getElementById('startBtn2');
  const pauseBtn = document.getElementById('pauseBtn');
  const regenBtn = document.getElementById('regenBtn');
  const statusEl = document.getElementById('status');
  const statusSmall = document.getElementById('statusSmall');
  const timelineEl = document.getElementById('timeline');
  const todaySummaryEl = document.getElementById('todaySummary');
  const prayerDurationInput = document.getElementById('prayerDuration');
  const breakMinutesInput = document.getElementById('breakMinutes');
  const cityInput = document.getElementById('cityInput');
  const applyBtn = document.getElementById('applyBtn');
  const pingAudio = document.getElementById('pingAudio');
  const timerFill = document.getElementById('timerFill');
  const currentSlotLabel = document.getElementById('currentSlotLabel');
  const currentTimer = document.getElementById('currentTimer');
  const pauseBanner = document.getElementById('pauseBanner');
  const statsContent = document.getElementById('statsContent');
  const addGoalBtn = document.getElementById('addGoal');
  const newGoalInput = document.getElementById('newGoal');
  const goalsListEl = document.getElementById('goalsList');
  const saveScheduleBtn = document.getElementById('saveScheduleBtn');
  const loadScheduleBtn = document.getElementById('loadScheduleBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');
  const swapIndex1 = document.getElementById('swapIndex1');
  const swapIndex2 = document.getElementById('swapIndex2');
  const swapBtn = document.getElementById('swapBtn');
  const newSubjectSelect = document.getElementById('newSubjectSelect');
  const notifyPermBtn = document.getElementById('notifyPermBtn');
  
  function pad(n){ return String(n).padStart(2,'0'); }
  function hhmmToMinutes(str){ if(!str) return null; const m=str.split(':'); if(m.length<2) return null; return parseInt(m[0],10)*60 + parseInt(m[1],10); }
  function formatHMS(ms){ if(ms<0) ms=0; const s=Math.floor(ms/1000)%60; const m=Math.floor(ms/60000)%60; const h=Math.floor(ms/3600000); return `${pad(h)}:${pad(m)}:${pad(s)}`; }
  
  function saveToStorage(key,obj){ localStorage.setItem(key, JSON.stringify(obj)); }
  function loadFromStorage(key){ try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }catch(e){return null;} }
  
  /* ================== App State ================== */
  let currentSchedule = loadFromStorage(SCHEDULE_KEY) || null;
  let slotTimerInterval = null;
  let scheduledTimers = [];
  let autoAdvance = true;
  
  /* Pause */
  let isPaused = false;
  let pauseStartMs = null;
  let pauseRecord = loadFromStorage(STATS_KEY) || {}; // {subject: {totalMinutes, count} }
  
  /* ================== Visual Helpers ================== */
  // Reveal sections on scroll
  const revealObserver = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('show'); revealObserver.unobserve(e.target); }
    });
  },{threshold:0.12});
  document.querySelectorAll('.fadeInUp').forEach(el => revealObserver.observe(el));
  
  /* 3D tilt interaction on sidebar quick card (disable on touch devices) */
  const quickCard = document.getElementById('quickCard');
  if(quickCard && !('ontouchstart' in window)){
    quickCard.addEventListener('mousemove', (ev)=>{
      const rect = quickCard.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width - 0.5;
      const y = (ev.clientY - rect.top) / rect.height - 0.5;
      const inner = quickCard.querySelector('.inner');
      inner.style.transform = `rotateX(${(-y*6).toFixed(2)}deg) rotateY(${(x*8).toFixed(2)}deg) translateZ(6px)`;
      inner.style.boxShadow = `0 20px 60px rgba(30,10,60,0.5), 0 0 30px rgba(138,43,226,0.06)`;
    });
    quickCard.addEventListener('mouseleave', ()=>{ const inner = quickCard.querySelector('.inner'); inner.style.transform='none'; inner.style.boxShadow='none'; });
  }
  
  /* Smooth, high-framerate feeling for small pulses using requestAnimationFrame */
  function pulseElement(el, strength=1.0, duration=700){
    if(!el) return;
    const start = performance.now();
    function frame(t){
      const dt = t - start;
      const p = Math.min(1, dt / duration);
      const scale = 1 + Math.sin(p*Math.PI)*0.02*strength;
      el.style.transform = `scale(${scale})`;
      if(p < 1) requestAnimationFrame(frame);
      else el.style.transform = '';
    }
    requestAnimationFrame(frame);
  }
  
  /* ================== Schedule building & rendering ================== */
  function seededRandom(seed){ let s=0; for(let i=0;i<seed.length;i++){ s = (s * 31 + seed.charCodeAt(i)) >>> 0; } return function(){ s = (s ^ (s<<13)) >>> 0; s = (s ^ (s>>>17)) >>> 0; s = (s ^ (s<<5)) >>> 0; return (s >>> 0) / 4294967295; } }
  function shuffleWithSeed(arr, seed){ const rnd = seededRandom(seed); const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j = Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function pickSubjects(seed){
    const shuffled = shuffleWithSeed(SUBJECT_POOL, seed + '_pool');
    const picks=[]; let sum=0; const TARGET=8*60;
    for(const s of shuffled){ if(sum + s.dur > TARGET) continue; picks.push({...s}); sum += s.dur; if(sum === TARGET) break; }
    if(sum < TARGET){ const smalls = shuffleWithSeed(SUBJECT_POOL.filter(x=>x.dur<=60), seed+'_extras'); let idx=0; while(sum < TARGET){ const item = smalls[idx % smalls.length]; if(sum + item.dur <= TARGET){ picks.push({...item}); sum += item.dur; } else break; idx++; if(idx>200) break; } }
    return picks;
  }
  
  function makeStudySlot(subject,start,finish){
    const el = document.createElement('div'); el.className='slot study tilt';
    const inner = document.createElement('div'); inner.className='inner'; inner.style.display='flex'; inner.style.justifyContent='space-between'; inner.style.alignItems='center';
    const left = document.createElement('div'); left.className='left';
    const strong = document.createElement('strong'); strong.innerText = subject;
    const small = document.createElement('small'); small.innerText = `${toHHMM(start)} - ${toHHMM(finish)}`;
    left.appendChild(strong); left.appendChild(small);
  
    const right = document.createElement('div'); right.className='time rightSmall';
    const small2 = document.createElement('small'); small2.innerText = `${finish-start} دق`;
    right.appendChild(small2);
  
    inner.appendChild(left); inner.appendChild(right);
    el.appendChild(inner);
  
    // show pause stats on the slot
    const rec = pauseRecord[subject];
    if(rec){
      const recEl = document.createElement('div'); recEl.style.fontSize='12px'; recEl.style.color='var(--muted)'; recEl.style.marginTop='6px';
      recEl.innerText = `توقف: ${rec.totalMinutes} دق — مرات: ${rec.count}`;
      left.appendChild(recEl);
    }
  
    // click to toggle done
    el.addEventListener('click', ()=>{ el.classList.toggle('done'); updateSummaries(); pulseElement(el, 1.6, 450); });
  
    // tiny hover 3D (disable on touch)
    if(!('ontouchstart' in window)){
      el.addEventListener('mousemove', (ev)=>{
        const r = el.getBoundingClientRect();
        const x = (ev.clientX - r.left)/r.width - 0.5;
        const y = (ev.clientY - r.top)/r.height - 0.5;
        inner.style.transform = `translateZ(8px) rotateX(${(-y*4).toFixed(2)}deg) rotateY(${(x*6).toFixed(2)}deg)`;
      });
      el.addEventListener('mouseleave', ()=>{ inner.style.transform=''; });
    }
  
    return el;
  }
  function makePrayerSlot(name,start,finish){
    const el = document.createElement('div'); el.className='slot prayer'; el.innerText = `${name} — ${toHHMM(start)} - ${toHHMM(finish)}`; return el;
  }
  function makeBreakSlot(start,finish){ const el = document.createElement('div'); el.className='slot break'; el.innerText = `استراحة — ${toHHMM(start)} - ${toHHMM(finish)}`; return el; }
  
  function toHHMM(mins){ const h = Math.floor(mins/60); const m = mins%60; return `${pad(h)}:${pad(m)}`; }
  
  /* Build schedule (like previous) */
  async function fetchPrayerTimingsForCity(city){
    const country = 'Egypt';
    try{
      const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`;
      const res = await fetch(url);
      const json = await res.json();
      if(json && json.data && json.data.timings){
        const t = json.data.timings;
        return { Fajr: t.Fajr, Dhuhr: t.Dhuhr, Asr: t.Asr, Maghrib: t.Maghrib, Isha: t.Isha };
      }
    }catch(e){ console.warn('prayer API error', e); }
    return null;
  }
  
  async function startDay(){
    // cleanup
    scheduledTimers.forEach(id=>clearTimeout(id)); scheduledTimers=[];
    if(slotTimerInterval) clearInterval(slotTimerInterval);
  
    statusEl && (statusEl.innerText = 'جاري التحضير...');
    statusSmall && (statusSmall.innerText='جاري التحضير...');
  
    const prayerDur = Number(prayerDurationInput.value) || 30;
    const breakMinDefault = Number(breakMinutesInput.value) || 15;
    const seed = (new Date()).toISOString().slice(0,10);
    const subjects = pickSubjects(seed);
    const now = new Date();
    const startMinutes = now.getHours()*60 + now.getMinutes();
    const dayWindowEnd = startMinutes + 8*60;
  
    const headerNote = document.createElement('div'); headerNote.style.color='var(--muted)'; headerNote.style.textAlign='center'; headerNote.style.padding='6px 0';
    headerNote.innerText = `انطلق من: ${pad(now.getHours())}:${pad(now.getMinutes())} — مدة المذاكرة الإجمالية: 8 ساعات`;
    
  
    // prayers
    const apiTimings = await fetchPrayerTimingsForCity((cityInput.value || 'Cairo').trim());
    const prayerNamesMap = { Fajr:'الفجر', Dhuhr:'الظهر', Asr:'العصر', Maghrib:'المغرب', Isha:'العشاء' };
    const prayersList=[];
    if(apiTimings){
      for(const key of ['Fajr','Dhuhr','Asr','Maghrib','Isha']){
        const hh = apiTimings[key];
        const mins = hhmmToMinutes(hh);
        if(mins !== null){ if(mins >= startMinutes && mins < dayWindowEnd) prayersList.push({name:prayerNamesMap[key], mins}); }
      }
      prayersList.sort((a,b)=>a.mins-b.mins);
    }
  
    const schedule=[];
    let current = startMinutes;
    for(let i=0;i<subjects.length && current < dayWindowEnd;i++){
      let subj = subjects[i];
      let remaining = subj.dur;
      while(remaining>0 && current < dayWindowEnd){
        const nextPrayerIndex = prayersList.findIndex(p => p.mins >= current && p.mins < dayWindowEnd);
        const nextPrayer = nextPrayerIndex !== -1 ? prayersList[nextPrayerIndex] : null;
        if(nextPrayer && nextPrayer.mins < current + remaining){
          const studyEnd = nextPrayer.mins;
          if(studyEnd > current){ schedule.push({type:'study', subject:subj.name, start:current, finish:studyEnd}); remaining -= (studyEnd-current); current = studyEnd; }
          schedule.push({type:'prayer', name:nextPrayer.name, start:current, finish:current + prayerDur});
          current += prayerDur; prayersList.splice(nextPrayerIndex,1);
        } else {
          const studyEnd = Math.min(current + remaining, dayWindowEnd);
          if(studyEnd > current){ schedule.push({type:'study', subject:subj.name, start:current, finish:studyEnd}); remaining -= (studyEnd-current); current = studyEnd; } else { remaining = 0; }
        }
      }
      if(i < subjects.length - 1 && current < dayWindowEnd && breakMinDefault > 0){ schedule.push({type:'break', start:current, finish: Math.min(current + breakMinDefault, dayWindowEnd)}); current += breakMinDefault; }
    }
  
    // remaining prayers
    for(const p of prayersList.slice()){
      if(p.mins >= startMinutes && p.mins < dayWindowEnd && p.mins >= current){ if(p.mins > current) current = p.mins; schedule.push({type:'prayer', name:p.name, start:current, finish:current + prayerDur}); current += prayerDur; }
    }
  
    // render
    timelineEl.innerHTML = '';
    timelineEl.appendChild(headerNote);
    schedule.forEach(s=>{
      let el;
      if(s.type==='study'){ el = makeStudySlot(s.subject,s.start,s.finish); }
      else if(s.type==='break'){ el = makeBreakSlot(s.start,s.finish); }
      else if(s.type==='prayer'){ el = makePrayerSlot(s.name,s.start,s.finish); }
      timelineEl.appendChild(el);
    });
  
    currentSchedule = { studySlots: schedule };
    saveToStorage(SCHEDULE_KEY, currentSchedule);
    statusEl && (statusEl.innerText = `اليوم جاري — مواقيت من: ${cityInput.value || 'Cairo'}`);
    statusSmall && (statusSmall.innerText = 'اليوم جاري');
  
    schedulePrayerAlerts();
    startSlotTimer();
    pauseBtn.disabled = false;
  
    // animate progress bar to 0/initial
    timerFill.style.width = '0%';
  }
  
  /* schedule prayer alerts */
  function schedulePrayerAlerts(){
    scheduledTimers.forEach(t=>clearTimeout(t)); scheduledTimers = [];
    const nowMs = Date.now();
    if(!currentSchedule) return;
    currentSchedule.studySlots.forEach(s=>{
      if(s.type === 'prayer'){
        const today = new Date();
        const target = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, s.start, 0, 0);
        const delay = target.getTime() - nowMs;
        if(delay >= 0){ const id = setTimeout(()=>{ triggerPrayerAlert(s.name); }, delay); scheduledTimers.push(id); }
        else { if((Date.now() - target.getTime()) < 60*1000){ triggerPrayerAlert(s.name); } }
      }
    });
  }
  
  function notifyUser(title,body){
    if('Notification' in window && Notification.permission === 'granted'){
      try{ new Notification(title, { body }); }catch(e){}
    }
    try{ pingAudio.currentTime = 0; pingAudio.play().catch(()=>{}); }catch(e){}
  }
  function triggerPrayerAlert(name){
    pauseBanner.innerText = `🕌 حان الآن موعد صلاة ${name}`;
    pauseBanner.style.display = 'block';
    setTimeout(()=>{ if(!isPaused) pauseBanner.style.display = 'none'; }, 7000);
    notifyUser('موعد صلاة', `حان الآن موعد صلاة ${name}`);
  }
  
  /* Slot timer */
  function startSlotTimer(){
    if(!currentSchedule) return;
    if(slotTimerInterval) clearInterval(slotTimerInterval);
    function update(){
      const now = new Date(); const nowMs = now.getTime(); const nowMins = now.getHours()*60 + now.getMinutes();
      // progress (based on marked done slots)
      const studySlots = currentSchedule.studySlots.filter(s=>s.type==='study');
      const totalStudy = studySlots.reduce((a,b)=>a+(b.finish-b.start),0);
      const doneEls = Array.from(timelineEl.querySelectorAll('.slot.study')).filter(el=>el.classList.contains('done')).length;
      const progressPercent = Math.min(100, Math.round((doneEls / Math.max(1, studySlots.length)) * 100));
      timerFill.style.width = progressPercent + '%';
  
      // current slot
      const idx = currentSchedule.studySlots.findIndex(s => s.finish > nowMins);
      let current = null;
      if(idx !== -1) current = currentSchedule.studySlots[idx];
      if(current){
        currentSlotLabel.innerText = `${current.type==='study'? current.subject : (current.type==='prayer'? current.name : 'استراحة')} — ${toHHMM(current.start)}-${toHHMM(current.finish)}`;
        const slotEndMS = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, current.finish, 0, 0).getTime();
        const remainingMs = slotEndMS - nowMs;
        currentTimer.innerText = formatHMS(remainingMs);
        if(remainingMs <= 0){
          if(current.type === 'study' && autoAdvance){
            const studyEls = timelineEl.querySelectorAll('.slot.study');
            const el = studyEls[idx]; if(el && !el.classList.contains('done')) el.classList.add('done');
            updateSummaries();
          }
        }
      } else {
        currentSlotLabel.innerText = 'انتهى جدول الـ8 ساعات';
        currentTimer.innerText = '00:00:00';
        timerFill.style.width = '100%';
      }
    }
    update();
    slotTimerInterval = setInterval(update, 1000);
  }
  
  /* Pause / Resume: toggle only current running study slot (as requested) */
  pauseBtn.addEventListener('click', ()=>{ if(!currentSchedule) return alert('الجدول لم يبدأ بعد.'); if(!isPaused) doPause(); else doResume(); });
  
  function doPause(){
    const now = new Date(); const nowMins = now.getHours()*60 + now.getMinutes();
    const idx = currentSchedule.studySlots.findIndex(s => s.type==='study' && s.start <= nowMins && s.finish > nowMins);
    if(idx === -1) return alert('لا يوجد مادة شغالة الآن لتوقيفها.');
    isPaused = true;
    pauseStartMs = Date.now();
    pauseBtn.innerText = '▶️ استئناف الوقت';
    pauseBanner.innerText = '⏸ تم إيقاف الوقت مؤقتًا'; pauseBanner.style.display = 'block';
    statusSmall.innerText = 'موقوف مؤقتًا';
    if(slotTimerInterval) clearInterval(slotTimerInterval);
    currentSchedule._pausedIndex = idx;
    currentSchedule._pauseAtMinute = nowMins;
    saveToStorage(SCHEDULE_KEY, currentSchedule);
    pulseElement(pauseBtn, 2.2, 500);
  }
  
  function doResume() {
    if (!isPaused) return;
  
    const resumeMs = Date.now();
    const elapsedMs = resumeMs - pauseStartMs; // وقت الوقف بالملي ثانية
  
    // نحدد الوقت للتسجيل والإشعارات بشكل دقيق
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const formattedTime = `${hours > 0 ? hours + ':' : ''}${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  
    const pauseAt = currentSchedule._pauseAtMinute;
    const pausedIndex = currentSchedule._pausedIndex;
    const subjName = currentSchedule.studySlots[pausedIndex].subject;
  
    // تحديث سجل الوقف
    if (!pauseRecord[subjName]) pauseRecord[subjName] = { totalMs: 0, count: 0 };
    pauseRecord[subjName].totalMs += elapsedMs;
    pauseRecord[subjName].count += 1;
    saveToStorage(STATS_KEY, pauseRecord);
  
    // تعديل أوقات الجدول بما يتناسب مع الوقت الحقيقي
    for (let i = 0; i < currentSchedule.studySlots.length; i++) {
      const s = currentSchedule.studySlots[i];
      if (i < pausedIndex) continue;
      else if (i === pausedIndex) {
        if (s.start <= pauseAt && s.finish > pauseAt) {
          s.finish += elapsedMs / 60000; // تحويل ملي ثانية إلى دقيقة داخل الجدول
        } else {
          if (s.start >= pauseAt) {
            s.start += elapsedMs / 60000;
            s.finish += elapsedMs / 60000;
          }
        }
      } else {
        s.start += elapsedMs / 60000;
        s.finish += elapsedMs / 60000;
      }
    }
  
    // تنظيف المؤشرات
    delete currentSchedule._pausedIndex;
    delete currentSchedule._pauseAtMinute;
  
    saveToStorage(SCHEDULE_KEY, currentSchedule);
    saveToStorage(STATS_KEY, pauseRecord);
  
    rebuildTimeline();
    schedulePrayerAlerts();
  
    // إعادة تشغيل المؤقت
    isPaused = false;
    pauseStartMs = null;
    pauseBtn.innerText = '⏸️ إيقاف الوقت';
    pauseBanner.style.display = 'none';
    statusSmall.innerText = 'اليوم جاري';
    startSlotTimer();
    pulseElement(pauseBtn, 1.8, 600);
  
    // إشعار بالوقت الفعلي للوقوف
    showTopNotice(`⏯️ استئناف — مدة الوقف ${formattedTime}`);
  }
  
  
  
  /* rebuild timeline */
  function rebuildTimeline(){
    if(!currentSchedule) return;
    timelineEl.innerHTML = '';
    const headerNote = document.createElement('div'); headerNote.style.color='var(--muted)'; headerNote.style.textAlign='center'; headerNote.style.padding='6px 0';
    headerNote.innerText = 'جدول مُحدّث';
    timelineEl.appendChild(headerNote);
    currentSchedule.studySlots.forEach(s=>{
      let el;
      if(s.type==='study') el = makeStudySlot(s.subject, s.start, s.finish);
      else if(s.type==='break') el = makeBreakSlot(s.start, s.finish);
      else if(s.type==='prayer') el = makePrayerSlot(s.name, s.start, s.finish);
      timelineEl.appendChild(el);
    });
    updateSummaries();
    renderStats();
  }
  
  /* update summary */
  function updateSummaries(){ if(!currentSchedule) return; const studySlots = currentSchedule.studySlots.filter(s=>s.type==='study'); const done = Array.from(timelineEl.querySelectorAll('.slot.study')).filter(el=>el.classList.contains('done')).length; todaySummaryEl.innerText = `ملخص اليوم: ${done} من ${studySlots.length} مادة تم إنجازها`; }
  
  /* start buttons */
  startBtn && startBtn.addEventListener('click', ()=>{ startDay(); });
  startBtn2 && startBtn2.addEventListener('click', ()=>{ startDay(); });
  
  /* regen (fixed: seed is now variable so it can run multiple times) */
  regenBtn && regenBtn.addEventListener('click', ()=>{
    if(!currentSchedule) return alert('الجدول لم يبدأ بعد.');
    const seed = (new Date()).toISOString() + '_regen_' + (Math.random().toString(36).slice(2,8));
    const pickedSubjects = pickSubjects(seed);
    const breakMin = Number(breakMinutesInput.value) || 15;
    let current = currentSchedule.studySlots[0]?.start || (new Date().getHours()*60 + new Date().getMinutes());
    const prayers = currentSchedule.studySlots.filter(s=>s.type==='prayer');
    const newSched=[];
    for(let i=0;i<pickedSubjects.length;i++){
      let subj = pickedSubjects[i]; let remaining = subj.dur;
      while(remaining>0){
        const nextPrayer = prayers.find(p=>p.start >= current);
        if(nextPrayer && nextPrayer.start < current + remaining){
          const sEnd = nextPrayer.start; if(sEnd > current) newSched.push({type:'study', subject:subj.name, start:current, finish:sEnd}); remaining -= (sEnd-current); current = sEnd;
          newSched.push({...nextPrayer}); current += nextPrayer.finish - nextPrayer.start;
        } else { const sEnd = current + remaining; newSched.push({type:'study', subject:subj.name, start:current, finish:sEnd}); current = sEnd; remaining = 0; }
      }
      if(i < pickedSubjects.length-1) { newSched.push({type:'break', start:current, finish:current + breakMin}); current += breakMin; }
    }
    currentSchedule.studySlots = newSched;
    saveToStorage(SCHEDULE_KEY, currentSchedule);
    rebuildTimeline();
    schedulePrayerAlerts();
    showTopNotice('🔁 تم إعادة توزيع المواد');
  });
  
  /* save/load/export/import */
  saveScheduleBtn && saveScheduleBtn.addEventListener('click', ()=>{ if(!currentSchedule) return alert('لا يوجد جدول لحفظه'); saveToStorage(SCHEDULE_KEY, currentSchedule); showTopNotice('💾 تم حفظ الجدول محليًا'); });
  loadScheduleBtn && loadScheduleBtn.addEventListener('click', ()=>{ const loaded = loadFromStorage(SCHEDULE_KEY); if(!loaded) return alert('لا يوجد جدول محفوظ'); applyLoadedSchedule(loaded); showTopNotice('📂 تم تحميل الجدول'); });
  exportBtn && exportBtn.addEventListener('click', ()=>{ if(!currentSchedule) return alert('لا يوجد جدول للتصدير'); const data = JSON.stringify(currentSchedule, null, 2); const blob = new Blob([data], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `nazem_schedule_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); });
  
  if(importFile){
    importFile.addEventListener('change', (e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload = ()=>{ try{ const parsed = JSON.parse(r.result); applyLoadedSchedule(parsed); showTopNotice('✅ تم استيراد الجدول'); }catch(err){ alert('ملف غير صالح'); } }; r.readAsText(f); });
  }
  
  /* apply loaded schedule */
  function applyLoadedSchedule(loaded){ if(!loaded || !loaded.studySlots) return alert('ملف غير صالح'); currentSchedule = loaded; rebuildTimeline(); startSlotTimer(); schedulePrayerAlerts(); pauseBtn.disabled = false; }
  
  /* render stats */
  function renderStats(){
    statsContent.innerHTML = '';
    if(!currentSchedule){ statsContent.innerHTML = '<div style="color:var(--muted)">لا يوجد جدول بعد. ابدأ اليوم لتظهر الإحصائيات.</div>'; return; }
    const studies = currentSchedule.studySlots.filter(s=>s.type==='study');
    const subjectsMap = {};
    studies.forEach((s, idx)=>{
      const name = s.subject; const dur = s.finish - s.start;
      if(!subjectsMap[name]) subjectsMap[name] = { total:0, done:0 };
      subjectsMap[name].total += dur;
      const el = timelineEl.querySelectorAll('.slot.study')[idx];
      if(el && el.classList.contains('done')) subjectsMap[name].done += dur;
    });
  
    const container = document.createElement('div'); container.className = 'stats-grid';
    Object.keys(subjectsMap).sort().forEach(name=>{
      const info = subjectsMap[name];
      const percent = info.total>0 ? Math.round((info.done / info.total)*100) : 0;
      const rec = pauseRecord[name] || { totalMinutes:0, count:0 };
      const card = document.createElement('div'); card.className='stat-card';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <strong>${name}</strong>
          <small style="color:var(--muted)">${info.done} / ${info.total} دق — ${percent}%</small>
        </div>
        <div style="margin-top:8px" class="progress"><i style="width:0%"></i></div>
        <div style="margin-top:8px;color:var(--muted);font-size:13px">
          توقف إجمالي: <strong>${rec.totalMinutes} دق</strong> — مرات التوقف: <strong>${rec.count}</strong>
        </div>
      `;
      container.appendChild(card);
      // animate progress bar after insert
      setTimeout(()=>{ const bar = card.querySelector('.progress > i'); bar.style.width = percent + '%'; }, 100);
    });
  
    // summary
    const totalPaused = Object.values(pauseRecord).reduce((a,b)=>a+(b.totalMinutes||0),0);
    const totalPauseCount = Object.values(pauseRecord).reduce((a,b)=>a+(b.count||0),0);
    const summary = document.createElement('div'); summary.className='stat-card';
    summary.innerHTML = `<strong>ملخص إيقاف اليوم</strong><div style="color:var(--muted);margin-top:6px">إجمالي وقت التوقف: <strong>${totalPaused} دقيقة</strong> — إجمالي مرات التوقف: <strong>${totalPauseCount}</strong></div>`;
    statsContent.appendChild(summary);
    statsContent.appendChild(container);
  }
  
  /* Goals */
  function loadGoals(){ const g = loadFromStorage(GOALS_KEY) || []; renderGoals(g); }
  function renderGoals(arr){ goalsListEl.innerHTML=''; arr.forEach((g,i)=>{ const div=document.createElement('div'); div.className='stat-card'; div.style.display='flex'; div.style.justifyContent='space-between'; div.style.alignItems='center'; div.style.marginBottom='8px'; div.innerHTML = `<div>${g}</div><div style="display:flex;gap:8px"><button class="btn" data-i="${i}" onclick="toggleGoal(${i})">✔</button><button class="btn" data-i="${i}" onclick="deleteGoal(${i})">🗑</button></div>`; goalsListEl.appendChild(div); }); }
  window.toggleGoal = function(i){ const arr = loadFromStorage(GOALS_KEY) || []; arr.splice(i,1); saveToStorage(GOALS_KEY, arr); renderGoals(arr); }
  window.deleteGoal = function(i){ const arr = loadFromStorage(GOALS_KEY) || []; arr.splice(i,1); saveToStorage(GOALS_KEY, arr); renderGoals(arr); }
  document.getElementById('addGoal').addEventListener('click', ()=>{ const val=newGoalInput.value.trim(); if(!val) return alert('اكتب هدفًا'); const arr=loadFromStorage(GOALS_KEY)||[]; arr.push(val); saveToStorage(GOALS_KEY, arr); newGoalInput.value=''; renderGoals(arr); showTopNotice('🎯 تم إضافة هدف'); });
  
  /* Swap subjects implementation (fixed) */
  if(swapBtn){
    swapBtn.addEventListener('click', ()=>{
      if(!currentSchedule) return alert('لا يوجد جدول بعد.');
      const i1 = Number(swapIndex1.value);
      const i2 = Number(swapIndex2.value);
      if(!i1 || !i2) return alert('ادخل رقمي المادتين المراد تبديلهما.');
      // get list of study slots in order
      const studySlots = currentSchedule.studySlots.filter(s=>s.type==='study');
      if(i1 < 1 || i1 > studySlots.length || i2 < 1 || i2 > studySlots.length) return alert('أرقام المواد غير صحيحة.');
      // find real indices in currentSchedule.studySlots
      const target1 = studySlots[i1-1];
      const target2 = studySlots[i2-1];
      const idx1 = currentSchedule.studySlots.findIndex(s => s === target1);
      const idx2 = currentSchedule.studySlots.findIndex(s => s === target2);
      const newSubject = newSubjectSelect.value || null;
  
      // perform swap while preserving times
      const newSlots = currentSchedule.studySlots.slice();
      // optionally replace subject on second slot
      if(newSubject){
        newSlots[idx2] = {...newSlots[idx2], subject: newSubject};
      }
      // swap full slot objects (times will move with the slot)
      const tmp = newSlots[idx1];
      newSlots[idx1] = newSlots[idx2];
      newSlots[idx2] = tmp;
  
      currentSchedule.studySlots = newSlots;
      saveToStorage(SCHEDULE_KEY, currentSchedule);
      rebuildTimeline();
      showTopNotice('🔀 تم تبديل المواد');
      // clear inputs
      swapIndex1.value=''; swapIndex2.value=''; newSubjectSelect.value='';
    });
  }
  
  /* small UI helpers */
  function showTopNotice(text, timeout=3000){ pauseBanner.innerText = text; pauseBanner.style.display = 'block'; setTimeout(()=>{ if(!isPaused) pauseBanner.style.display='none'; }, timeout); pulseElement(pauseBanner,0.8,400); }
  
  /* tiny utilities */
  setInterval(()=>{ renderStats(); }, 6000);
  
  /* shortcuts */
  window.addEventListener('keydown', (e)=>{
    if(e.code==='Space'){
      e.preventDefault();
      const firstStudy = timelineEl.querySelector('.slot.study');
      if(firstStudy){ firstStudy.classList.toggle('done'); updateSummaries(); pulseElement(firstStudy,1.2,360); }
    }
    if(e.key.toLowerCase()==='r') regenBtn && regenBtn.click();
  });
  
  /* on load */
  window.addEventListener('load', ()=>{
    const saved = loadFromStorage(SCHEDULE_KEY); if(saved){ currentSchedule = saved; rebuildTimeline(); statusEl && (statusEl.innerText = 'جدول محفوظ — يمكنك استعادته'); }
    pauseRecord = loadFromStorage(STATS_KEY) || pauseRecord;
    renderStats();
    loadGoals();
    // set nav links active effect
    document.querySelectorAll('.nav-link').forEach(a=>{ a.addEventListener('click', (e)=>{ e.preventDefault(); const id = a.getAttribute('href').slice(1); const el = document.getElementById(id); if(el) el.scrollIntoView({behavior:'smooth'}); pulseElement(a,0.6,200); }); });
  });
  