/* Supabase account, saved trips, visited status, and AI trip generation. */
(function(){
  'use strict';

  const SUPABASE_URL = 'https://hkosestllbzvwqzxgkvk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_5VNqmyvhJ2O7nbhHSp2EBA_DtNuuzGb';
  const GENERATED_PATH = './generated/?id=';
  const IS_HOME = !!document.getElementById('grid');
  const client = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  let session = null;
  let savedTrips = new Map();
  let accountBar;
  let accountPanel;
  let savedList;
  let aiStatus;

  const BUILT_INS = {
    'parc-omega': {
      slug: 'parc-omega',
      title: 'Parc Omega',
      destination: 'Parc Omega, Montebello, QC',
      guide_url: './parc-omega/',
      source: 'built_in'
    },
    'upper-canada-village': {
      slug: 'upper-canada-village',
      title: 'Upper Canada Village',
      destination: 'Upper Canada Village, Morrisburg, ON',
      guide_url: './upper-canada-village/',
      source: 'built_in'
    }
  };

  function ready(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function toast(message){
    let node = document.querySelector('.copy-toast,.tg-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'copy-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    requestAnimationFrame(() => node.classList.add('show'));
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.classList.remove('show'), 2200);
  }

  function currentSlug(){
    const parts = location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  function guideMetaFromPage(){
    const slug = currentSlug();
    if (BUILT_INS[slug]) return Object.assign({}, BUILT_INS[slug], {guide_url: './'});
    const title = document.querySelector('h1')?.textContent?.trim() || document.title.replace(/\s+\|.+$/, '');
    return {
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      title,
      destination: title,
      guide_url: './',
      source: 'built_in'
    };
  }

  function tripFromHome(id){
    const trips = window.TRIP_GUIDES || [];
    const trip = trips.find(t => t.id === id) || BUILT_INS[id];
    if (!trip) return null;
    return {
      slug: trip.id || trip.slug,
      title: trip.title,
      destination: trip.location || trip.destination || trip.title,
      guide_url: trip.href || trip.guide_url || '#',
      source: trip.source || 'built_in'
    };
  }

  function rowUrl(row){
    if (row.guide_url) return row.guide_url;
    if (row.guide_data) return GENERATED_PATH + encodeURIComponent(row.id);
    return '#';
  }

  function canUseCloud(showMessage){
    if (!client) {
      if (showMessage) toast('Account features need Supabase to load.');
      return false;
    }
    if (!session) {
      if (showMessage) toast('Sign in with email to save trips.');
      return false;
    }
    return true;
  }

  async function refreshSession(){
    if (!client) return;
    const result = await client.auth.getSession();
    session = result.data.session;
    await loadSavedTrips();
    renderAccount();
    renderGuideButtons();
  }

  async function loadSavedTrips(){
    savedTrips = new Map();
    if (!client || !session) return;
    const {data, error} = await client
      .from('user_trips')
      .select('*')
      .order('updated_at', {ascending:false});
    if (error) {
      toast(error.message);
      return;
    }
    (data || []).forEach(row => savedTrips.set(row.slug, row));
  }

  async function saveTrip(meta, patch){
    if (!canUseCloud(true) || !meta) return null;
    const payload = Object.assign({
      user_id: session.user.id,
      slug: meta.slug,
      title: meta.title,
      destination: meta.destination || meta.title,
      guide_url: meta.guide_url || null,
      source: meta.source || 'built_in',
      saved: true
    }, patch || {});
    const {data, error} = await client
      .from('user_trips')
      .upsert(payload, {onConflict:'user_id,slug'})
      .select()
      .single();
    if (error) {
      toast(error.message);
      return null;
    }
    savedTrips.set(data.slug, data);
    renderAccount();
    renderGuideButtons();
    return data;
  }

  async function toggleVisited(meta){
    if (!canUseCloud(true) || !meta) return;
    const existing = savedTrips.get(meta.slug);
    const nextVisited = !existing?.visited;
    await saveTrip(meta, {
      visited: nextVisited,
      visited_at: nextVisited ? new Date().toISOString() : null
    });
    toast(nextVisited ? 'Marked as visited' : 'Visited mark removed');
  }

  async function removeSaved(row){
    if (!canUseCloud(true)) return;
    const {error} = await client.from('user_trips').delete().eq('id', row.id);
    if (error) {
      toast(error.message);
      return;
    }
    savedTrips.delete(row.slug);
    renderAccount();
    renderGuideButtons();
    toast('Trip removed');
  }

  async function sendMagicLink(form){
    const email = form.querySelector('input[type="email"]').value.trim();
    if (!email) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Sending...';
    const {error} = await client.auth.signInWithOtp({
      email,
      options: {emailRedirectTo: location.href}
    });
    button.disabled = false;
    button.textContent = 'Send link';
    toast(error ? error.message : 'Check your email for the login link.');
  }

  async function signOut(){
    if (!client) return;
    await client.auth.signOut();
    session = null;
    savedTrips = new Map();
    renderAccount();
    renderGuideButtons();
  }

  function buildAccountBar(){
    if (!IS_HOME) return;
    accountBar = document.createElement('section');
    accountBar.className = 'tg-account-bar';
    accountBar.innerHTML = `
      <div class="tg-account-copy">
        <strong>Your trip shelf</strong>
        <span data-account-status>Sign in by email to save trips and mark visits.</span>
      </div>
      <form class="tg-account-actions" data-login-form>
        <input type="email" name="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address">
        <button class="tg-primary-btn" type="submit">Send link</button>
      </form>`;
    const heroInner = document.querySelector('.hero-inner');
    if (heroInner) heroInner.appendChild(accountBar);
    accountBar.querySelector('[data-login-form]').addEventListener('submit', e => {
      e.preventDefault();
      sendMagicLink(e.currentTarget);
    });
  }

  function buildAccountPanel(){
    if (!IS_HOME) return;
    accountPanel = document.createElement('section');
    accountPanel.className = 'tg-panel';
    accountPanel.innerHTML = `
      <div class="tg-panel-head">
        <div>
          <h2>Saved trips</h2>
          <p>Cloud-synced once you sign in.</p>
        </div>
      </div>
      <div class="tg-saved-list" data-saved-list></div>
      <form class="tg-ai-form" data-ai-form>
        <div>
          <h2>Add a trip with AI</h2>
          <p>DeepSeek will generate the same kind of guide structure, then save it to your account.</p>
        </div>
        <div class="row">
          <input name="destination" required placeholder="Destination, city, or attraction" aria-label="Destination">
          <input name="start" placeholder="Starting point" aria-label="Starting point">
        </div>
        <textarea name="notes" placeholder="Who is going, mobility needs, must-see stops, timing, lunch preferences..." aria-label="Trip notes"></textarea>
        <button class="tg-primary-btn" type="submit">Generate trip</button>
        <div class="tg-ai-status" data-ai-status></div>
      </form>`;
    const main = document.querySelector('main.wrap');
    if (main) main.prepend(accountPanel);
    savedList = accountPanel.querySelector('[data-saved-list]');
    aiStatus = accountPanel.querySelector('[data-ai-status]');
    accountPanel.querySelector('[data-ai-form]').addEventListener('submit', generateTrip);
  }

  function renderAccount(){
    if (!accountBar) return;
    const status = accountBar.querySelector('[data-account-status]');
    const actions = accountBar.querySelector('.tg-account-actions');
    if (session) {
      status.textContent = 'Signed in as ' + session.user.email;
      actions.innerHTML = '<button class="tg-small-btn" type="button" data-sign-out>Sign out</button>';
      actions.querySelector('[data-sign-out]').onclick = signOut;
    } else {
      status.textContent = 'Sign in by email to save trips and mark visits.';
      actions.innerHTML = '<input type="email" name="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address"><button class="tg-primary-btn" type="submit">Send link</button>';
    }
    renderSavedList();
  }

  function renderSavedList(){
    if (!savedList) return;
    if (!session) {
      savedList.innerHTML = '<div class="tg-saved-row"><div><div class="tg-saved-title">No account yet</div><div class="tg-saved-meta">Send yourself a magic link to start saving trips.</div></div></div>';
      renderCloudFavs();
      return;
    }
    const rows = [...savedTrips.values()];
    if (!rows.length) {
      savedList.innerHTML = '<div class="tg-saved-row"><div><div class="tg-saved-title">Nothing saved yet</div><div class="tg-saved-meta">Use the heart on any guide to add it here.</div></div></div>';
      renderCloudFavs();
      return;
    }
    savedList.innerHTML = rows.map(row => `
      <div class="tg-saved-row" data-row-id="${row.id}">
        <div>
          <div class="tg-saved-title">${escapeHtml(row.title)}</div>
          <div class="tg-saved-meta">${escapeHtml(row.destination || '')}${row.visited ? ' - visited' : ''}</div>
        </div>
        <div class="tg-saved-actions">
          <a class="tg-small-btn" href="${rowUrl(row)}">Open</a>
          <button class="tg-cloud-btn" type="button" data-visit="${row.slug}" aria-pressed="${row.visited ? 'true' : 'false'}">${row.visited ? 'Visited' : 'Mark visited'}</button>
          <button class="tg-small-btn" type="button" data-remove="${row.slug}">Remove</button>
        </div>
      </div>`).join('');
    savedList.querySelectorAll('[data-visit]').forEach(btn => {
      btn.onclick = () => toggleVisited(savedTrips.get(btn.dataset.visit));
    });
    savedList.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => removeSaved(savedTrips.get(btn.dataset.remove));
    });
    renderCloudFavs();
  }

  function renderCloudFavs(){
    if (!IS_HOME || !session) return;
    document.querySelectorAll('.fav[data-id]').forEach(btn => {
      btn.setAttribute('aria-pressed', savedTrips.has(btn.dataset.id) ? 'true' : 'false');
    });
  }

  function attachHomeSaveCapture(){
    document.addEventListener('click', async e => {
      const fav = e.target.closest('.fav');
      if (!fav) return;
      if (!session) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const meta = tripFromHome(fav.dataset.id);
      if (!meta) return;
      const existing = savedTrips.get(meta.slug);
      if (existing) await removeSaved(existing);
      else {
        await saveTrip(meta);
        toast('Trip saved');
      }
    }, true);
  }

  function renderGuideButtons(){
    if (IS_HOME) return;
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions || !client) return;
    let group = document.querySelector('.tg-guide-account');
    if (!group) {
      group = document.createElement('div');
      group.className = 'tg-guide-account';
      headerActions.insertAdjacentElement('afterend', group);
    }
    const meta = guideMetaFromPage();
    const row = savedTrips.get(meta.slug);
    group.innerHTML = `
      <button class="tg-cloud-btn" type="button" data-guide-save aria-pressed="${row ? 'true' : 'false'}">${row ? 'Saved' : 'Save trip'}</button>
      <button class="tg-cloud-btn" type="button" data-guide-visited aria-pressed="${row?.visited ? 'true' : 'false'}">${row?.visited ? 'Visited' : 'Mark visited'}</button>`;
    group.querySelector('[data-guide-save]').onclick = async () => {
      if (!session) return toast('Sign in from All guides first.');
      if (row) await removeSaved(row);
      else {
        await saveTrip(meta);
        toast('Trip saved');
      }
    };
    group.querySelector('[data-guide-visited]').onclick = () => toggleVisited(meta);
  }

  async function generateTrip(e){
    e.preventDefault();
    if (!canUseCloud(true)) return;
    const form = e.currentTarget;
    const payload = {
      destination: form.destination.value.trim(),
      start: form.start.value.trim(),
      notes: form.notes.value.trim()
    };
    if (!payload.destination) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    aiStatus.textContent = 'Generating guide...';
    const {data, error} = await client.functions.invoke('generate-trip', {body: payload});
    button.disabled = false;
    if (error) {
      aiStatus.textContent = 'AI function is not deployed or missing the DeepSeek key yet.';
      toast(error.message || 'AI generation failed');
      return;
    }
    if (data?.trip) {
      savedTrips.set(data.trip.slug, data.trip);
      renderSavedList();
      aiStatus.textContent = 'Saved. Open it from your saved trips.';
      form.reset();
    }
  }

  function escapeHtml(value){
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[char]));
  }

  ready(async () => {
    if (!client) return;
    buildAccountBar();
    buildAccountPanel();
    attachHomeSaveCapture();
    if (IS_HOME) {
      const grid = document.getElementById('grid');
      if (grid) new MutationObserver(renderCloudFavs).observe(grid, {childList:true});
    }
    await refreshSession();
    client.auth.onAuthStateChange(async (_event, nextSession) => {
      session = nextSession;
      await loadSavedTrips();
      renderAccount();
      renderCloudFavs();
      renderGuideButtons();
    });
  });
})();
