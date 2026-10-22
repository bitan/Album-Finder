function sanitize(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

const app={
  token:null,username:null,selectedRating:0,
  _selectedAlbum:null,

  get(id){return document.getElementById(id);},

  init(){
    this.checkTheme();

    // cache refs
    this.loginForm=this.get('login-form');
    this.regForm=this.get('reg-form');
    this.searchForm=this.get('search-form');
    this.authContainer=this.get('auth-container');
    this.loginView=this.get('login-view');
    this.registerView=this.get('register-view');
    this.dashboard=this.get('dashboard');
    this.message=this.get('message');
    this.journalModal=this.get('journal-modal');
    this.jmAlbumName=this.get('jm-album-name');
    this.jmArtistName=this.get('jm-artist-name');
    this.jmStars=this.get('jm-stars');
    this.jmReview=this.get('jm-review');
    this.jmDate=this.get('jm-date');
    this.jmSubmit=this.get('jm-submit');
    this.jmMessage=this.get('jm-message');
    this.jmAlbumId=this.get('jm-album-id');
    this.jmCoverImage=this.get('jm-cover-image');
    this.jmEntryId=this.get('jm-entry-id');
    this.jmRatingError=this.get('jm-rating-error');
    this.jmDateError=this.get('jm-date-error');
    this.jmReviewError=this.get('jm-review-error');

    // event listeners
    this.loginForm.addEventListener('submit',e=>this.login(e));
    this.regForm.addEventListener('submit',e=>this.register(e));
    this.searchForm.addEventListener('submit',e=>this.searchAlbums(e));
    this.get('logout-button').addEventListener('click',()=>this.logout());
    this.get('login-cta-btn').addEventListener('click',()=>this.showAuthForms(true));
    this.get('signup-cta-btn').addEventListener('click',()=>this.showAuthForms(false));
    document.querySelector('.close-auth-modal').addEventListener('click',()=>this.hideAuthForms());
    this.authContainer.addEventListener('click',e=>{if(e.target===this.authContainer)this.hideAuthForms();});
    document.querySelectorAll('.toggle-form').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();this.toggleView();}));
    document.querySelector('.close-journal-modal').addEventListener('click',()=>this.closeJournalModal());
    this.jmSubmit.addEventListener('click',e=>this.submitJournalForm(e));
    window.addEventListener('click',e=>{if(e.target===this.journalModal)this.closeJournalModal();});
    document.querySelectorAll('.toggle-password').forEach(btn=>btn.addEventListener('click',()=>{
      const inp=document.getElementById(btn.dataset.target);
      inp.type=inp.type==='password'?'text':'password';
      btn.textContent=inp.type==='password'?'👁':'🙈';
    }));

    // landing CTA
    const lsBtn=this.get('landing-signup-btn');
    if(lsBtn)lsBtn.addEventListener('click',()=>this.showAuthForms(false));

    // Live username validation — warn if user types an @
    const regUsernameInput=this.get('reg-username');
    if(regUsernameInput){
      regUsernameInput.addEventListener('input',()=>{
        const hint=document.querySelector('.auth-field-hint');
        if(regUsernameInput.value.includes('@')){
          hint.textContent='⚠ That looks like an email — please choose a username instead';
          hint.style.color='var(--error)';
        }else{
          hint.textContent='Letters, numbers, underscores only — no email addresses';
          hint.style.color='';
        }
      });
    }

    // detail panel
    this.get('ds-detail-close').addEventListener('click',()=>this.closeDetailPanel());
    this.get('ds-panel-overlay').addEventListener('click',()=>this.closeDetailPanel());
    this.get('ds-journal-btn').addEventListener('click',()=>{if(this._selectedAlbum)this.openJournalModal(this._selectedAlbum);});
    this.get('ds-tracks-btn').addEventListener('click',()=>{if(this._selectedAlbum)this.loadTracklist(this._selectedAlbum.id);});

    this.checkForToken();
  },

  checkTheme(){
    const t=document.getElementById('theme-toggle');
    if(!t)return;
    const saved=localStorage.getItem('theme')||'dark';
    if(saved==='light'){document.documentElement.setAttribute('data-theme','light');t.textContent='☾';}
    else{document.documentElement.removeAttribute('data-theme');t.textContent='☀';}
    t.addEventListener('click',()=>{
      const isLight=document.documentElement.getAttribute('data-theme')==='light';
      if(isLight){document.documentElement.removeAttribute('data-theme');localStorage.setItem('theme','dark');t.textContent='☀';}
      else{document.documentElement.setAttribute('data-theme','light');localStorage.setItem('theme','light');t.textContent='☾';}
    });
  },

  checkForToken(){
    this.token=localStorage.getItem('authToken');
    this.username=localStorage.getItem('username');
    if(this.token&&this.username){this.showDashboard();}else{this.showLandingView();}
  },

  showDashboard(){
    this.get('landing-page').style.display='none';
    document.body.classList.remove('landing-active');
    this.dashboard.style.display='block';
    const u=this.get('ds-username');if(u)u.textContent=this.username||'';
    const av=this.get('ds-avatar-initials');if(av&&this.username)av.textContent=this.username.charAt(0).toUpperCase();
    // restore history list
    const hist=JSON.parse(localStorage.getItem('searchHistory')||'[]');
    if(hist.length>0)this.renderHistoryList(hist[0].albums);
  },

  showLandingView(){
    this.get('landing-page').style.display='block';
    document.body.classList.add('landing-active');
    this.dashboard.style.display='none';
  },

  showAuthForms(isLogin){
    this.authContainer.style.display='flex';
    this.loginView.style.display=isLogin?'block':'none';
    this.registerView.style.display=isLogin?'none':'block';
    this.displayMessage('');
  },

  hideAuthForms(){this.authContainer.style.display='none';},

  toggleView(){
    const vis=this.loginView.style.display==='block';
    this.loginView.style.display=vis?'none':'block';
    this.registerView.style.display=vis?'block':'none';
    this.displayMessage('');
  },

  displayMessage(t,type='message'){this.message.textContent=t;this.message.className='message '+type;},

  logout(){
    this.token=null;this.username=null;
    localStorage.removeItem('authToken');localStorage.removeItem('username');
    this.showLandingView();
  },

  async login(e){
    e.preventDefault();
    const u=document.getElementById('login-username').value;
    const p=document.getElementById('login-password').value;
    const btn=this.get('login-submit-btn');
    btn.querySelector('.btn-text').style.display='none';
    btn.querySelector('.btn-spinner').style.display='inline';
    btn.disabled=true;
    try{
      const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
      const d=await r.json();
      if(r.ok){this.token=d.token;this.username=d.username;localStorage.setItem('authToken',d.token);localStorage.setItem('username',d.username);this.showDashboard();this.hideAuthForms();}
      else{this.displayMessage(d.message||'Login failed.','error');}
    }catch(err){this.displayMessage('Could not connect.','error');}
    finally{btn.querySelector('.btn-text').style.display='inline';btn.querySelector('.btn-spinner').style.display='none';btn.disabled=false;}
  },

  async register(e){
    e.preventDefault();
    const u=document.getElementById('reg-username').value.trim();
    const p=document.getElementById('reg-password').value;
    // Block email addresses being used as usernames
    if(u.includes('@')){
      this.displayMessage('Please use a username, not an email address.','error');
      return;
    }
    if(u.length<3){
      this.displayMessage('Username must be at least 3 characters.','error');
      return;
    }
    const btn=this.get('reg-submit-btn');
    btn.querySelector('.btn-text').style.display='none';
    btn.querySelector('.btn-spinner').style.display='inline';
    btn.disabled=true;
    try{
      const r=await fetch('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
      const d=await r.json();
      if(r.ok){this.token=d.token;this.username=d.username;localStorage.setItem('authToken',d.token);localStorage.setItem('username',d.username);this.showDashboard();this.hideAuthForms();}
      else{this.displayMessage(d.message||'Registration failed.','error');}
    }catch(err){this.displayMessage('Could not connect.','error');}
    finally{btn.querySelector('.btn-text').style.display='inline';btn.querySelector('.btn-spinner').style.display='none';btn.disabled=false;}
  },

  async searchAlbums(e){
    e.preventDefault();
    const q=document.getElementById('search-query').value.trim();
    if(!q)return;
    const grid=this.get('ds-album-grid');
    const resSec=this.get('ds-results-section');
    const histSec=this.get('ds-history-section');
    resSec.style.display='block';
    histSec.style.display='none';
    grid.innerHTML='<div class="ds-grid-loading">Searching...</div>';
    // clean section title — no quotes
    this.get('ds-results-label').textContent=sanitize(q);
    // spin vinyl while searching
    const disc=document.querySelector('.ds-hero-vinyl-disc');
    if(disc){disc.classList.add('spinning');}
    // reset after results load
    setTimeout(()=>{if(disc)disc.classList.remove('spinning');},2000);
    try{
      const r=await fetch('/api/search?q='+encodeURIComponent(q),{headers:{Authorization:'Bearer '+this.token}});
      const data=await r.json();
      if(r.ok){this.renderGrid(data);this.addToHistory(data,q);}
      else{grid.innerHTML='<div class="ds-grid-empty">'+(sanitize(data.message)||'Search failed.')+'</div>';if(r.status===401||r.status===403)this.logout();}
    }catch(err){grid.innerHTML='<div class="ds-grid-empty">Could not connect.</div>';}
  },

  renderGrid(albums){
    const grid=this.get('ds-album-grid');
    const count=this.get('ds-results-count');
    grid.innerHTML='';
    if(!albums||albums.length===0){grid.innerHTML='<div class="ds-grid-empty">No albums found.</div>';count.textContent='';return;}
    count.textContent='('+albums.length+')';
    albums.forEach(album=>{
      const card=document.createElement('div');
      card.className='ds-album-card';
      card.innerHTML=
        '<img class="ds-album-card-img" src="'+sanitize(album.coverImage)+'" alt="'+sanitize(album.name)+'" loading="lazy">'+
        '<div class="ds-album-card-info">'+
          '<div class="ds-album-card-title">'+sanitize(album.name)+'</div>'+
          '<div class="ds-album-card-meta">'+sanitize(album.artist)+(album.releaseDate?' · '+sanitize(String(album.releaseDate).slice(0,4)):'')+'</div>'+
          '<button class="ds-album-card-add">+ Add to Journal</button>'+
        '</div>';
      card.querySelector('img').addEventListener('click',()=>this.openDetailPanel(album));
      card.querySelector('.ds-album-card-title').addEventListener('click',()=>this.openDetailPanel(album));
      card.querySelector('.ds-album-card-add').addEventListener('click',function(ev){ev.stopPropagation();app.openJournalModal(album);});
      grid.appendChild(card);
    });
  },

  addToHistory(albums,query){
    if(!albums||albums.length===0)return;
    const stored=JSON.parse(localStorage.getItem('searchHistory')||'[]');
    const filtered=stored.filter(e=>e.query!==query);
    filtered.unshift({query,albums:albums.slice(0,12),ts:Date.now()});
    localStorage.setItem('searchHistory',JSON.stringify(filtered.slice(0,5)));
  },

  renderHistoryList(albums){
    const list=this.get('ds-history-list');
    list.innerHTML='';
    if(!albums||albums.length===0){list.innerHTML='<div class="ds-grid-empty">Search for an artist or album above to get started.</div>';return;}
    albums.forEach((album,idx)=>{
      const row=document.createElement('div');
      row.className='ds-history-row';
      row.innerHTML=
        '<span class="ds-history-num">'+String(idx+1).padStart(2,'0')+'</span>'+
        '<img class="ds-history-thumb" src="'+sanitize(album.coverImage)+'" alt="" loading="lazy">'+
        '<div class="ds-history-info">'+
          '<div class="ds-history-title">'+sanitize(album.name)+'</div>'+
          '<div class="ds-history-artist">'+sanitize(album.artist)+'</div>'+
        '</div>'+
        '<span class="ds-history-year">'+(album.releaseDate?sanitize(String(album.releaseDate).slice(0,4)):'')+'</span>'+
        '<button class="ds-history-add">+ Journal</button>';
      row.querySelector('.ds-history-thumb').addEventListener('click',()=>this.openDetailPanel(album));
      row.querySelector('.ds-history-title').addEventListener('click',()=>this.openDetailPanel(album));
      row.querySelector('.ds-history-add').addEventListener('click',function(ev){ev.stopPropagation();app.openJournalModal(album);});
      list.appendChild(row);
    });
  },

  openDetailPanel(album){
    this._selectedAlbum=album;
    this.get('ds-detail-cover-img').src=album.coverImage||'';
    this.get('ds-detail-artist').textContent=album.artist.toUpperCase();
    this.get('ds-detail-title').textContent=album.name;
    this.get('ds-detail-meta').textContent=(album.releaseDate?album.releaseDate.slice(0,4)+' · ':'')+album.artist;
    this.get('ds-detail-stats').style.display='none';
    this.get('ds-tracklist-title').style.display='none';
    this.get('ds-tracklist').innerHTML='';
    // now playing bar — always visible, update content
    this.get('ds-now-thumb').src=album.coverImage||'';
    this.get('ds-now-title').textContent=album.name;
    this.get('ds-now-artist').textContent=album.artist;
    // spin vinyl
    const disc=document.querySelector('.ds-hero-vinyl-disc');
    if(disc){disc.classList.remove('spinning');void disc.offsetWidth;disc.classList.add('spinning');}
    this.get('ds-detail-panel').classList.add('open');
    this.get('ds-panel-overlay').classList.add('open');
  },

  closeDetailPanel(){
    this.get('ds-detail-panel').classList.remove('open');
    this.get('ds-panel-overlay').classList.remove('open');
  },

  async loadTracklist(albumId){
    const list=this.get('ds-tracklist');
    this.get('ds-tracklist-title').style.display='block';
    list.innerHTML='<li style="padding:.5rem 0;color:var(--text-3);font-size:.78rem">Loading…</li>';
    try{
      const r=await fetch('/api/album/'+albumId,{headers:{Authorization:'Bearer '+this.token}});
      const album=await r.json();
      if(r.ok){
        this.get('ds-stat-tracks').textContent=album.totalTracks||'—';
        this.get('ds-stat-year').textContent=album.releaseDate||'—';
        this.get('ds-detail-stats').style.display='grid';
        list.innerHTML=album.tracks.map((t,i)=>
          '<li><span class="ds-detail-track-num">'+String(t.track_number||i+1).padStart(2,'0')+'</span>'+
          '<span class="ds-detail-track-name">'+sanitize(t.name)+'</span>'+
          '<span class="ds-detail-track-dur">'+this.fmtMs(t.duration_ms)+'</span></li>'
        ).join('');
      }else{list.innerHTML='<li style="color:var(--error);font-size:.78rem;padding:.5rem 0">Could not load tracklist.</li>';}
    }catch(e){list.innerHTML='<li style="color:var(--error);font-size:.78rem;padding:.5rem 0">Connection error.</li>';}
  },

  fmtMs(ms){if(!ms)return'—';const m=Math.floor(ms/60000),s=Math.round((ms%60000)/1000);return m+':'+(s<10?'0':'')+s;},

  openJournalModal(album){
    this.jmAlbumName.textContent=album.name;
    this.jmArtistName.textContent=album.artist;
    this.jmAlbumId.value=album.id;
    this.jmCoverImage.value=album.coverImage||'';
    this.jmEntryId.value='';
    const prev=this.get('jm-cover-preview');
    if(prev){prev.src=album.coverImage||'';prev.style.display=album.coverImage?'block':'none';}
    this.jmDate.value=new Date().toISOString().split('T')[0];
    this.jmReview.value='';
    this.jmMessage.textContent='';
    this.selectedRating=0;
    this.renderStars(this.jmStars,0);
    this.clearJournalErrors();
    this.journalModal.style.display='flex';
  },

  closeJournalModal(){
    this.journalModal.style.display='none';
    this.jmReview.value='';
    this.jmDate.value='';
    this.jmMessage.textContent='';
    this.selectedRating=0;
    this.clearJournalErrors();
  },

  renderStars(container,sel){
    container.innerHTML='';
    for(let i=1;i<=5;i++){
      const s=document.createElement('button');
      s.type='button';
      s.className='star-btn'+(i<=sel?' star-selected':'');
      s.textContent='★';
      s.addEventListener('click',()=>{this.selectedRating=i;this.renderStars(container,i);});
      container.appendChild(s);
    }
  },

  clearJournalErrors(){
    this.jmRatingError.style.display='none';
    this.jmDateError.style.display='none';
    this.jmReviewError.style.display='none';
  },

  async submitJournalForm(e){
    e.preventDefault();
    this.clearJournalErrors();
    if(!this.selectedRating||this.selectedRating<1||this.selectedRating>5){this.jmRatingError.style.display='block';return;}
    const listenedDate=this.jmDate.value;
    if(listenedDate>new Date().toISOString().split('T')[0]){this.jmDateError.style.display='block';return;}
    const review=this.jmReview.value;
    if(review.length>2000){this.jmReviewError.style.display='block';return;}
    const entryId=this.jmEntryId.value;
    const isEdit=!!entryId;
    const payload={albumId:this.jmAlbumId.value,albumName:this.jmAlbumName.textContent,artist:this.jmArtistName.textContent,coverImage:this.jmCoverImage.value,rating:this.selectedRating,review,listenedDate};
    this.jmSubmit.disabled=true;
    this.jmSubmit.querySelector('.btn-text').style.display='none';
    this.jmSubmit.querySelector('.btn-spinner').style.display='inline';
    try{
      const url=isEdit?'/api/journal/'+entryId:'/api/journal';
      const r=await fetch(url,{method:isEdit?'PATCH':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},body:JSON.stringify(payload)});
      const d=await r.json();
      if(r.ok){this.closeJournalModal();this.displayMessage(isEdit?'Entry updated.':'Added to journal.','success');}
      else if(r.status===409){this.jmMessage.innerHTML='Already logged. <a href="/journal.html?edit='+d.entryId+'" style="color:var(--accent)">Edit entry</a>';}
      else{this.jmMessage.textContent=d.message||'Could not save.';}
    }catch(err){this.jmMessage.textContent='Connection error.';}
    finally{this.jmSubmit.disabled=false;this.jmSubmit.querySelector('.btn-text').style.display='inline';this.jmSubmit.querySelector('.btn-spinner').style.display='none';}
  }
};

document.addEventListener('DOMContentLoaded',()=>app.init());

// Load real album art for landing page floating covers.
// Uses our own /api/artwork proxy so iTunes CORS never blocks the request.
async function loadLandingCovers() {
  const covers = document.querySelectorAll('.lp-float-cover[data-itunes-id]');
  if (!covers.length) return;

  // Fetch all in parallel
  const promises = Array.from(covers).map(async (cover) => {
    const id = cover.dataset.itunesId;
    try {
      const r = await fetch('/api/artwork?id=' + id);
      if (!r.ok) return;
      const d = await r.json();
      if (d.url) {
        const img = document.createElement('img');
        img.src = d.url;
        img.alt = d.name || '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:8px;';
        // fade in smoothly
        img.style.opacity = '0';
        img.style.transition = 'opacity .4s ease';
        cover.appendChild(img);
        img.onload = () => { img.style.opacity = '1'; };
      }
    } catch(e) { /* skip silently — cover stays as styled gradient */ }
  });

  await Promise.all(promises);
}

document.addEventListener('DOMContentLoaded', () => loadLandingCovers());
