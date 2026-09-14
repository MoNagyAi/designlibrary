(function(){
  function external(raw){
    if(!raw||raw.charAt(0)==='#')return false;
    var url;try{url=new URL(raw,location.href);}catch(e){return false;}
    if(!/^https?:$/.test(url.protocol))return false;
    if(url.origin===location.origin)return false;
    var bridge=window.Kodular||window.AppInventor;
    if(bridge&&typeof bridge.setWebViewString==='function'){
      bridge.setWebViewString(url.href);return true;
    }
    return false;
  }
  document.addEventListener('click',function(e){
    var anchor=e.target.closest&&e.target.closest('a[href]');
    if(anchor&&external(anchor.getAttribute('href'))){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  var originalOpen=window.open;
  window.open=function(url){if(external(String(url||'')))return null;return originalOpen.apply(window,arguments);};
})();
