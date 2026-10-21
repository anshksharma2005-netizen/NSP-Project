let state={user:null,token:null};
let assistantHistory=[];
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
async function api(url,opt={}){let headers={'Content-Type':'application/json',...(opt.headers||{})};if(state.token)headers.Authorization='Bearer '+state.token;let r=await fetch(url,{...opt,headers});let j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j}
async function login(role){try{let uid=role==='doctor'?'doctorUser':'patientUser';let pid=role==='doctor'?'doctorPass':'patientPass';let j=await api('/api/login',{method:'POST',body:JSON.stringify({username:$(uid).value,email:$(uid).value,password:$(pid).value,role})});state.user=j.user;state.token=j.token;sessionStorage.user=JSON.stringify(state.user);sessionStorage.token=state.token;start()}catch(e){$('loginErr').textContent=e.message}}
function start(){ unlockNotificationAudio(); document.body.dataset.role=state.user.role; $('login').classList.add('hidden');$('app').classList.remove('hidden');$('who').textContent=state.user.full_name+' • '+state.user.role;document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>show(b.dataset.page));$('doctorNav').classList.toggle('hidden',state.user.role==='patient');$('patientNav').classList.toggle('hidden',state.user.role!=='patient');initNotifications();if(state.user.role==='patient'){document.querySelectorAll('#patientNav .nav').forEach(b=>b.classList.remove('hidden'));$('pageTitle').textContent='My Patient Portal';patientPortal();return}show('dashboard')}
let notificationTimer=null;
let notificationBaseline=false;
let seenNotificationIds=new Set();
let notificationAudioCtx=null;
let notificationSoundEnabled=true;
function unlockNotificationAudio(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!notificationAudioCtx)notificationAudioCtx=new AC();
    if(notificationAudioCtx.state==='suspended')notificationAudioCtx.resume().catch(()=>{});
  }catch(e){}
}
function playNotificationSound(kind='default'){
  if(!notificationSoundEnabled)return;
  try{
    unlockNotificationAudio();
    if(!notificationAudioCtx)return;
    const ctx=notificationAudioCtx;
    const now=ctx.currentTime;
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.type='sine';
    const base=kind==='message'?880:(kind.includes('appointment')?660:740);
    osc.frequency.setValueAtTime(base,now);
    osc.frequency.exponentialRampToValueAtTime(base*1.18,now+0.10);
    gain.gain.setValueAtTime(0.0001,now);
    gain.gain.exponentialRampToValueAtTime(0.075,now+0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+0.34);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now); osc.stop(now+0.36);
    const osc2=ctx.createOscillator(); const gain2=ctx.createGain();
    osc2.type='sine'; osc2.frequency.value=base*1.35;
    gain2.gain.setValueAtTime(0.0001,now+0.10);
    gain2.gain.exponentialRampToValueAtTime(0.045,now+0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001,now+0.42);
    osc2.connect(gain2); gain2.connect(ctx.destination); osc2.start(now+0.10); osc2.stop(now+0.44);
  }catch(e){}
}
function toggleNotificationSound(){
  notificationSoundEnabled=!notificationSoundEnabled;
  localStorage.notificationSound=notificationSoundEnabled?'on':'off';
  updateNotificationSoundButton();
  if(notificationSoundEnabled){unlockNotificationAudio();playNotificationSound('default');}
}
function updateNotificationSoundButton(){
  const b=$('notificationSoundBtn'); if(!b)return;
  b.textContent=notificationSoundEnabled?'🔊':'🔇';
  b.title=notificationSoundEnabled?'Notification sound on — click to mute':'Notification sound off — click to enable';
  b.setAttribute('aria-label',b.title);
}
function initNotifications(){
  notificationSoundEnabled=localStorage.notificationSound!=='off';
  updateNotificationSoundButton();
  loadNotifications();
  if(notificationTimer)clearInterval(notificationTimer);
  notificationTimer=setInterval(loadNotifications,8000);
}
function notificationIcon(type){return type==='message'?'✉':(type.includes('appointment')?'▣':(type==='patient_deleted'?'♲':'•'))}
async function loadNotifications(){
  if(!state.token)return;
  try{
    const data=await api('/api/notifications');
    const items=data.notifications||[];
    if(notificationBaseline){
      const fresh=items.filter(n=>!n.read_at && !seenNotificationIds.has(Number(n.id)));
      if(fresh.length){
        const newest=fresh[0];
        playNotificationSound(newest.type||'default');
        if(newest.type==='patient_deleted' && state.user.role==='doctor' && !$('content').classList.contains('hidden')){
          const active=document.querySelector('.nav.active');
          if(active && active.dataset.page==='dashboard') dashboard();
        }
      }
    }
    items.forEach(n=>seenNotificationIds.add(Number(n.id)));
    notificationBaseline=true;
    const badge=$('notificationBadge');
    if(badge){badge.textContent=data.unread||0;badge.classList.toggle('hidden',!(data.unread>0));}
    const panel=$('notificationPanel');
    if(panel && !panel.classList.contains('hidden'))renderNotifications(items);
  }catch(e){}
}
function renderNotifications(items){
  const panel=$('notificationPanel'); if(!panel)return;
  panel.innerHTML=`<div class="notification-head"><b>Notifications</b><button class="link-btn" onclick="markAllNotifications(event)">Mark all read</button></div>${items.length?items.map(n=>`<button class="notification-item ${n.read_at?'':'unread-item'}" onclick="openNotification(${n.id},'${esc(n.entity_type||'')}')"><span class="notification-icon">${notificationIcon('${n.type}')}</span><span><b>${esc(n.title)}</b><small>${esc(n.message)}</small><em>${esc(n.created_at||'')}</em></span></button>`).join(''):'<div class="empty notification-empty">No notifications.</div>'}`;
}
async function toggleNotifications(){
  const panel=$('notificationPanel'); if(!panel)return;
  panel.classList.toggle('hidden');
  if(!panel.classList.contains('hidden')){const data=await api('/api/notifications');renderNotifications(data.notifications||[]);}
}
async function markAllNotifications(e){e.stopPropagation();await api('/api/notifications',{method:'PUT',body:JSON.stringify({all:true})});await loadNotifications();if($('notificationPanel'))renderNotifications([])}
async function openNotification(id,type){
  await api('/api/notifications',{method:'PUT',body:JSON.stringify({id})});
  if($('notificationPanel'))$('notificationPanel').classList.add('hidden');
  await loadNotifications();
  if(type==='message')show('messages');else if(type==='appointment')show('appointments');
}
document.addEventListener('click',unlockNotificationAudio,{once:false,passive:true});
document.addEventListener('keydown',unlockNotificationAudio,{once:false,passive:true});
function logout(){sessionStorage.clear();location.reload()}
async function show(page){document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));let titles={dashboard:'Doctor Dashboard',patients:'Patients',cases:'Case Records',appointments:state.user.role==='patient'?'My Appointments':'Appointments',newcase:'Create Patient Case',myrecord:'My Health Record',messages:state.user.role==='patient'?'Messages':'Patient Messages', 'ai-check':'AI Symptom Check', 'ai-assistant':'AI Assistant'};$('pageTitle').textContent=titles[page]||'Patient Case Taking'; if(page==='dashboard')return dashboard();if(page==='patients')return patients();if(page==='cases')return cases();if(page==='newcase')return newcase();if(page==='appointments')return appointments();if(page==='myrecord')return patientPortal();if(page==='messages')return messages();if(page==='ai-check')return aiCheck();if(page==='ai-assistant')return aiAssistant()}
async function dashboard(){let s=await api('/api/stats'),c=await api('/api/cases');let ap=[];if(state.user.role==='doctor')ap=await api('/api/appointments');let pending=ap.filter(a=>a.status==='Requested').length;let apCard=state.user.role==='doctor'?`<div class="stat"><div class="l">Appointment Requests</div><div class="n">${pending}</div></div>`:'';$('content').innerHTML=`<div class="cards"><div class="stat"><div class="l">Registered Patients</div><div class="n">${s.patients}</div><small>Only patients assigned to you</small></div><div class="stat"><div class="l">Total Cases</div><div class="n">${s.cases}</div></div><div class="stat"><div class="l">Completed Summaries</div><div class="n">${s.completed}</div></div><div class="stat"><div class="l">Draft Cases</div><div class="n">${s.drafts}</div></div>${apCard}</div><div class="grid2"><div class="panel"><h3>Recent Case Records</h3>${caseTable(c.slice(0,7))}</div><div class="panel"><h3>Clinical Workflow</h3><div class="summary"><b>1. Registration</b><br>→ <b>2. Case history</b><br>→ <b>3. Clinical notes</b><br>→ <b>4. Case summary</b><br>→ <b>5. Doctor review</b></div>${state.user.role==='doctor'&&ap.length?`<div class="summary" style="margin-top:14px"><b>Appointments assigned to you:</b> ${ap.length}<br><button class="btn secondary" style="margin-top:8px" onclick="show('appointments')">Open Appointments</button></div>`:''}<div class="warning">Case summaries are for documentation support and should be reviewed before clinical use.</div></div></div>`}

function caseTable(rows){if(!rows.length)return '<div class="empty">No case records yet.</div>';return `<div class="table-wrap"><table class="table"><thead><tr><th>Case</th><th>Patient</th><th>Complaint</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>#${x.id}</td><td><b>${esc(x.name)}</b><br><small>${esc(x.patient_code)}</small></td><td>${esc(x.chief_complaint||'—')}</td><td><span class="pill">${esc(x.status)}</span></td><td><button class="btn" onclick="caseDetail(${x.id})">Open</button></td></tr>`).join('')}</tbody></table></div>`}
async function cases(){let rows=await api('/api/cases');$('content').innerHTML=`<div class="panel"><div class="toolbar"><div><h3 style="margin:0">Case Records</h3><small>Referred cases remain available to the original doctor as view-only records.</small></div></div>${caseTable(rows)}</div>`}
async function patients(q=''){let rows=await api('/api/patients'+(q?`?q=${encodeURIComponent(q)}`:''));$('content').innerHTML=`<div class="panel"><div class="toolbar"><input id="patientSearch" placeholder="Search name, ID or phone..." value="${esc(q)}" oninput="patients(this.value)"><button class="primary" onclick="newPatient()">＋ Register Patient</button></div>${rows.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Patient</th><th>Code</th><th>Gender / DOB</th><th>Phone</th><th>Blood</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${esc(p.name)}</b>${Number(p.referred_view)?`<br><small class="muted">Referred patient — view only</small>`:(Number(p.appointment_access)?`<br><small class="muted">Appointment with you</small>`:'')}</td><td>${esc(p.patient_code)}</td><td>${esc(p.gender||'—')} / ${esc(p.dob||'—')}</td><td>${esc(p.phone||'—')}</td><td>${esc(p.blood_group||'—')}</td><td><button class="btn" onclick="patientDetail(${p.id})">View</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No patients found.</div>'}</div>`}
function toggleReferralField(selectId,inputId){const sel=$(selectId), input=$(inputId), wrap=input?.parentElement; if(!sel||!input)return; const yes=sel.value==='Yes'; wrap?.classList.toggle('hidden',!yes); input.required=yes; if(!yes)input.value='';}
function referralBlock(p){return `<div class="field full"><label>Referral Status</label><div>${p.referral_complete===0?'<span class="pill">Referral details pending</span>':(p.referred_by_doctor==='Yes'?`<b>Yes</b> — Referred by: ${esc(p.referring_doctor_name||'')}`:'<b>No</b> — Patient reports no referral by another doctor')}</div></div>`}
function newPatient(){ $('content').innerHTML=`<div class="panel"><h3>Patient Registration</h3><form onsubmit="savePatient(event)"><div class="form-grid"><div class="field"><label>Full Name *</label><input name="name" required></div><div class="field"><label>Date of Birth</label><input name="dob" type="date"></div><div class="field"><label>Gender</label><select name="gender"><option></option><option>Male</option><option>Female</option><option>Other</option></select></div><div class="field"><label>Blood Group</label><input name="blood_group" placeholder="e.g. B+"></div><div class="field"><label>Phone</label><input name="phone"></div><div class="field"><label>Email</label><input name="email" type="email"></div><div class="field full"><label>Were you referred by another doctor? *</label><select name="referred_by_doctor" required onchange="toggleReferralField('npReferred','npRefDoctor')" id="npReferred"><option value="">Select Yes or No</option><option>Yes</option><option>No</option></select></div><div class="field full hidden" id="npRefDoctorWrap"><label>Referring Doctor Name *</label><input id="npRefDoctor" name="referring_doctor_name" placeholder="Enter referring doctor's name"></div><div class="field full"><label>Address</label><input name="address"></div><div class="field full"><label>Emergency Contact</label><input name="emergency_contact"></div></div><div class="warning">The referral question is compulsory. Select <b>Yes</b> first to enter the referring doctor's name.</div><div class="form-actions"><button type="button" class="ghost" onclick="patients()">Cancel</button><button class="primary">Save Patient</button></div></form></div>`}
async function savePatient(e){e.preventDefault();let f=new FormData(e.target);let b=Object.fromEntries(f);let r=await api('/api/patients',{method:'POST',body:JSON.stringify(b)});playNotificationSound('patient_registered');alert('Patient registered successfully.');await patientDetail(r.id)}
async function patientDetail(id){
  let x=await api('/api/patients/'+id);
  let viewOnly=x.access_type==='referring_doctor';
  let appointmentDoctor=x.access_type==='appointment_doctor';
  let canCreate=state.user.role==='doctor' && (x.access_type==='current_owner'||appointmentDoctor);
  let notice=viewOnly?'<div class="warning" style="margin-top:12px">You previously referred this patient. The complete patient history remains visible to you, but this profile is <b>VIEW ONLY</b>. The receiving doctor is the current case owner.</div>':(appointmentDoctor?'<div class="summary" style="margin-top:12px">This patient has an active appointment with you. You can review the complete history and create a new case for this encounter.</div>':'');
  let deleteButton=state.user.role==='admin'?`<button class="danger" onclick="deletePatient(${id},false)">Delete Patient</button>`:'';
  let actions=x.access_type==='current_owner'?`<button class="btn secondary" onclick="editPatient(${id})">Edit Patient</button>${canCreate?`<button class="primary" onclick="newcase(${id})">＋ New Case</button>`:''}${deleteButton}`:(canCreate?`<button class="primary" onclick="newcase(${id})">＋ New Case</button>`:'')+deleteButton;
  $('content').innerHTML=`<div class="panel"><div class="patient-head"><div><div class="eyebrow">PATIENT PROFILE</div><h3>${esc(x.patient.name)}</h3><span class="pill">${esc(x.patient.patient_code)}</span>${notice}</div><div class="form-actions" style="margin:0">${actions}</div></div><div class="form-grid" style="margin-top:18px">${referralBlock(x.patient)}<div class="field"><label>Registered Doctor</label><div>${esc(x.patient.doctor_name||'Unassigned')}</div></div><div class="field"><label>Gender / DOB</label><div>${esc(x.patient.gender||'—')} / ${esc(x.patient.dob||'—')}</div></div><div class="field"><label>Phone</label><div>${esc(x.patient.phone||'—')}</div></div><div class="field"><label>Blood Group</label><div>${esc(x.patient.blood_group||'—')}</div></div><div class="field"><label>Emergency Contact</label><div>${esc(x.patient.emergency_contact||'—')}</div></div><div class="field full"><label>Address</label><div>${esc(x.patient.address||'—')}</div></div></div><hr style="border:0;border-top:1px solid var(--line);margin:25px 0"><h3>Case History</h3>${caseTable(x.cases.map(c=>({...c,name:x.patient.name,patient_code:x.patient.patient_code})))}</div>`;
}
async function editPatient(id){let x=state.user.role==='patient'?await api('/api/my-record'):await api('/api/patients/'+id);let p=x.patient;let ref=p.referred_by_doctor||'';$('content').innerHTML=`<div class="panel"><div class="eyebrow">EDIT PATIENT PROFILE</div><h3>${esc(p.name)}</h3><span class="pill">${esc(p.patient_code)}</span><form onsubmit="updatePatient(event,${id},'doctor')"><div class="form-grid" style="margin-top:18px"><div class="field"><label>Full Name *</label><input name="name" value="${esc(p.name)}" required></div><div class="field"><label>Date of Birth</label><input name="dob" type="date" value="${esc(p.dob)}"></div><div class="field"><label>Gender</label><select name="gender"><option></option><option ${p.gender==='Male'?'selected':''}>Male</option><option ${p.gender==='Female'?'selected':''}>Female</option><option ${p.gender==='Other'?'selected':''}>Other</option></select></div><div class="field"><label>Blood Group</label><input name="blood_group" value="${esc(p.blood_group)}"></div><div class="field"><label>Phone</label><input name="phone" value="${esc(p.phone)}"></div><div class="field"><label>Email</label><input name="email" type="email" value="${esc(p.email)}"></div><div class="field full"><label>Were you referred by another doctor? *</label><select name="referred_by_doctor" id="editReferred" required onchange="toggleReferralField('editReferred','editRefDoctor')"><option value="">Select Yes or No</option><option ${ref==='Yes'?'selected':''}>Yes</option><option ${ref==='No'?'selected':''}>No</option></select></div><div class="field full ${ref==='Yes'?'':'hidden'}" id="editRefDoctorWrap"><label>Referring Doctor Name *</label><input id="editRefDoctor" name="referring_doctor_name" value="${esc(p.referring_doctor_name||'')}" ${ref==='Yes'?'required':''}></div><div class="field full"><label>Address</label><input name="address" value="${esc(p.address)}"></div><div class="field full"><label>Emergency Contact</label><input name="emergency_contact" value="${esc(p.emergency_contact)}"></div></div><div class="warning">The referral question is compulsory. Selecting <b>Yes</b> makes the referring doctor name mandatory.</div><div class="form-actions"><button type="button" class="ghost" onclick="state.user.role==='patient'?patientPortal():patientDetail(${id})">Cancel</button><button class="primary">Save Patient Details</button></div></form></div>`}async function updatePatient(e,id,source){e.preventDefault();let b=Object.fromEntries(new FormData(e.target));let r=await api('/api/patients/'+id,{method:'PUT',body:JSON.stringify(b)});if(state.user.role==='patient'){state.user.full_name=r.patient.name;state.user.username=r.patient.email||state.user.username;sessionStorage.user=JSON.stringify(state.user);patientPortal()}else patientDetail(id)}

async function aiAssistant(patientId=null){
  assistantHistory=[];
  let patientOptions='';
  if(state.user.role!=='patient'){
    try{
      let rows=await api('/api/patients');
      patientOptions=rows.map(p=>`<option value="${p.id}">${esc(p.name)} — ${esc(p.patient_code)}${p.doctor_name?` · ${esc(p.doctor_name)}`:''}</option>`).join('');
    }catch(e){}
  }
  $('content').innerHTML=`<div class="grid2"><div class="panel"><div class="eyebrow">CODESTORM AI</div><h3>Clinical Assistant</h3><p class="muted">Ask about documentation, case summaries, warning signs, or questions to discuss with a qualified doctor.</p>${state.user.role!=='patient'?`<div class="field full"><label>Patient context (optional)</label><select id="assistantPatient"><option value="">No patient selected</option>${patientOptions}</select></div>`:`<div class="summary" style="margin-bottom:14px"><b>Your record can be used as context.</b><br>The assistant only receives your own recorded patient information.</div>`}<div id="assistantThread" class="message-thread" style="min-height:220px;max-height:460px;overflow:auto"><div class="empty">Start a conversation with the CODESTORM AI Assistant.</div></div><form onsubmit="sendAIAssistant(event)" style="margin-top:14px"><div class="field full"><label>Your question</label><textarea id="assistantMessage" rows=4 maxlength=5000 required placeholder="Example: Summarize the important points in this case..."></textarea></div><div class="form-actions"><button type="button" class="ghost" onclick="assistantHistory=[];aiAssistant()">Clear</button><button class="primary">Ask AI Assistant</button></div></form></div><div class="panel"><div class="eyebrow">SAFETY</div><h3>AI support, not diagnosis</h3><div class="summary">The assistant is designed to support documentation and understanding. It must not be used as a substitute for clinical examination, diagnosis, emergency care, or prescribing.</div><div class="warning" style="margin-top:14px">If symptoms are severe, sudden, or worsening, seek appropriate medical attention.</div><div class="summary" style="margin-top:14px"><b>AI connection:</b> The project can use the OpenAI Responses API when <code>OPENAI_API_KEY</code> is configured. Without a key, CODESTORM uses a safe local fallback so the feature still works offline.</div></div></div>`;
}
function renderAssistantMessage(role,text){let thread=$('assistantThread');if(!thread)return;let empty=thread.querySelector('.empty');if(empty)empty.remove();let div=document.createElement('div');div.className='summary';div.style.margin='10px 0';div.innerHTML=`<b>${role==='user'?'You':'CODESTORM AI'}</b><div style="white-space:pre-wrap;margin-top:6px">${esc(text)}</div>`;thread.appendChild(div);thread.scrollTop=thread.scrollHeight;}
async function sendAIAssistant(e){
  e.preventDefault();
  let input=$('assistantMessage');let message=input.value.trim();if(!message)return;
  let patientId=state.user.role==='patient'?null:($('assistantPatient')?.value||null);
  renderAssistantMessage('user',message);input.value='';
  try{
    let r=await api('/api/ai-assistant',{method:'POST',body:JSON.stringify({message,patient_id:patientId,history:assistantHistory})});
    assistantHistory.push({role:'user',content:message},{role:'assistant',content:r.answer});
    renderAssistantMessage('assistant',r.answer);
  }catch(err){renderAssistantMessage('assistant','The assistant could not respond right now. '+err.message)}
}
async function aiCheck(){
  $('content').innerHTML=`<div class="grid2"><div class="panel"><div class="eyebrow">SYMPTOM REVIEW</div><h3>Symptom & Warning Sign Check</h3><p class="muted">Describe what you are experiencing. The system checks the entered text against a small set of predefined warning-sign patterns.</p><form id="aiCheckForm" onsubmit="submitAICheck(event)"><div class="field full"><label>What symptoms are you having? *</label><textarea name="symptoms" required rows="7" placeholder="Example: fever for 2 days, cough, tiredness..."></textarea></div><div class="field full"><label>Medical history (optional)</label><textarea name="medical_history" rows="4" placeholder="Existing conditions, previous illness, etc."></textarea></div><div class="field full"><label>Other details (optional)</label><textarea name="clinical_notes" rows="4" placeholder="Duration, severity, medicines, anything else you want to mention..."></textarea></div><button class="primary">Check symptoms</button></form></div><div class="panel"><div class="eyebrow">IMPORTANT</div><h3>What this result means</h3><div class="summary">This is a documentation aid, not a medical diagnosis. It cannot confirm a disease or prescribe a cure. If the result shows an urgent flag, seek prompt medical assessment. For treatment decisions, consult a qualified doctor.</div><div id="patientAIResult" class="warning">Your result will appear here after you submit your symptoms.</div></div></div>`
}
async function submitAICheck(e){
  e.preventDefault();
  try{
    let b=Object.fromEntries(new FormData(e.target));
    let r=await api('/api/ai-detect',{method:'POST',body:JSON.stringify(b)});
    let box=$('patientAIResult');
    box.innerHTML=`<h3>${esc(r.level)}</h3><p>${esc(r.message)}</p>${r.matched&&r.matched.length?`<p><b>Detected warning patterns:</b> ${r.matched.map(esc).join(', ')}</p>`:''}<p><b>Next step:</b> ${r.level==='URGENT FLAG'?'Seek prompt clinical assessment, especially if symptoms are severe or worsening.':'Consider discussing persistent or worsening symptoms with a qualified doctor.'}</p>`;
  }catch(e){$('patientAIResult').textContent=e.message}
}
async function messages(patientId=null, doctorId=null, accessMode=null){
  try{
    if(state.user.role==='patient'){
      let x=await api('/api/messages'+(doctorId?`?doctor_id=${encodeURIComponent(doctorId)}`:''));
      let selector=x.doctors&&x.doctors.length?`<div class="field full"><label>Doctor conversation</label><select onchange="messages(null,this.value)">${x.doctors.map(d=>`<option value="${d.id}" ${Number(d.id)===Number(x.doctor_id)?'selected':''}>${esc(d.full_name)}</option>`).join('')}</select><small class="muted">You can message your registered doctor or any doctor you have an active appointment with.</small></div>`:'';
      let doctor=x.doctor_id?`<b>${esc(x.doctor_name||'Doctor')}</b>`:'<span class="muted">No doctor available</span>';
      $('content').innerHTML=`<div class="panel"><div class="eyebrow">PATIENT COMMUNICATION</div><h3>Messages with ${doctor}</h3>${selector}${x.doctor_id?`<div class="message-thread" id="messageThread">${x.messages.length?x.messages.map(messageBubble).join(''):'<div class="empty">No messages yet. You can send a message to this doctor.</div>'}</div><form class="message-compose" onsubmit="sendMessage(event,null,${x.doctor_id})"><textarea name="message" rows="3" maxlength="2000" required placeholder="Write a message to your doctor..."></textarea><div class="form-actions"><small class="muted">For routine communication. This is not an emergency service.</small><button class="primary">Send Message</button></div></form>`:`<div class="warning">Book an appointment with a doctor before starting a conversation.</div>`}</div>`;
      scrollMessageThread();
    }else if(state.user.role==='doctor'){
      let list=await api('/api/messages');
      if(!patientId && list.length) patientId=list[0].patient_id;
      let thread=patientId?await api('/api/messages?patient_id='+encodeURIComponent(patientId)+(accessMode?'&access='+encodeURIComponent(accessMode):'')):null;
      $('content').innerHTML=`<div class="message-layout"><div class="panel message-list"><div class="eyebrow">PATIENT MESSAGES</div><h3>Patients & appointments</h3>${list.length?list.map(p=>{let mode=Number(p.referred_view)?'referral':(Number(p.appointment_access)?'appointment':'owner');return `<button class="message-contact ${Number(p.patient_id)===Number(patientId)&&mode===(accessMode||'owner')?'selected':''}" onclick="messages(${p.patient_id},null,'${mode}')"><span><b>${esc(p.name)}</b><small>${esc(p.patient_code)}${Number(p.referred_view)?' · Referred case — view only':(Number(p.appointment_access)?' · Appointment with you':'')}</small></span>${Number(p.unread)>0?`<span class="unread">${p.unread}</span>`:''}</button>`}).join(''):'<div class="empty">No registered, referred, or appointment patients.</div>'}</div><div class="panel">${thread?`<div class="eyebrow">CONVERSATION ${thread.read_only?'<span class="pill">VIEW ONLY</span>':'<span class="pill">ACTIVE</span>'}</div><h3>${esc(thread.patient_name)} <small class="muted">${esc(thread.patient_code)}</small></h3>${thread.read_only?`<div class="warning" style="margin:12px 0">You referred this case. You can read the conversation between the patient and <b>${esc(thread.doctor_name||'the receiving doctor')}</b>, but you cannot send messages in this thread.</div>`:thread.appointment_access?`<div class="summary" style="margin:12px 0">This patient has an active appointment with you. You can communicate with the patient for this appointment without changing the patient's registered case owner.</div>`:''}<div class="message-thread" id="messageThread">${thread.messages.length?thread.messages.map(messageBubble).join(''):'<div class="empty">No messages yet.</div>'}</div>${thread.read_only?'':`<form class="message-compose" onsubmit="sendMessage(event,${thread.patient_id})"><textarea name="message" rows="3" maxlength="2000" required placeholder="Write a message to this patient..."></textarea><div class="form-actions"><small class="muted">Messages are visible to the patient and the doctor assigned to this conversation.</small><button class="primary">Send Reply</button></div></form>`}`:'<div class="empty">Select a patient to open the conversation.</div>'}</div></div>`;
      scrollMessageThread();
    }
  }catch(e){alert(e.message)}
}
function messageBubble(m){let mine=m.sender_role===state.user.role;return `<div class="message-row ${mine?'mine':'theirs'}"><div class="message-bubble"><div>${esc(m.message)}</div><small>${esc(m.sender_name||m.sender_role)} · ${esc(m.created_at)}</small></div></div>`}
function scrollMessageThread(){let t=$('messageThread');if(t)t.scrollTop=t.scrollHeight}
async function sendMessage(e,patientId=null,doctorId=null){e.preventDefault();try{let b=Object.fromEntries(new FormData(e.target));if(patientId)b.patient_id=patientId;if(doctorId)b.doctor_id=doctorId;await api('/api/messages',{method:'POST',body:JSON.stringify(b)});if(state.user.role==='patient')messages(null,doctorId);else messages(patientId,null,null)}catch(err){alert(err.message)}}
async function patientPortal(){let x=await api('/api/my-record');let p=x.patient;let mandatory=p.referral_complete===0;let latestReferral=x.referrals&&x.referrals.length?x.referrals[0]:null;let referralNotice=latestReferral&&Number(latestReferral.to_doctor_id)===Number(p.doctor_id)?`<div class="referral-notice"><div class="referral-notice-title">Case referred to another doctor</div><p>Your case has been referred from <b>${esc(latestReferral.from_doctor_name)}</b> to <b>${esc(latestReferral.to_doctor_name)}</b>.</p><p><b>${esc(latestReferral.to_doctor_name)}</b> is now your registered doctor and can manage your case and communicate with you. Your previous doctor retains view access to the case.</p>${latestReferral.reason?`<div class="referral-reason"><b>Referral reason:</b> ${esc(latestReferral.reason)}</div>`:''}<button class="btn secondary" onclick="messages()">Open Messages with ${esc(latestReferral.to_doctor_name)}</button></div>`:'';let referralForm=mandatory?`<div class="panel warning-panel"><div class="eyebrow">REQUIRED PATIENT INFORMATION</div><h3>Referral Information</h3><p>Please complete this compulsory question before booking an appointment.</p><form onsubmit="saveReferralProfile(event)"><div class="form-grid"><div class="field full"><label>Were you referred by another doctor? *</label><select name="referred_by_doctor" id="portalReferred" required onchange="toggleReferralField('portalReferred','portalRefDoctor')"><option value="">Select Yes or No</option><option>Yes</option><option>No</option></select></div><div class="field full hidden" id="portalRefDoctorWrap"><label>Referring Doctor Name *</label><input id="portalRefDoctor" name="referring_doctor_name" placeholder="Enter referring doctor's name"></div></div><button class="primary">Save Referral Information</button></form></div>`:'';$('content').innerHTML=`${referralNotice}${referralForm}<div class="panel"><div class="patient-head"><div><div class="eyebrow">MY PATIENT PROFILE</div><h3>${esc(p.name)}</h3><span class="pill">${esc(p.patient_code)}</span></div><div class="form-actions" style="margin:0"><button class="btn secondary" onclick="appointments()">Appointments</button><button class="btn secondary" onclick="messages()">Messages</button><button class="primary" onclick="editPatient(${p.id})">Edit My Details</button><button class="danger" onclick="deletePatient(${p.id},true)">Delete My Record</button></div></div><div class="form-grid" style="margin-top:18px">${referralBlock(p)}<div class="field"><label>Registered Doctor</label><div>${esc(p.doctor_name||'Not registered with a doctor')}</div></div><div class="field"><label>Date of Birth</label><div>${esc(p.dob||'—')}</div></div><div class="field"><label>Gender</label><div>${esc(p.gender||'—')}</div></div><div class="field"><label>Phone</label><div>${esc(p.phone||'—')}</div></div><div class="field"><label>Email</label><div>${esc(p.email||'—')}</div></div><div class="field"><label>Blood Group</label><div>${esc(p.blood_group||'—')}</div></div><div class="field"><label>Emergency Contact</label><div>${esc(p.emergency_contact||'—')}</div></div><div class="field full"><label>Address</label><div>${esc(p.address||'—')}</div></div></div><hr style="border:0;border-top:1px solid var(--line);margin:25px 0"><h3>Referral History</h3>${x.referrals&&x.referrals.length?`<div class="summary">${x.referrals.map(r=>`<div><b>${esc(r.from_doctor_name)}</b> referred this case to <b>${esc(r.to_doctor_name)}</b>${r.reason?` — ${esc(r.reason)}`:''} <small>(${esc(r.created_at)})</small></div>`).join('<hr style="border:0;border-top:1px solid var(--line);margin:10px 0">')}</div>`:'<div class="muted">No doctor-to-doctor referrals recorded.</div>'}<hr style="border:0;border-top:1px solid var(--line);margin:25px 0"><h3>My Case History</h3>${caseTable(x.cases.map(c=>({...c,name:p.name,patient_code:p.patient_code})))}</div>`}
async function deletePatient(id,selfDelete=false){
  const p=state.user.role==='patient'?{name:state.user.full_name}:{name:(await api('/api/patients/'+id)).patient.name};
  const message=selfDelete
    ?`Delete your patient record and account for ${p.name}? This permanently removes your cases, appointments, referrals and messages. This cannot be undone.`
    :`Delete patient ${p.name}? This permanently removes the patient record, linked account, cases, appointments, referrals and messages. This cannot be undone.`;
  if(!confirm(message))return;
  try{
    await api('/api/patients/'+id,{method:'DELETE'});
    if(selfDelete){sessionStorage.clear();alert('Your patient record and account have been permanently deleted.');location.reload();}
    else{alert('Patient record deleted.');show('patients');}
  }catch(err){alert(err.message)}
}
async function saveReferralProfile(e){e.preventDefault();try{let b=Object.fromEntries(new FormData(e.target));await api('/api/patients/'+state.user.patient_id,{method:'PUT',body:JSON.stringify(b)});alert('Referral information saved.');patientPortal()}catch(err){alert(err.message)}}
async function appointments(){
  let rows=await api('/api/appointments');
  window.appointmentRows=rows;
  if(state.user.role==='patient'){
    let p=(await api('/api/my-record')).patient;
    let doctors=await api('/api/doctors');
    let doctorHtml=`<div class="field full"><label>Doctor for This Appointment *</label><select name="doctor_id" required><option value="">Select doctor</option>${doctors.map(d=>`<option value="${d.id}" ${Number(p.doctor_id)===Number(d.id)?'selected':''}>${esc(d.full_name)}${Number(p.doctor_id)===Number(d.id)?' — Current registered doctor':''}</option>`).join('')}</select><small class="muted">Select the doctor you want to see for this appointment. Your current case/registered doctor remains unchanged unless the clinical referral workflow transfers the case.</small></div>`;
    $('content').innerHTML=`<div class="grid2"><div class="panel"><div class="eyebrow">BOOK APPOINTMENT</div><h3>Request a Doctor Appointment</h3><form onsubmit="bookAppointment(event)"><div class="form-grid">${doctorHtml}<div class="field full"><label>Date & Time *</label><input name="appointment_date" type="datetime-local" required></div><div class="field full"><label>Were you referred by another doctor? *</label><select name="referred_by_doctor" id="apptReferred" required onchange="toggleReferralField('apptReferred','apptRefDoctor')"><option value="">Select an option</option><option value="Yes">Yes</option><option value="No">No</option></select></div><div class="field full hidden" id="apptRefDoctorWrap"><label>Referring Doctor Name *</label><input name="referring_doctor_name" id="apptRefDoctor" placeholder="Enter the doctor's name"></div><div class="field full"><label>Reason / Symptoms</label><textarea name="reason" placeholder="Briefly describe why you want the appointment"></textarea></div></div><div class="warning">Only one appointment is allowed per patient for each calendar date. After submitting, you have 5 minutes to edit the doctor, date/time, referral details or reason if anything is wrong.</div><button class="primary">Book Appointment</button></form></div><div class="panel"><h3>My Appointments</h3>${appointmentTable(rows,false,false)}</div></div>`;
    startAppointmentTimers();
  }else{
    $('content').innerHTML=`<div class="panel"><div class="toolbar"><div><h3 style="margin:0">Appointment Requests</h3><small>Review, confirm or complete patient appointments.</small></div></div>${appointmentTable(rows,true,false)}</div>`;
  }
}
function appointmentTable(rows,doctor=false,admin=false){
  if(!rows.length)return '<div class="empty">No appointments yet.</div>';
  const actionHead=admin?'<th>Admin Action</th>':(doctor?'<th>Action</th>':'<th>Edit</th>');
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Date & Time</th><th>Patient</th><th>Doctor</th><th>Referral</th><th>Reason</th><th>Status</th><th>Doctor Suggestion / Remote Advice</th>${actionHead}</tr></thead><tbody>${rows.map(a=>{
    let edit=(a.edit_available!==false && a.edit_expires_at && a.status!=='Cancelled');
    const action=admin?`<td><button class="btn danger" onclick="deleteAppointment(${a.id},'admin')">Delete Appointment</button></td>`:(doctor?`<td><select onchange="updateAppointment(${a.id},this.value)"><option ${a.status==='Requested'?'selected':''}>Requested</option><option ${a.status==='Confirmed'?'selected':''}>Confirmed</option><option ${a.status==='Completed'?'selected':''}>Completed</option><option ${a.status==='Cancelled'?'selected':''}>Cancelled</option></select><button class="btn danger" style="margin-top:6px" onclick="deleteAppointment(${a.id},'doctor')">Delete Appointment</button></td>`:`<td>${edit?`<button class="btn" onclick="editAppointment(${a.id})">Edit <span id="edit-timer-${a.id}"></span></button>`:'<span class="muted">Edit expired</span>'}${a.status!=='Cancelled'?`<button class="btn danger" style="margin-top:6px" onclick="cancelAppointment(${a.id})">Cancel Appointment</button>`:''}</td>`);
    return `<tr><td>${esc((a.appointment_date||'').replace('T',' '))}</td><td><b>${esc(a.patient_name||'')}</b><br><small>${esc(a.patient_code||'')}</small></td><td>${esc(a.doctor_name||'Unassigned')}</td><td>${a.referred_by_doctor==='Yes'?`<b>Yes</b><br><small>${esc(a.referring_doctor_name||'Doctor name not provided')}</small>`:'No'}</td><td>${a.reason_available?esc(a.reason||'—'):'<span class="muted">Reason expired after 5 minutes</span>'}</td><td><span class="pill">${esc(a.status)}</span></td><td>${doctor?`<textarea id="suggest-${a.id}" rows="3" placeholder="Give advice if the patient cannot reach you physically">${esc(a.doctor_suggestion||'')}</textarea><button class="primary" style="margin-top:6px" onclick="saveSuggestion(${a.id})">Save Suggestion</button>`:(a.doctor_suggestion?`<div><b>Doctor's suggestion:</b><br>${esc(a.doctor_suggestion)}</div>`:'<span class="muted">No suggestion yet.</span>')}</td>${action}</tr>`;
  }).join('')}</tbody></table></div>`;
}
async function bookAppointment(e){e.preventDefault();try{const form=e.target;const payload=Object.fromEntries(new FormData(form));const result=await api('/api/appointments',{method:'POST',body:JSON.stringify(payload)});playNotificationSound('appointment_requested');const doctorName=result.doctor_name||'the selected doctor';alert(`Appointment request submitted to ${doctorName}. Booking this appointment does not change your registered doctor.`);await appointments()}catch(error){alert(error&&error.message?error.message:'Unable to book the appointment. Please try again.')}}
async function editAppointment(id){
  let a=(window.appointmentRows||[]).find(x=>x.id===id);
  if(!a)return;
  let age=Date.now()/1000-Number(a.created_at?Date.parse(a.created_at)/1000:0);
  if(age>=300){alert('The 5-minute appointment edit window has expired.');return;}
  $('content').innerHTML=`<div class="panel"><div class="eyebrow">EDIT APPOINTMENT</div><h3>Appointment #${id}</h3><div class="warning">You can edit this appointment only during the first 5 minutes after submission, including the selected doctor.</div><form onsubmit="saveAppointmentEdit(event,${id})"><div class="form-grid"><div class="field full"><label>Doctor for This Appointment *</label><select name="doctor_id" required><option value="">Select doctor</option>${(await api('/api/doctors')).map(d=>`<option value="${d.id}" ${Number(a.doctor_id)===Number(d.id)?'selected':''}>${esc(d.full_name)}</option>`).join('')}</select></div><div class="field full"><label>Date & Time *</label><input name="appointment_date" type="datetime-local" value="${esc(a.appointment_date)}" required></div><div class="field full"><label>Were you referred by another doctor? *</label><select name="referred_by_doctor" id="editApptReferred" required onchange="toggleReferralField('editApptReferred','editApptRefDoctor')"><option value="Yes" ${a.referred_by_doctor==='Yes'?'selected':''}>Yes</option><option value="No" ${a.referred_by_doctor!=='Yes'?'selected':''}>No</option></select></div><div class="field full ${a.referred_by_doctor==='Yes'?'':'hidden'}" id="editApptRefDoctorWrap"><label>Referring Doctor Name *</label><input name="referring_doctor_name" id="editApptRefDoctor" value="${esc(a.referring_doctor_name||'')}" placeholder="Enter the doctor's name"></div><div class="field full"><label>Reason / Symptoms</label><textarea name="reason">${esc(a.reason||'')}</textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="appointments()">Cancel</button><button class="primary">Save Changes</button></div></form></div>`;
}
async function saveAppointmentEdit(e,id){e.preventDefault();try{let b=Object.fromEntries(new FormData(e.target));await api('/api/appointments/'+id,{method:'PUT',body:JSON.stringify(b)});alert('Appointment updated successfully.');appointments()}catch(err){alert(err.message)}}
async function updateAppointment(id,status){await api('/api/appointments/'+id,{method:'PUT',body:JSON.stringify({status})});appointments()}
async function deleteAppointment(id,role=state.user.role){
  if(!['admin','doctor'].includes(state.user.role)){alert('Only a doctor or administrator can permanently delete an appointment.');return;}
  if(role==='doctor' && state.user.role!=='doctor'){alert('This delete action is for doctors only.');return;}
  if(role==='admin' && state.user.role!=='admin'){alert('This delete action is for administrators only.');return;}
  const who=state.user.role==='admin'?'administrator':'doctor';
  if(!confirm(`Permanently delete appointment #${id}? This cannot be undone. The patient will be notified.`))return;
  try{
    await api('/api/appointments/'+id,{method:'DELETE'});
    playNotificationSound('appointment_deleted');
    alert(`Appointment deleted successfully by the ${who}.`);
    await appointments();
  }catch(e){alert(e.message||'Unable to delete appointment.')}
}
async function cancelAppointment(id){
  if(state.user.role!=='patient'){alert('Only the patient can cancel this appointment.');return;}
  if(!confirm(`Cancel appointment #${id}? The doctor will be notified.`))return;
  try{
    await api('/api/appointments/'+id,{method:'DELETE'});
    playNotificationSound('appointment_cancelled');
    alert('Appointment cancelled successfully.');
    await appointments();
  }catch(e){alert(e.message||'Unable to cancel appointment.')}
}
async function saveSuggestion(id){let el=$('suggest-'+id);await api('/api/appointments/'+id,{method:'PUT',body:JSON.stringify({doctor_suggestion:el.value,status:'Confirmed'})});alert('Doctor suggestion saved. The patient can now see it in My Appointments.');appointments()}
function startAppointmentTimers(){
  if(window.appointmentTimer)clearInterval(window.appointmentTimer);
  const tick=()=>{
    (window.appointmentRows||[]).forEach(a=>{const el=$('edit-timer-'+a.id);if(!el)return;let left=Math.max(0,300-(Date.now()/1000-Date.parse(a.created_at)/1000));el.textContent=left>0?`(${Math.ceil(left)}s)`:'';if(left<=0){appointments()}})
  };
  tick(); window.appointmentTimer=setInterval(tick,1000);
}
async function newcase(pid){let ps=await api('/api/patients');$('content').innerHTML=`<div class="panel"><div class="eyebrow">CASE TAKING</div><h3>New Patient Case</h3><form id="caseForm" onsubmit="saveCase(event)"><div class="form-grid"><div class="field full"><label>Patient *</label><select name="patient_id" required><option value="">Select patient</option>${ps.map(p=>`<option value="${p.id}" ${pid==p.id?'selected':''}>${esc(p.name)} — ${esc(p.patient_code)}</option>`).join('')}</select></div><div class="field full"><label>Chief Complaint *</label><input name="chief_complaint" required placeholder="Main reason for visit"></div><div class="field full"><label>Symptoms <button type="button" class="voice" onclick="voice('symptoms')">🎙 Voice</button></label><textarea id="symptoms" name="symptoms" placeholder="Describe symptoms, duration, severity..."></textarea></div><div class="field full"><label>Medical History <button type="button" class="voice" onclick="voice('medical_history')">🎙 Voice</button></label><textarea id="medical_history" name="medical_history"></textarea></div><div class="field"><label>Allergies</label><textarea name="allergies" placeholder="Drug/food/environmental allergies"></textarea></div><div class="field"><label>Medications</label><textarea name="medications" placeholder="Current medications"></textarea></div><div class="field full"><label>Vitals</label><input name="vitals" placeholder="Temperature, BP, pulse, SpO₂, etc."></div><div class="field full"><label>Clinical Notes <button type="button" class="voice" onclick="voice('clinical_notes')">🎙 Voice</button></label><textarea id="clinical_notes" name="clinical_notes"></textarea></div></div><div class="form-actions"><button type="button" class="btn secondary" onclick="runAIDetection()">Check for warning signs</button><span id="aiResult"></span></div><div class="warning">This prototype assists with documentation. It does not diagnose patients or replace clinical judgment.</div><div class="form-actions"><button type="button" class="ghost" onclick="dashboard()">Cancel</button><button type="button" class="btn secondary" onclick="saveCase(event,false)">Save Draft</button><button class="primary">Save & Generate Summary</button></div></form></div>`}
async function runAIDetection(){let f=document.getElementById('caseForm');let b=Object.fromEntries(new FormData(f));let r=await api('/api/ai-detect',{method:'POST',body:JSON.stringify(b)});$('aiResult').innerHTML=`<span class="pill">${esc(r.level)}</span> ${esc(r.message)}`}
async function saveCase(e,gen=true){e.preventDefault();let f=new FormData($('caseForm'));let b=Object.fromEntries(f);b.generate_summary=gen;b.status=gen?'Completed':'Draft';let r=await api('/api/cases',{method:'POST',body:JSON.stringify(b)});caseDetail(r.id)}
async function caseDetail(id){let x=await api('/api/cases/'+id);let owner=x.access_type==='current_owner';$('content').innerHTML=`<div class="detail-grid"><div class="panel"><div class="eyebrow">CASE #${x.id}</div><h3>${esc(x.name)}</h3><span class="pill">${esc(x.patient_code)}</span>${x.access_type==='referring_doctor'?`<div class="warning" style="margin-top:14px">You referred this case to <b>${esc(x.latest_referral?.to_doctor_name||x.doctor_name||'another doctor')}</b>. You retain view access, while the receiving doctor manages the case.</div>`:(x.access_type==='appointment_doctor'?`<div class="summary" style="margin-top:14px">You have an active appointment with this patient. You can review this case and create a separate case for your encounter, but you cannot edit this existing case unless it is assigned to you.</div>`:'')}<div class="form-grid" style="margin-top:18px"><div class="field"><label>Chief Complaint</label><div>${esc(x.chief_complaint||'—')}</div></div><div class="field"><label>Status</label><div><span class="pill">${esc(x.status)}</span></div></div><div class="field full"><label>Symptoms</label><div>${esc(x.symptoms||'—')}</div></div><div class="field full"><label>Medical History</label><div>${esc(x.medical_history||'—')}</div></div><div class="field"><label>Allergies</label><div>${esc(x.allergies||'—')}</div></div><div class="field"><label>Medications</label><div>${esc(x.medications||'—')}</div></div><div class="field full"><label>Vitals</label><div>${esc(x.vitals||'—')}</div></div><div class="field full"><label>Clinical Notes</label><div>${esc(x.clinical_notes||'—')}</div></div></div><div class="form-actions">${owner?`<button class="btn secondary" onclick="editCase(${id})">Edit</button>`:''}${x.access_type==='referring_doctor'?`<button class="btn secondary" onclick="viewReferredConversation(${id})">View Patient ↔ Receiving Doctor Messages</button>`:''}${owner&&state.user.role==='doctor'?`<button class="primary" onclick="referCase(${id})">↗ Refer to Another Doctor</button>`:''}${owner?`<button class="btn red" onclick="deleteCase(${id})">Delete</button>`:''}</div>${x.latest_referral?`<div class="summary" style="margin-top:14px"><b>Referral:</b> ${esc(x.latest_referral.from_doctor_name)} → ${esc(x.latest_referral.to_doctor_name)}${x.latest_referral.reason?`<br><b>Reason:</b> ${esc(x.latest_referral.reason)}`:''}</div>`:''}</div><div class="panel"><div class="eyebrow">CASE SUMMARY</div><h3>Clinical Documentation Summary</h3><div class="summary">${esc(x.summary||'No summary generated yet.')}</div><div class="warning">Review the summary against the recorded history and examination before clinical use.</div><div class="form-actions"><button class="primary" onclick="window.print()">Print / Save PDF</button></div></div></div>`}
async function viewReferredConversation(caseId){try{let x=await api('/api/cases/'+caseId);if(x.access_type!=='referring_doctor')return alert('This conversation view is available to the original referring doctor.');messages(x.patient_id)}catch(e){alert(e.message)}}
async function referCase(id){try{let x=await api('/api/cases/'+id);let doctors=await api('/api/doctors');let previousReferrerId=x.latest_referral?Number(x.latest_referral.from_doctor_id):null;let opts=doctors.filter(d=>d.id!==state.user.id&&d.id!==previousReferrerId).map(d=>`<option value="${d.id}">${esc(d.full_name)}</option>`).join('');let restriction=previousReferrerId?`<div class="warning">The doctor who referred this case to you cannot be selected again. The case must be referred to a different doctor.</div>`:'';$('content').innerHTML=`<div class="panel"><div class="eyebrow">DOCTOR REFERRAL</div><h3>Refer ${esc(x.name)} to another doctor</h3><div class="warning">After referral, the selected doctor becomes the current case owner. The referring doctor will retain view access to this case, while only the receiving doctor can edit or refer it further.</div>${restriction}<form onsubmit="submitReferral(event,${id})"><div class="form-grid"><div class="field full"><label>Refer To Doctor *</label><select name="to_doctor_id" required><option value="">Select doctor</option>${opts}</select></div><div class="field full"><label>Referral Reason</label><textarea name="reason" rows=5 placeholder="Why is this patient being referred?"></textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="caseDetail(${id})">Cancel</button><button class="primary">Confirm Referral & Transfer Case</button></div></form></div>`}catch(e){alert(e.message)}}
async function submitReferral(e,id){e.preventDefault();try{let b=Object.fromEntries(new FormData(e.target));let result=await api('/api/referrals',{method:'POST',body:JSON.stringify({...b,case_id:id})});unlockNotificationAudio();playNotificationSound('referral');alert(`Referral completed and notification sent to ${result.to_doctor_name}. The patient will also receive a referral notification. The receiving doctor can now manage the case, while the original referring doctor retains view access.`);cases()}catch(err){alert(err.message)}}
async function editCase(id){let x=await api('/api/cases/'+id);$('content').innerHTML=`<div class="panel"><div class="eyebrow">EDIT CASE #${id}</div><h3>${esc(x.name)}</h3><form id="caseForm" onsubmit="updateCase(event,${id},true)"><div class="form-grid"><div class="field full"><label>Chief Complaint</label><input name="chief_complaint" value="${esc(x.chief_complaint)}"></div><div class="field full"><label>Symptoms</label><textarea name="symptoms">${esc(x.symptoms)}</textarea></div><div class="field full"><label>Medical History</label><textarea name="medical_history">${esc(x.medical_history)}</textarea></div><div class="field"><label>Allergies</label><textarea name="allergies">${esc(x.allergies)}</textarea></div><div class="field"><label>Medications</label><textarea name="medications">${esc(x.medications)}</textarea></div><div class="field full"><label>Vitals</label><input name="vitals" value="${esc(x.vitals)}"></div><div class="field full"><label>Clinical Notes</label><textarea name="clinical_notes">${esc(x.clinical_notes)}</textarea></div></div><div class="form-actions"><button type="button" class="ghost" onclick="caseDetail(${id})">Cancel</button><button class="primary">Save & Regenerate Summary</button></div></form></div>`}
async function updateCase(e,id,gen){e.preventDefault();let b=Object.fromEntries(new FormData(e.target));b.generate_summary=gen;b.status='Completed';await api('/api/cases/'+id,{method:'PUT',body:JSON.stringify(b)});caseDetail(id)}
async function deleteCase(id){if(confirm('Delete this case?')){await api('/api/cases/'+id,{method:'DELETE'});cases()}}
function voice(field){let SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return alert('Speech recognition is not supported by this browser. Try Chrome.');let r=new SR();r.lang='en-IN';r.interimResults=false;r.onresult=e=>{document.getElementsByName(field)[0].value+=(document.getElementsByName(field)[0].value?' ':'')+e.results[0][0].transcript};r.start()}
async function refreshAll(){let p=document.querySelector('.nav.active')?.dataset.page||'dashboard';show(p)}
(async function bootstrapOAuth(){
  const qs=new URLSearchParams(location.search);
  const oauthToken=qs.get('oauth_token');
  const oauthError=qs.get('oauth_error');
  if(oauthToken){
    state.token=oauthToken;
    sessionStorage.token=oauthToken;
    try{
      const u=await api('/api/me');
      state.user=u;
      sessionStorage.user=JSON.stringify(u);
      history.replaceState({},'',location.pathname);
      start();
      return;
    }catch(e){
      sessionStorage.clear();
      state={user:null,token:null};
      $('loginErr').textContent='Google sign-in session could not be restored: '+e.message;
    }
  }else if(oauthError){
    $('loginErr').textContent=oauthError;
    history.replaceState({},'',location.pathname);
  }
  if(sessionStorage.user&&sessionStorage.token){
    try{
      state.user=JSON.parse(sessionStorage.user);
      state.token=sessionStorage.token;
      start();
    }catch(e){sessionStorage.clear();}
  }
})();

function showLoginTab(t){let overlay=$('registerPanel');if(t==='register'){overlay.classList.remove('hidden');$('loginErr').textContent='';return}overlay.classList.add('hidden');$('loginErr').textContent='';if(t==='doctor'){document.getElementById('doctorUser')?.focus()}else{document.getElementById('patientUser')?.focus()}}
async function googleLogin(role,registering=false){try{const cfg=await api('/api/google/config');if(!cfg.enabled){$('loginErr').textContent='Google Sign-In is not configured. Check your .env file and restart the server.';return}let extra=''; if(role==='doctor'){let id=$('doctorGoogleId').value; if(!id){$('loginErr').textContent='Select one of the four doctors first.';return} extra='&doctor_id='+encodeURIComponent(id)} window.location.href='/api/google/start?role='+encodeURIComponent(role)+(registering?'&registering=1':'')+extra}catch(e){$('loginErr').textContent='Unable to start Google Sign-In: '+e.message}}
async function registerPatient(){try{let referred=$('regReferred').value;if(!referred){$('loginErr').textContent='Please answer the compulsory referral question.';return}let name=$('regRefDoctor').value;if(referred==='Yes'&&!name.trim()){$('loginErr').textContent='Please enter the referring doctor name.';return}let b={name:$('regName').value,email:$('regEmail').value,phone:$('regPhone').value,password:$('regPass').value,referred_by_doctor:referred,referring_doctor_name:name};let j=await api('/api/patient-register',{method:'POST',body:JSON.stringify(b)});state.user=j.user;state.token=j.token;sessionStorage.user=JSON.stringify(state.user);sessionStorage.token=state.token;start()}catch(e){$('loginErr').textContent=e.message}}
