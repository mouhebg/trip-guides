/* Trip Guides — enhancement layer
   Adds: dark mode (shared with homepage), reading progress bar, sticky TOC,
   persistent itinerary checklist, share/PDF/HTML/back-to-top, "Back to all guides" pill. */
(function(){
  'use strict';
  const STORAGE_THEME = 'tg-theme';
  const STORAGE_AG = 'tg-ag-' + location.pathname;
  const body = document.body;

  // --- Theme (synced with homepage) ---
  const savedTheme = localStorage.getItem(STORAGE_THEME) ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  body.dataset.tgTheme = savedTheme;
  function toggleTheme(){
    const next = body.dataset.tgTheme === 'dark' ? 'light' : 'dark';
    body.dataset.tgTheme = next;
    localStorage.setItem(STORAGE_THEME, next);
  }

  // --- Progress bar ---
  const bar = document.createElement('div');
  bar.className = 'tg-progress';
  document.documentElement.appendChild(bar);
  function onScroll(){
    const h = document.documentElement;
    const pct = (h.scrollTop) / Math.max(1, (h.scrollHeight - h.clientHeight)) * 100;
    bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }
  document.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  // --- Back to all guides pill ---
  const back = document.createElement('a');
  back.className = 'tg-back';
  back.href = '../';
  back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg> All guides';
  body.appendChild(back);

  // --- Build sticky TOC from h2 headings ---
  const headings = [...document.querySelectorAll('h2')].filter(h=>h.textContent.trim().length);
  if (headings.length >= 2) {
    headings.forEach((h,i) => { if (!h.id) h.id = 'tg-h-' + i; });
    const toc = document.createElement('nav');
    toc.className = 'tg-toc';
    toc.innerHTML = '<h6>On this page</h6><ol>' +
      headings.map(h => '<li><a href="#' + h.id + '">' + h.textContent.trim() + '</a></li>').join('') +
      '</ol>';
    body.appendChild(toc);
    const links = [...toc.querySelectorAll('a')];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
        }
      });
    }, {rootMargin: '-30% 0px -60% 0px'});
    headings.forEach(h => obs.observe(h));
  }

  // --- Floating actions: theme / share / PDF / top ---
  const actions = document.createElement('div');
  actions.className = 'tg-actions';
  actions.innerHTML = `
    <button class="tg-btn" data-act="theme" title="Toggle dark mode" aria-label="Toggle dark mode">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    </button>
    <button class="tg-btn" data-act="share" title="Share / copy link" aria-label="Share or copy link">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
    </button>
    <button class="tg-btn" data-act="pdf" title="Save as PDF" aria-label="Save as PDF">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h4"/><path d="M8.8 16.2h1.2a1.2 1.2 0 0 0 0-2.4H8.8v4.4"/><path d="M12.5 13.8v4.4h1.1a1.8 1.8 0 0 0 0-3.6h-1.1"/><path d="M16.5 18.2v-4.4h2.2"/><path d="M16.5 16h1.8"/></svg>
    </button>
    <button class="tg-btn" data-act="html" title="Export HTML" aria-label="Export HTML">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18-6-6 6-6"/><path d="m15 6 6 6-6 6"/><path d="m14 4-4 16"/></svg>
    </button>
    <button class="tg-btn" data-act="top" title="Back to top" aria-label="Back to top">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
    </button>`;
  body.appendChild(actions);

  function toast(msg){
    const t = document.createElement('div');
    t.className = 'tg-toast'; t.textContent = msg;
    body.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),300); }, 1800);
  }

  function pdfTitle(){
    const path = location.pathname.toLowerCase();
    if (path.includes('parc-omega')) return 'parc-omega-guide';
    if (path.includes('upper-canada-village')) return 'upper-canada-village-guide';
    return (document.title || 'trip-guide')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'trip-guide';
  }

  function savePdf(){
    const oldTitle = document.title;
    let restored = false;
    function restoreTitle(){
      if (restored) return;
      restored = true;
      document.title = oldTitle;
    }
    document.title = pdfTitle();
    window.addEventListener('afterprint', restoreTitle, {once:true});
    window.addEventListener('focus', () => window.setTimeout(restoreTitle, 500), {once:true});
    window.print();
  }

  function downloadFile(filename, content, type){
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveHtml(){
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('.tg-progress,.tg-back,.tg-toc,.tg-actions,.tg-toast').forEach(el => el.remove());
    const html = '<!doctype html>\n' + clone.outerHTML;
    downloadFile(pdfTitle() + '.html', html, 'text/html;charset=utf-8');
    toast('HTML downloaded');
  }

  actions.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'theme') toggleTheme();
    if (act === 'top') window.scrollTo({top:0, behavior:'smooth'});
    if (act === 'pdf') savePdf();
    if (act === 'html') saveHtml();
    if (act === 'share') {
      const data = {title: document.title, url: location.href};
      try {
        if (navigator.share) { await navigator.share(data); }
        else { await navigator.clipboard.writeText(location.href); toast('Link copied to clipboard'); }
      } catch(_) { /* user cancelled */ }
    }
  });

  // --- Persistent itinerary checklist ---
  const agItems = [...document.querySelectorAll('.ag-item')];
  if (agItems.length) {
    const saved = JSON.parse(localStorage.getItem(STORAGE_AG) || '[]');
    agItems.forEach((el, i) => {
      if (!el.dataset.idx) el.dataset.idx = String(i);
      if (saved.includes(i)) {
        el.classList.add('done');
        el.setAttribute('aria-pressed', 'true');
      }
    });

    // Hook into clicks (capturing) so we always persist, alongside any existing toggleAg()
    document.addEventListener('click', e => {
      const item = e.target.closest('.ag-item');
      if (!item) return;
      // Defer so toggleAg has run first
      setTimeout(persist, 0);
    });

    function persist(){
      const done = agItems.map((el,i) => el.classList.contains('done') ? i : -1).filter(i => i >= 0);
      localStorage.setItem(STORAGE_AG, JSON.stringify(done));
      updateChip(done.length, agItems.length);
    }

    // Progress chip beside the itinerary heading
    const heading = [...document.querySelectorAll('h2')].find(h => /hour by hour|itinerary|your day/i.test(h.textContent));
    if (heading) {
      const chip = document.createElement('span');
      chip.className = 'tg-progress-chip';
      chip.innerHTML = '<span class="count">0 / ' + agItems.length + '</span><span class="bar"><i></i></span>';
      heading.appendChild(chip);
      updateChip(saved.length, agItems.length);
    }

    function updateChip(done, total){
      const chip = document.querySelector('.tg-progress-chip');
      if (!chip) return;
      chip.querySelector('.count').textContent = done + ' / ' + total;
      chip.querySelector('.bar i').style.width = (done/total*100) + '%';
    }
  }
})();
