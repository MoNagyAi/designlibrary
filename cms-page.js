(async()=>{
 const params=new URLSearchParams(location.search),lang=params.get('lang')==='en'?'en':'ar';
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 try{
  const response=await fetch('portal-config.json',{cache:'no-store'});if(!response.ok)throw Error();
  const config=await response.json(),page=(config.pages||[]).find(p=>p.id===params.get('id')&&p.enabled!==false);
  if(!page)throw Error();
  document.querySelector('#title').textContent=page[lang]||page.ar||'';
  document.title=(page[lang]||page.ar||'Design Library');
  document.querySelector('#body').textContent=page[lang==='en'?'bodyEn':'bodyAr']||'';
 }catch{document.querySelector('#body').textContent=lang==='en'?'This page is unavailable.':'الصفحة غير متاحة حاليًا.';}
})();
