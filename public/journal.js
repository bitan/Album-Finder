function sanitize(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function formatDate(d){if(!d)return'';const[y,m,day]=d.split('-').map(Number);return new Date(y,m-1,day).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});}

const journalApp={
  token:null,username:null,entries:[],selectedRating:0,pendingDeleteId:null,

  init(){
    this.token=localStorage.getItem('authToken');
    this.username=localStorage.getItem('username');
    if(!this.token||!this.username){window.location.href='/';return;}

    // theme
    const tt=document.getElementById('theme-toggle');
    const saved=localStorage.getItem('theme')||'dark';
    if(saved==='light'){document.documentElement.setAttribute('data-theme','light');tt.textContent='☾';}
    else{document.documentElement.removeAttribute('data-theme');tt.textContent='☀';}
    tt.addEventListener('click',()=>{
      const isLight=document.documentElement.getAttribute('data-theme')==='light';
      if(isLight){document.documentElement.removeAttribute('data-theme');localStorage.setItem('theme','dark');tt.textContent='☀';}
      else{document.documentElement.setAttribute('data-theme','light');localStorage.setItem('theme','light');tt.textContent='☾';}
    });

    // Fix: show only the username part (strip email domain if it looks like an email)
    const displayName = this.username.includes('@')
      ? this.username.split('@')[0]
      : this.username;

    // Avatar initial
    const av=document.getElementById('jn-avatar');
    if(av)av.textContent=displayName.charAt(0).toUpperCase();

    // Nav username
    const un=document.getElementById('jn-username');
    if(un)un.textContent=displayName;

    // Hero greeting — split into greeting line + name heading
    const h=new Date().getHours();
    const greeting=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
    const grLine=document.getElementById('jn-greeting-line');
    if(grLine)grLine.textContent=greeting;
    const nameTitle=document.getElementById('jn-username-title');
    if(nameTitle)nameTitle.textContent=displayName;

    document.getElementById('logout-button').addEventListener('click',()=>{localStorage.clear();window.location.href='/';});
    document.querySelector('.close-journal-modal').addEventListener('click',()=>this.closeModal());
    window.addEventListener('click',e=>{
      if(e.target===document.getElementById('journal-modal'))this.closeModal();
      if(e.target===document.getElementById('confirm-modal'))this.cancelDelete();
    });
    document.getElementById('jm-submit').addEventListener('click',e=>this.submitEdit(e));
    document.getElementById('confirm-delete-btn').addEventListener('click',()=>this.deleteEntry(this.pendingDeleteId));
    document.getElementById('cancel-delete-btn').addEventListener('click',()=>this.cancelDelete());

    const params=new URLSearchParams(window.location.search);
    const editId=params.get('edit');
    this.loadJournal().then(()=>{
      if(editId){const e=this.entries.find(x=>x.entryId===editId);if(e)this.openEditModal(e);}
    });
  },

  async loadJournal(){
    const c=document.getElementById('journal-container');
    c.innerHTML='<div class="jn-empty">Loading…</div>';
    try{
      const r=await fetch('/api/journal',{headers:{Authorization:'Bearer '+this.token}});
      if(r.status===401||r.status===403){localStorage.clear();window.location.href='/';return;}
      if(!r.ok){c.innerHTML='<div class="jn-empty">Could not load journal.</div>';return;}
      this.entries=await r.json();
      this.renderEntries(this.entries);
      this.renderStats(this.entries);
    }catch{c.innerHTML='<div class="jn-empty">Connection error.</div>';}
  },

  renderEntries(entries){
    const c=document.getElementById('journal-container');
    c.innerHTML='';
    // update count badge
    const countEl=document.getElementById('jn-entry-count');
    if(countEl)countEl.textContent=entries.length>0?'('+entries.length+')':'';

    if(!entries||entries.length===0){
      c.innerHTML='<div class="jn-empty">No entries yet.<br><a href="/">Search for an album</a> to start logging.</div>';
      return;
    }

    entries.forEach(entry=>{
      const card=document.createElement('div');
      card.className='jn-entry-card';
      // filled + hollow stars
      const filledStars='★'.repeat(entry.rating||0);
      const emptyStars='☆'.repeat(5-(entry.rating||0));
      card.innerHTML=
        '<img class="jn-entry-img" src="'+sanitize(entry.coverImage)+'" alt="'+sanitize(entry.albumName)+'" loading="lazy">'+
        '<div class="jn-entry-info">'+
          '<div class="jn-entry-title">'+sanitize(entry.albumName)+'</div>'+
          '<div class="jn-entry-artist">'+sanitize(entry.artist)+'</div>'+
          '<div class="jn-entry-date">'+formatDate(entry.listenedDate)+'</div>'+
          '<div class="jn-entry-stars">'+filledStars+'<span style="opacity:.3">'+emptyStars+'</span></div>'+
        '</div>'+
        '<div class="jn-entry-actions">'+
          '<button class="jn-entry-edit">Edit</button>'+
          '<button class="jn-entry-del">✕</button>'+
        '</div>';
      card.querySelector('.jn-entry-edit').addEventListener('click',e=>{e.stopPropagation();this.openEditModal(entry);});
      card.querySelector('.jn-entry-del').addEventListener('click',e=>{e.stopPropagation();this.confirmDelete(entry.entryId);});
      c.appendChild(card);
    });
  },

  renderStats(entries){
    const total=entries.length;
    document.getElementById('stat-total').textContent=total;
    if(total>0){
      const avg=(entries.reduce((a,e)=>a+(e.rating||0),0)/total).toFixed(1);
      document.getElementById('stat-avg').textContent=avg;
    }else{
      document.getElementById('stat-avg').textContent='—';
    }
    const now=new Date();const cy=now.getFullYear(),cm=now.getMonth();
    const monthly=new Set(
      entries
        .filter(e=>{if(!e.listenedDate)return false;const[y,m]=e.listenedDate.split('-').map(Number);return y===cy&&m-1===cm;})
        .map(e=>e.albumId)
    ).size;
    document.getElementById('stat-monthly').textContent=monthly;
  },

  openEditModal(entry){
    document.getElementById('jm-album-name').textContent=entry.albumName;
    document.getElementById('jm-artist-name').textContent=entry.artist;
    document.getElementById('jm-album-id').value=entry.albumId;
    document.getElementById('jm-cover-image').value=entry.coverImage||'';
    document.getElementById('jm-entry-id').value=entry.entryId;
    document.getElementById('jm-date').value=entry.listenedDate;
    document.getElementById('jm-review').value=entry.review||'';
    document.getElementById('jm-message').textContent='';
    const prev=document.getElementById('jm-cover-preview');
    if(prev){prev.src=entry.coverImage||'';prev.style.display=entry.coverImage?'block':'none';}
    this.selectedRating=entry.rating;
    this.renderStars(document.getElementById('jm-stars'),entry.rating);
    document.getElementById('jm-rating-error').style.display='none';
    document.getElementById('jm-date-error').style.display='none';
    document.getElementById('jm-review-error').style.display='none';
    document.getElementById('journal-modal').style.display='flex';
  },

  closeModal(){document.getElementById('journal-modal').style.display='none';},

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

  async submitEdit(e){
    e.preventDefault();
    const re=document.getElementById('jm-rating-error');
    const de=document.getElementById('jm-date-error');
    const rve=document.getElementById('jm-review-error');
    re.style.display='none';de.style.display='none';rve.style.display='none';
    if(!this.selectedRating||this.selectedRating<1||this.selectedRating>5){re.style.display='block';return;}
    const listenedDate=document.getElementById('jm-date').value;
    if(listenedDate>new Date().toISOString().split('T')[0]){de.style.display='block';return;}
    const review=document.getElementById('jm-review').value;
    if(review.length>2000){rve.style.display='block';return;}
    const entryId=document.getElementById('jm-entry-id').value;
    const btn=document.getElementById('jm-submit');
    btn.disabled=true;
    btn.querySelector('.btn-text').style.display='none';
    btn.querySelector('.btn-spinner').style.display='inline';
    try{
      const r=await fetch('/api/journal/'+entryId,{
        method:'PATCH',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},
        body:JSON.stringify({rating:this.selectedRating,review,listenedDate})
      });
      const d=await r.json();
      if(r.ok){
        const idx=this.entries.findIndex(e=>e.entryId===entryId);
        if(idx!==-1)this.entries[idx]={...this.entries[idx],rating:this.selectedRating,review,listenedDate};
        this.closeModal();
        this.renderEntries(this.entries);
        this.renderStats(this.entries);
      }else{
        document.getElementById('jm-message').textContent=d.message||'Could not update.';
      }
    }catch{
      document.getElementById('jm-message').textContent='Connection error.';
    }finally{
      btn.disabled=false;
      btn.querySelector('.btn-text').style.display='inline';
      btn.querySelector('.btn-spinner').style.display='none';
    }
  },

  confirmDelete(id){
    this.pendingDeleteId=id;
    document.getElementById('confirm-modal').style.display='flex';
  },

  cancelDelete(){
    this.pendingDeleteId=null;
    document.getElementById('confirm-modal').style.display='none';
  },

  async deleteEntry(id){
    document.getElementById('confirm-modal').style.display='none';
    try{
      const r=await fetch('/api/journal/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+this.token}});
      if(r.ok){
        this.entries=this.entries.filter(e=>e.entryId!==id);
        this.renderEntries(this.entries);
        this.renderStats(this.entries);
      }else{
        const d=await r.json();
        alert(d.message||'Could not delete.');
      }
    }catch{alert('Connection error.');}
    finally{this.pendingDeleteId=null;}
  }
};

document.addEventListener('DOMContentLoaded',()=>journalApp.init());
