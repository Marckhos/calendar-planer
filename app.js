(() => {
  "use strict";

  const config = window.AGENDA_CONFIG || {};
  const page = document.body.dataset.page || "calendar";
  const params = new URLSearchParams(location.search);
  const configured = /^https:\/\//.test(config.supabaseUrl || "") &&
    config.supabasePublishableKey &&
    !String(config.supabasePublishableKey).startsWith("COLE_");
  const demoRole = params.get("demo");
  const demo = !configured || ["admin", "colaborador", "default", "visitante"].includes(demoRole);
  const client = configured && window.supabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey)
    : null;
  const today = new Date();
  const todayKey = dateKey(today);
  const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  let viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDate = todayKey;
  let currentProfile = null;
  let appointments = [];
  let editingId = null;
  let selectedColor = "terracotta";
  let historyEntries = [];
  let realtimeChannel = null;

  const demoProfiles = [
    { id:"demo-collaborator", login_id:"colaborador.demo", full_name:"Colaborador Demonstração", role:"collaborator", is_active:true, deactivated_at:null, created_at:new Date(Date.now()-86400000*18).toISOString() },
    { id:"demo-default", login_id:"default.demo", full_name:"Usuário Default", role:"default", is_active:true, deactivated_at:null, created_at:new Date(Date.now()-86400000*12).toISOString() },
    { id:"demo-2", login_id:"joao.lima", full_name:"João Lima", role:"collaborator", is_active:true, deactivated_at:null, created_at:new Date(Date.now()-86400000*8).toISOString() },
    { id:"demo-3", login_id:"equipe02", full_name:"Equipe de Atendimento", role:"collaborator", is_active:false, deactivated_at:new Date(Date.now()-86400000).toISOString(), created_at:new Date(Date.now()-86400000*2).toISOString() }
  ];

  function offsetKey(offset) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return dateKey(date);
  }

  const demoAppointments = [
    { id:"a1", title:"Reunião da equipe", description:"Alinhamento semanal e divisão das atividades.", appointment_date:todayKey, start_time:"09:00", end_time:"10:00", color:"terracotta", created_by:"demo-collaborator", created_at:new Date().toISOString(), is_hidden:false },
    { id:"a2", title:"Atendimento — Projeto Aurora", description:"Apresentação do andamento do projeto.", appointment_date:todayKey, start_time:"09:00", end_time:"10:30", color:"blue", created_by:"demo-admin", created_at:new Date().toISOString(), is_hidden:false },
    { id:"a3", title:"Revisão do cronograma", description:"Conferência das próximas entregas.", appointment_date:offsetKey(2), start_time:"14:00", end_time:"15:00", color:"green", created_by:"demo-collaborator", created_at:new Date().toISOString(), is_hidden:false },
    { id:"a4", title:"Planejamento mensal", description:"Definição das prioridades do próximo ciclo.", appointment_date:offsetKey(5), start_time:"10:30", end_time:"12:00", color:"blue", created_by:"demo-2", created_at:new Date().toISOString(), is_hidden:false }
  ];

  const demoHistory = [
    { id:"h0", entity_type:"collaborator", action:"collaborator_deactivate", actor_name:"Administrador", actor_login:"admin", created_at:new Date(Date.now()-1800000).toISOString(), record_data:{login_id:"equipe02",full_name:"Equipe de Atendimento",is_active:false} },
    { id:"h1", appointment_id:"a1", entity_type:"appointment", action:"insert", actor_name:"Colaborador Demonstração", actor_login:"colaborador.demo", created_at:new Date(Date.now()-3600000).toISOString(), record_data:{id:"a1",title:"Reunião da equipe",appointment_date:todayKey,start_time:"09:00",is_hidden:false} },
    { id:"h2", appointment_id:"a3", entity_type:"appointment", action:"update", actor_name:"Administrador", actor_login:"admin", created_at:new Date(Date.now()-86400000).toISOString(), record_data:{id:"a3",title:"Revisão do cronograma",appointment_date:offsetKey(2),start_time:"14:00",is_hidden:false} },
    { id:"h3", entity_type:"appointment", action:"delete", actor_name:"Administrador", actor_login:"admin", created_at:new Date(Date.now()-86400000*3).toISOString(), record_data:{title:"Compromisso cancelado",appointment_date:offsetKey(-3),start_time:"16:00"} }
  ];

  function $(id) { return document.getElementById(id); }
  function dateKey(date) {
    return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
  }
  function parseDate(value) {
    const [year,month,day] = value.split("-").map(Number);
    return new Date(year,month-1,day);
  }
  function fullDate(value) {
    return new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}).format(parseDate(value));
  }
  function shortDate(value) {
    return new Intl.DateTimeFormat("pt-BR",{weekday:"short",day:"2-digit",month:"short"}).format(parseDate(value));
  }
  function formatDateTime(value) {
    return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
  }
  function node(tag,className,text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function normalizeId(value) {
    return value.trim().toLowerCase();
  }
  function loginEmail(loginId) {
    return normalizeId(loginId)+"@"+(config.loginDomain || "agenda.local");
  }
  function roleLabel(role) {
    return ({admin:"Administrador",collaborator:"Colaborador",default:"Default"})[role] || "Visitante";
  }
  function roleClass(role) {
    return ["admin","collaborator","default"].includes(role) ? role : "visitor";
  }
  function isAdmin() { return currentProfile?.role === "admin" && currentProfile?.is_active !== false; }
  function canSchedule() { return ["admin","collaborator","default"].includes(currentProfile?.role) && currentProfile?.is_active !== false; }
  function canManageAppointment(item) {
    return Boolean(item && (isAdmin() || (currentProfile?.role === "collaborator" && item.created_by === currentProfile.id)));
  }
  function setMessage(id,message,type="error") {
    const element = $(id);
    if (!element) return;
    element.textContent = message || "";
    element.classList.toggle("show",Boolean(message));
    if (message) element.classList.toggle("success",type === "success");
  }
  function closeDialog(id) {
    const dialog = $(id);
    if (dialog?.open) dialog.close();
  }
  function showSetupMode() {
    if ($("setupBanner")) $("setupBanner").hidden = !demo;
  }

  async function loadIdentity() {
    if (demo) {
      const roleName = demoRole || (page === "calendar" ? "visitante" : "admin");
      currentProfile = roleName === "visitante" ? null : {
        id:roleName === "admin" ? "demo-admin" : roleName === "default" ? "demo-default" : "demo-collaborator",
        login_id:roleName === "admin" ? "admin" : roleName === "default" ? "default.demo" : "colaborador.demo",
        full_name:roleName === "admin" ? "Administrador" : roleName === "default" ? "Usuário Default" : "Colaborador Demonstração",
        role:roleName === "admin" ? "admin" : roleName === "default" ? "default" : "collaborator",
        is_active:true
      };
      return;
    }
    const { data:{ session } } = await client.auth.getSession();
    if (!session) { currentProfile = null; return; }
    const { data, error } = await client.from("profiles").select("id,login_id,full_name,role,is_active,deactivated_at,created_at").eq("id",session.user.id).single();
    if (error) { console.error(error); currentProfile = null; return; }
    if (data.is_active === false) {
      await client.auth.signOut();
      currentProfile = null;
      return;
    }
    currentProfile = data;
  }

  function applyAccess() {
    document.querySelectorAll("[data-admin]").forEach(element => element.hidden = !isAdmin());
    document.querySelectorAll("[data-auth]").forEach(element => element.hidden = !currentProfile);
    document.querySelectorAll("[data-scheduler]").forEach(element => element.hidden = !canSchedule());
    if ($("loginBtn")) $("loginBtn").hidden = Boolean(currentProfile);
    const badge = $("roleBadge");
    if (badge) {
      const role = roleLabel(currentProfile?.role);
         badge.textContent = currentProfile
      ? full_name
      : "Visitante";
      badge.className = "role-badge "+roleClass(currentProfile?.role);
      badge.title = currentProfile ? currentProfile.full_name+" · ID: "+currentProfile.login_id : "Acesso somente para visualização";
    }
  }

  async function signIn(event) {
    event.preventDefault();
    setMessage("loginError","");
    const loginId = normalizeId($("loginId").value);
    const password = $("loginPassword").value;
    if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) return setMessage("loginError","Use um ID válido com letras, números, ponto, hífen ou sublinhado.");
    if (demo) {
      const role = loginId === "admin" ? "admin" : loginId.startsWith("default") ? "default" : "collaborator";
      currentProfile = { id:role === "admin" ? "demo-admin" : role === "default" ? "demo-default" : "demo-collaborator", login_id:loginId, full_name:roleLabel(role), role, is_active:true };
      closeDialog("loginModal"); applyAccess(); renderCalendar(); return;
    }
    const { error } = await client.auth.signInWithPassword({ email:loginEmail(loginId), password });
    if (error) return setMessage("loginError","ID ou senha incorretos.");
    await loadIdentity();
    closeDialog("loginModal");
    applyAccess();
    await loadAppointments();
  }

  async function signOut() {
    if (!demo) await client.auth.signOut();
    currentProfile = null;
    if (page !== "calendar") location.href = "index.html";
    else { applyAccess(); renderCalendar(); }
  }

  async function updatePassword(event) {
    event.preventDefault();
    setMessage("passwordError",""); setMessage("passwordSuccess","");
    const password = $("newPassword").value;
    if (password.length < 8) return setMessage("passwordError","A nova senha deve ter pelo menos 8 caracteres.");
    if (password !== $("confirmPassword").value) return setMessage("passwordError","As duas senhas precisam ser iguais.");
    if (!demo) {
      const { error } = await client.auth.updateUser({ password });
      if (error) return setMessage("passwordError",error.message);
    }
    setMessage("passwordSuccess","Senha alterada com sucesso.","success");
    $("passwordForm").reset();
    setTimeout(() => closeDialog("passwordModal"),900);
  }

  function appointmentFromDatabase(item) {
    return {
      ...item,
      start_time:String(item.start_time).slice(0,5),
      end_time:String(item.end_time).slice(0,5)
    };
  }

  async function loadAppointments() {
    if (demo) appointments = demoAppointments.filter(item => isAdmin() || !item.is_hidden).map(item => ({...item}));
    else {
      const { data,error } = await client.from("appointments").select("id,title,description,appointment_date,start_time,end_time,color,created_at,created_by,is_hidden,hidden_at,hidden_by").order("appointment_date").order("start_time");
      if (error) { console.error(error); appointments = []; if ($("syncStatus")) $("syncStatus").textContent = "Não foi possível carregar a agenda."; }
      else appointments = (data || []).map(appointmentFromDatabase);
    }
    if ($("syncStatus")) $("syncStatus").textContent = demo ? "Demonstração local — configure o Supabase para sincronizar." : "Agenda sincronizada em tempo real.";
    renderCalendar();
  }

  function subscribeRealtime() {
    if (demo || !client) return;
    realtimeChannel = client.channel("agenda-compartilhada")
      .on("postgres_changes",{event:"*",schema:"public",table:"appointments"},() => loadAppointments())
      .subscribe();
  }

  function renderCalendar() {
    if (page !== "calendar" || !$("calendar")) return;
    $("monthTitle").replaceChildren(document.createTextNode(monthNames[viewDate.getMonth()]+" "),node("span","",viewDate.getFullYear()));
    $("selectedTitle").textContent = fullDate(selectedDate);
    const first = new Date(viewDate.getFullYear(),viewDate.getMonth(),1);
    const start = new Date(first); start.setDate(first.getDate()-first.getDay());
    $("calendar").replaceChildren();
    for (let index=0; index<42; index++) {
      const date = new Date(start); date.setDate(start.getDate()+index);
      const key = dateKey(date);
      const dayItems = appointments.filter(item => item.appointment_date === key).sort((a,b)=>a.start_time.localeCompare(b.start_time));
      const day = node("button","day"+(date.getMonth()!==viewDate.getMonth()?" outside":"")+(key===todayKey?" today":"")+(key===selectedDate?" selected":""));
      day.setAttribute("aria-label",fullDate(key)+(dayItems.length?", "+dayItems.length+" agendamento(s)":""));
      day.append(node("span","number",date.getDate()));
      const events = node("span","day-events");
      dayItems.slice(0,2).forEach(item => events.append(node("span","pill "+item.color+(item.is_hidden?" is-hidden":""),item.start_time+" "+item.title)));
      if (dayItems.length>2) events.append(node("span","more","+"+(dayItems.length-2)+" mais"));
      day.append(events);
      day.onclick = () => {
        selectedDate = key;
        if (date.getMonth()!==viewDate.getMonth()) viewDate = new Date(date.getFullYear(),date.getMonth(),1);
        renderCalendar();
      };
      day.ondblclick = () => { if (canSchedule()) openAppointment(key); };
      $("calendar").append(day);
    }
    renderSelectedDay();
  }

  function renderSelectedDay() {
    const list = $("dayList"); if (!list) return;
    list.replaceChildren();
    const selectedItems = appointments.filter(item => item.appointment_date === selectedDate).sort((a,b)=>a.start_time.localeCompare(b.start_time));
    if (!selectedItems.length) {
      const empty = node("div","empty");
      empty.append(node("span","","◷"),node("h3","","Dia livre por aqui"),node("p","","Nenhum agendamento registrado nesta data."));
      list.append(empty);
    } else selectedItems.forEach(item => {
      const card = node("article","card "+item.color+(item.is_hidden?" is-hidden":""));
      card.append(node("span","bar"),node("div","time",item.start_time+" — "+item.end_time),node("h3","",item.title),node("p","",item.description || "Sem descrição."));
      if (item.is_hidden && isAdmin()) card.append(node("span","hidden-label","Oculto para os demais usuários"));
      if (canManageAppointment(item)) {
        const actions = node("div","card-actions"), edit = node("button","","Editar"), remove = node("button","delete","Excluir");
        edit.onclick = () => openAppointment(item.appointment_date,item);
        remove.onclick = () => deleteAppointment(item);
        actions.append(edit,remove); card.append(actions);
      }
      list.append(card);
    });
    $("totalLabel").textContent = appointments.length+" no total";
    const upcoming = $("upcomingList"); upcoming.replaceChildren();
    const next = appointments.filter(item=>item.appointment_date>=todayKey).sort((a,b)=>(a.appointment_date+a.start_time).localeCompare(b.appointment_date+b.start_time)).slice(0,4);
    if (!next.length) upcoming.append(node("p","upcoming-empty","Os próximos horários aparecerão aqui."));
    else next.forEach(item => {
      const row=node("button","upcoming-row"+(item.is_hidden?" is-hidden":"")),info=node("span"),dot=node("span","dot "+item.color);
      info.append(node("b","",item.title),node("small","",shortDate(item.appointment_date)+" · "+item.start_time));
      row.append(dot,info,node("span","","›"));
      row.onclick=()=>{selectedDate=item.appointment_date;const date=parseDate(selectedDate);viewDate=new Date(date.getFullYear(),date.getMonth(),1);renderCalendar()};
      upcoming.append(row);
    });
  }

  function selectColor(color) {
    selectedColor = color;
    document.querySelectorAll(".color").forEach(button => button.classList.toggle("active",button.dataset.color===color));
  }

  function openAppointment(date=selectedDate,item=null) {
    if (!canSchedule()) return;
    if (item && !canManageAppointment(item)) return;
    editingId = item?.id || null;
    $("appointmentLabel").textContent = item ? "EDITAR HORÁRIO" : "NOVO HORÁRIO";
    $("appointmentTitle").textContent = item ? "Editar agendamento" : "Adicionar agendamento";
    $("appointmentSaveBtn").textContent = item ? "Salvar alterações" : "Salvar agendamento";
    $("appointmentName").value = item?.title || "";
    $("appointmentDescription").value = item?.description || "";
    $("appointmentDate").value = item?.appointment_date || date;
    $("appointmentStart").value = item?.start_time || "09:00";
    $("appointmentEnd").value = item?.end_time || "10:00";
    selectColor(item?.color || "terracotta");
    setMessage("appointmentError","");
    $("appointmentModal").showModal();
    $("appointmentName").focus();
  }

  async function saveAppointment(event) {
    event.preventDefault();
    setMessage("appointmentError","");
    const payload = {
      title:$("appointmentName").value.trim(),
      description:$("appointmentDescription").value.trim(),
      appointment_date:$("appointmentDate").value,
      start_time:$("appointmentStart").value,
      end_time:$("appointmentEnd").value,
      color:selectedColor
    };
    if (!payload.title) return setMessage("appointmentError","Digite o nome do compromisso.");
    if (!payload.appointment_date || !payload.start_time || !payload.end_time) return setMessage("appointmentError","Preencha a data e os horários.");
    if (payload.end_time <= payload.start_time) return setMessage("appointmentError","O horário final precisa ser depois do inicial.");
    const original = editingId ? appointments.find(item => item.id === editingId) : null;
    if (editingId && !canManageAppointment(original)) return setMessage("appointmentError","Você só pode alterar os agendamentos criados por você.");
    if (demo) {
      if (editingId) appointments = appointments.map(item=>item.id===editingId?{...item,...payload}:item);
      else appointments.push({...payload,id:"demo-"+Date.now(),created_by:currentProfile.id,created_at:new Date().toISOString(),is_hidden:false});
    } else {
      let operation;
      if (editingId) {
        operation = client.from("appointments").update({...payload,updated_at:new Date().toISOString()}).eq("id",editingId);
        if (!isAdmin()) operation = operation.eq("created_by",currentProfile.id);
      } else operation = client.from("appointments").insert({...payload,created_by:currentProfile.id});
      const { data,error } = await operation.select("id");
      if (error) return setMessage("appointmentError",error.message);
      if (editingId && !data?.length) return setMessage("appointmentError","O agendamento não foi encontrado ou não pertence a você.");
      await loadAppointments();
    }
    selectedDate = payload.appointment_date;
    const date = parseDate(selectedDate); viewDate = new Date(date.getFullYear(),date.getMonth(),1);
    closeDialog("appointmentModal");
    renderCalendar();
  }

  async function deleteAppointment(item) {
    if (!canManageAppointment(item)) return;
    if (!confirm("Excluir o agendamento “"+item.title+"”? Esta ação ficará registrada no histórico.")) return;
    if (demo) appointments = appointments.filter(current=>current.id!==item.id);
    else {
      let operation = client.from("appointments").delete().eq("id",item.id);
      if (!isAdmin()) operation = operation.eq("created_by",currentProfile.id);
      const { data,error } = await operation.select("id");
      if (error) return alert("Não foi possível excluir: "+error.message);
      if (!data?.length) return alert("Este agendamento não foi encontrado ou não pertence a você.");
      await loadAppointments();
    }
    renderCalendar();
  }

  async function loadUsers() {
    const list = $("userList"); if (!list) return;
    list.replaceChildren(node("div","loading-row","Carregando contas…"));
    let profiles;
    if (demo) profiles = demoProfiles;
    else {
      const { data,error } = await client.from("profiles").select("id,login_id,full_name,role,is_active,deactivated_at,created_at").in("role",["collaborator","default"]).order("full_name");
      if (error) { list.replaceChildren(node("div","loading-row","Não foi possível carregar as contas.")); return; }
      profiles = data || [];
    }
    window.agendaProfiles = profiles;
    renderUsers(profiles);
  }

  function renderUsers(profiles) {
    const list = $("userList"); list.replaceChildren();
    const allProfiles = window.agendaProfiles || profiles;
    $("userCount").textContent = allProfiles.length;
    if ($("activeUserCount")) $("activeUserCount").textContent = allProfiles.filter(profile => profile.is_active !== false).length;
    if ($("inactiveUserCount")) $("inactiveUserCount").textContent = allProfiles.filter(profile => profile.is_active === false).length;
    if (!profiles.length) return list.append(node("div","loading-row","Nenhuma conta cadastrada."));
    profiles.forEach(profile => {
      const active=profile.is_active !== false,row=node("article","user-row"),avatar=node("span","avatar",(profile.full_name||profile.login_id).slice(0,2).toUpperCase()),identity=node("span"),role=node("span"),status=node("span",active?"status-active":"status-inactive",active?"● Ativo":"● Desativado"),actions=node("span","user-actions");
      identity.append(node("b","",profile.full_name),node("small","","ID: "+profile.login_id));
      role.append(node("b","",roleLabel(profile.role)),node("small","","Criado em "+new Intl.DateTimeFormat("pt-BR").format(new Date(profile.created_at))));
      const toggle=node("button",active?"user-action":"user-action reactivate",active?"Desativar":"Reativar"),remove=node("button","user-action danger","Excluir");
      toggle.onclick=()=>manageCollaborator(profile,active?"deactivate":"reactivate");
      remove.onclick=()=>manageCollaborator(profile,"delete");
      actions.append(toggle,remove);
      row.append(avatar,identity,role,status,actions); list.append(row);
    });
  }

  async function manageCollaborator(profile,action) {
    if (!isAdmin()) return;
    const verbs={deactivate:"desativar",reactivate:"reativar",delete:"excluir permanentemente"};
    const warnings={
      deactivate:"A pessoa não poderá entrar nem criar ou gerenciar agendamentos.",
      reactivate:"A pessoa poderá entrar novamente usando o mesmo ID e senha.",
      delete:"A conta será removida, mas os agendamentos e o registro no histórico serão preservados."
    };
    if (!confirm("Deseja "+verbs[action]+" a conta “"+profile.full_name+"”?\n\n"+warnings[action])) return;
    if (demo) {
      const index=demoProfiles.findIndex(item=>item.id===profile.id);
      if (action==="delete" && index>=0) demoProfiles.splice(index,1);
      else if (index>=0) {
        demoProfiles[index].is_active=action==="reactivate";
        demoProfiles[index].deactivated_at=action==="deactivate"?new Date().toISOString():null;
      }
      demoHistory.unshift({
        id:"history-"+Date.now(),entity_type:"collaborator",action:"collaborator_"+action,
        actor_name:currentProfile.full_name,actor_login:currentProfile.login_id,created_at:new Date().toISOString(),
        record_data:{id:profile.id,login_id:profile.login_id,full_name:profile.full_name,role:profile.role,is_active:action==="reactivate"}
      });
    } else {
      const {data,error}=await client.functions.invoke("admin-manage-user",{body:{user_id:profile.id,action}});
      if (error || data?.error) return alert(data?.error || error.message || "Não foi possível alterar a conta.");
      if (data?.warning) alert(data.warning);
    }
    await loadUsers();
  }

  async function createCollaborator(event) {
    event.preventDefault();
    setMessage("userError",""); setMessage("userSuccess","");
    const login_id=normalizeId($("newUserId").value),full_name=$("newUserName").value.trim(),password=$("newUserPassword").value,role=$("newUserRole").value;
    if (!/^[a-z0-9._-]{3,30}$/.test(login_id)) return setMessage("userError","O ID deve ter entre 3 e 30 caracteres: letras, números, ponto, hífen ou sublinhado.");
    if (!full_name) return setMessage("userError","Digite o nome completo.");
    if (password.length<8) return setMessage("userError","A senha inicial deve ter pelo menos 8 caracteres.");
    if (!["collaborator","default"].includes(role)) return setMessage("userError","Selecione Colaborador ou Default.");
    if (demo) {
      const id="demo-"+Date.now();
      demoProfiles.push({id,login_id,full_name,role,is_active:true,deactivated_at:null,created_at:new Date().toISOString()});
      demoHistory.unshift({id:"history-"+Date.now(),entity_type:"collaborator",action:"collaborator_create",actor_name:currentProfile.full_name,actor_login:currentProfile.login_id,created_at:new Date().toISOString(),record_data:{id,login_id,full_name,role,is_active:true}});
    }
    else {
      const { data,error } = await client.functions.invoke("admin-create-user",{body:{login_id,full_name,password,role}});
      if (error || data?.error) return setMessage("userError",data?.error || error.message);
      if (data?.warning) setMessage("userError",data.warning);
    }
    setMessage("userSuccess","Conta criada com sucesso.","success");
    $("userForm").reset();
    await loadUsers();
    setTimeout(()=>closeDialog("userModal"),900);
  }

  async function loadHistory(filter="all") {
    const list=$("historyList"); if (!list) return;
    list.replaceChildren(node("div","loading-row","Carregando histórico…"));
    if (demo) historyEntries=demoHistory;
    else {
      const since=new Date(Date.now()-86400000*30).toISOString();
      const {data,error}=await client.from("audit_logs").select("id,appointment_id,entity_type,action,actor_name,actor_login,record_data,created_at").gte("created_at",since).order("created_at",{ascending:false});
      if (error) { list.replaceChildren(node("div","loading-row","Não foi possível carregar o histórico.")); return; }
      historyEntries=data||[];
    }
    renderHistory(filter);
  }

  function renderHistory(filter="all") {
    const list=$("historyList"); list.replaceChildren();
    const entries=filter==="all"?historyEntries:historyEntries.filter(item=>{
      if (filter==="appointments") return (item.entity_type||"appointment")==="appointment";
      if (filter==="collaborators") return item.entity_type==="collaborator";
      if (filter==="visibility") return ["hide","unhide"].includes(item.action);
      return item.action===filter;
    });
    $("historyCount").textContent=historyEntries.length;
    if (!entries.length) return list.append(node("div","loading-row","Nenhuma ação encontrada neste período."));
    const labels={insert:"Agendamento criado",update:"Agendamento alterado",hide:"Agendamento ocultado",unhide:"Agendamento exibido novamente",delete:"Agendamento excluído",collaborator_create:"Conta cadastrada",collaborator_deactivate:"Conta desativada",collaborator_reactivate:"Conta reativada",collaborator_delete:"Conta excluída"};
    const symbols={insert:"+",update:"↻",hide:"◌",unhide:"◉",delete:"×",collaborator_create:"+",collaborator_deactivate:"—",collaborator_reactivate:"✓",collaborator_delete:"×"};
    const latestAppointmentState=new Map(),renderedControls=new Set();
    historyEntries.forEach(entry=>{
      const appointmentId=entry.appointment_id||entry.record_data?.id;
      if ((entry.entity_type||"appointment")==="appointment"&&appointmentId&&!latestAppointmentState.has(appointmentId)) latestAppointmentState.set(appointmentId,entry);
    });
    entries.forEach(entry=>{
      const data=entry.record_data||{},item=node("article","history-item"),icon=node("span","history-icon "+entry.action,symbols[entry.action]||"•"),content=node("div");
      const detail=entry.entity_type==="collaborator"
        ? (data.full_name||"Conta")+(data.role?" · "+roleLabel(data.role):"")+" · ID: "+(data.login_id||"indisponível")
        : (data.title||"Agendamento")+" · "+(data.appointment_date?shortDate(data.appointment_date):"data não informada")+(data.start_time?" às "+String(data.start_time).slice(0,5):"");
      content.append(node("h3","",labels[entry.action]||"Alteração registrada"),node("p","",detail),node("p","", "Por "+(entry.actor_name||"Usuário removido")+" · ID: "+(entry.actor_login||"indisponível")));
      const side=node("div","history-side"),time=node("time","",formatDateTime(entry.created_at));
      side.append(time);
      const appointmentId=entry.appointment_id||data.id,latest=latestAppointmentState.get(appointmentId);
      if (appointmentId&&latest?.action!=="delete"&&!renderedControls.has(appointmentId)) {
        renderedControls.add(appointmentId);
        const actions=node("div","history-actions"),hidden=Boolean(latest?.record_data?.is_hidden),visibility=node("button","history-action",hidden?"Exibir novamente":"Ocultar"),remove=node("button","history-action danger","Excluir evento");
        visibility.onclick=()=>toggleAppointmentVisibility(appointmentId);
        remove.onclick=()=>deleteAppointmentFromHistory(appointmentId,data.title||latest?.record_data?.title||"Agendamento");
        actions.append(visibility,remove); side.append(actions);
      }
      item.append(icon,content,side); list.append(item);
    });
  }

  function activeHistoryFilter() {
    return document.querySelector("[data-history-filter].active")?.dataset.historyFilter||"all";
  }

  async function toggleAppointmentVisibility(appointmentId) {
    if (!isAdmin()) return;
    if (demo) {
      const appointment=demoAppointments.find(item=>item.id===appointmentId);
      if (!appointment) return alert("O agendamento não existe mais.");
      appointment.is_hidden=!appointment.is_hidden;
      appointment.hidden_at=appointment.is_hidden?new Date().toISOString():null;
      appointment.hidden_by=appointment.is_hidden?currentProfile.id:null;
      demoHistory.unshift({id:"history-"+Date.now(),appointment_id:appointment.id,entity_type:"appointment",action:appointment.is_hidden?"hide":"unhide",actor_name:currentProfile.full_name,actor_login:currentProfile.login_id,created_at:new Date().toISOString(),record_data:{...appointment}});
      return loadHistory(activeHistoryFilter());
    }
    const {data:appointment,error:readError}=await client.from("appointments").select("id,title,is_hidden").eq("id",appointmentId).maybeSingle();
    if (readError) return alert("Não foi possível verificar o agendamento: "+readError.message);
    if (!appointment) return alert("O agendamento não existe mais.");
    const hide=!appointment.is_hidden;
    const {data,error}=await client.from("appointments").update({is_hidden:hide,hidden_at:hide?new Date().toISOString():null,hidden_by:hide?currentProfile.id:null}).eq("id",appointmentId).select("id");
    if (error||!data?.length) return alert("Não foi possível "+(hide?"ocultar":"exibir")+" o agendamento: "+(error?.message||"registro não encontrado"));
    await loadHistory(activeHistoryFilter());
  }

  async function deleteAppointmentFromHistory(appointmentId,title) {
    if (!isAdmin()||!confirm("Excluir permanentemente o evento “"+title+"”? O registro da exclusão continuará no histórico por até 30 dias.")) return;
    if (demo) {
      const index=demoAppointments.findIndex(item=>item.id===appointmentId);
      if (index<0) return alert("O agendamento não existe mais.");
      const [appointment]=demoAppointments.splice(index,1);
      demoHistory.unshift({id:"history-"+Date.now(),appointment_id:appointment.id,entity_type:"appointment",action:"delete",actor_name:currentProfile.full_name,actor_login:currentProfile.login_id,created_at:new Date().toISOString(),record_data:{...appointment}});
      return loadHistory(activeHistoryFilter());
    }
    const {data,error}=await client.from("appointments").delete().eq("id",appointmentId).select("id");
    if (error||!data?.length) return alert("Não foi possível excluir o evento: "+(error?.message||"registro não encontrado"));
    await loadHistory(activeHistoryFilter());
  }

  function guardAdminPage() {
    if (page === "calendar") return true;
    const denied=$("accessDenied");
    const content=document.querySelectorAll(".page-heading,.stats-row,.table-panel,.history-panel");
    if (!isAdmin()) {
      content.forEach(element=>element.hidden=true);
      if (denied) denied.hidden=false;
      return false;
    }
    if (denied) denied.hidden=true;
    return true;
  }

  function bindCommonEvents() {
    document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>closeDialog(button.dataset.close)));
    $("loginBtn")?.addEventListener("click",()=>{$("loginModal").showModal();$("loginId").focus()});
    $("loginForm")?.addEventListener("submit",signIn);
    $("logoutBtn")?.addEventListener("click",signOut);
    $("passwordBtn")?.addEventListener("click",()=>{$("passwordModal").showModal();$("newPassword").focus()});
    $("passwordForm")?.addEventListener("submit",updatePassword);
    document.querySelectorAll(".color").forEach(button=>button.addEventListener("click",()=>selectColor(button.dataset.color)));
  }

  async function initCalendar() {
    $("newBtn").onclick=()=>openAppointment();
    $("addSelectedBtn").onclick=()=>openAppointment();
    $("appointmentForm").onsubmit=saveAppointment;
    $("todayBtn").onclick=()=>{selectedDate=todayKey;viewDate=new Date(today.getFullYear(),today.getMonth(),1);renderCalendar()};
    $("prevBtn").onclick=()=>{viewDate=new Date(viewDate.getFullYear(),viewDate.getMonth()-1,1);renderCalendar()};
    $("nextBtn").onclick=()=>{viewDate=new Date(viewDate.getFullYear(),viewDate.getMonth()+1,1);renderCalendar()};
    await loadAppointments();
    subscribeRealtime();
  }

  async function initUsers() {
    $("openUserForm").onclick=()=>{$("userModal").showModal();$("newUserId").focus()};
    $("userForm").onsubmit=createCollaborator;
    $("userSearch").oninput=event=>{
      const query=event.target.value.trim().toLowerCase();
      renderUsers((window.agendaProfiles||[]).filter(profile=>(profile.login_id+" "+profile.full_name+" "+roleLabel(profile.role)).toLowerCase().includes(query)));
    };
    await loadUsers();
  }

  async function initHistory() {
    $("refreshHistory").onclick=()=>loadHistory(document.querySelector("[data-history-filter].active")?.dataset.historyFilter||"all");
    document.querySelectorAll("[data-history-filter]").forEach(button=>button.onclick=()=>{
      document.querySelectorAll("[data-history-filter]").forEach(item=>item.classList.remove("active"));
      button.classList.add("active");renderHistory(button.dataset.historyFilter);
    });
    await loadHistory();
  }

  async function init() {
    showSetupMode();
    bindCommonEvents();
    await loadIdentity();
    applyAccess();
    if (!guardAdminPage()) return;
    if (page==="calendar") await initCalendar();
    if (page==="users") await initUsers();
    if (page==="history") await initHistory();
  }

  window.addEventListener("beforeunload",()=>{if(client&&realtimeChannel)client.removeChannel(realtimeChannel)});
  init().catch(error=>{console.error(error);if($("syncStatus"))$("syncStatus").textContent="Falha ao iniciar a agenda.";});
})();
