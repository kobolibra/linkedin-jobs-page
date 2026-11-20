/* Shared by the page and its worker: filtering never reads layout or DOM. */
((scope)=>{
  function ageMatch(sel,age){if(sel==='all')return true;if(age==null)return false;if(sel.endsWith('+'))return age>=Number(sel.slice(0,-1));const [a,b]=sel.split('-').map(Number);return b==null?age===a:age>=a&&age<=b;}
  function query(records,state){
    const favorites=new Set(state.favorites),blocked=new Set(state.blocked),keywords=state.keywords||[],q=state.q||'';
    const indices=[],company=[];let active=0;
    for(let i=0;i<records.length;i++){
      const r=records[i];
      if(blocked.has(r.comp)||keywords.some(word=>r.title.includes(word))||(state.region!=='all'&&r.region!==state.region)||(state.city!=='all'&&r.city!==state.city)||(state.company!=='all'&&r.comp!==state.company)||(state.favoriteOnly&&!favorites.has(r.id))||(q&&!r.search.includes(q)))continue;
      // The company distribution intentionally excludes the selected age bucket.
      if(state.company!=='all')company.push(i);
      if((state.activeOnly&&r.status==='expired')||!ageMatch(state.age,r.age))continue;
      indices.push(i);if(r.status!=='expired')active++;
    }
    return {indices,company,active};
  }
  scope.JobListQuery={query,ageMatch};
})(typeof self!=='undefined'?self:globalThis);
