/* Supabase account, saved trips, visited status, AI generation, and HTML imports. */
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
  let uploadStatus;

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

  function escapeHtml(value){
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[char]));
  }

  function slugify(value){
    return String(value || 'trip')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'trip';
  }

  function shortId(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().slice(0, 8);
    return Math.random().toString(36).slice(2, 10);
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
      slug: slug || slugify(title),
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

  function hashString(value){
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }

  function makeThumbnail(title, subtitle){
    const palettes = [
      ['#3a6b4c', '#d9a665', '#fff7ec'],
      ['#6e4a22', '#b07a3a', '#fff8ef'],
      ['#315b63', '#e0a17a', '#f8fbf5'],
      ['#5c6f3a', '#d8c58b', '#fffaf0'],
      ['#6a4f7a', '#d2a36b', '#fff8f1']
    ];
    const palette = palettes[hashString(title) % palettes.length];
    const safeTitle = escapeHtml(title).slice(0, 42);
    const safeSub = escapeHtml(subtitle || 'Trip Guide').slice(0, 54);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${palette[0]}"/>
          <stop offset="1" stop-color="${palette[1]}"/>
        </linearGradient>
      </defs>
      <rect width="960" height="600" fill="url(#g)"/>
      <circle cx="760" cy="120" r="72" fill="${palette[2]}" opacity=".42"/>
      <path d="M0 430c120-80 236-62 350-92 154-40 254-122 456-52 70 24 114 54 154 84v230H0z" fill="${palette[2]}" opacity=".33"/>
      <path d="M84 494c140-54 282-34 426-70 126-32 228-48 366 8v168H84z" fill="#111" opacity=".18"/>
      <text x="70" y="118" fill="${palette[2]}" font-family="Georgia,serif" font-size="42" font-weight="700">Trip Guide</text>
      <text x="70" y="410" fill="${palette[2]}" font-family="Georgia,serif" font-size="62" font-weight="700">${safeTitle}</text>
      <text x="72" y="468" fill="${palette[2]}" font-family="Arial,sans-serif" font-size="28" opacity=".88">${safeSub}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function firstUsableImage(doc){
    const meta = doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]')?.getAttribute('content');
    const image = meta || doc.querySelector('img[src]')?.getAttribute('src');
    if (!image) return '';
    const trimmed = image.trim();
    if (/^(https?:|data:image\/)/i.test(trimmed)) return trimmed;
    return '';
  }

  function thumbnailForRow(row){
    const homeTrip = (window.TRIP_GUIDES || []).find(trip => trip.id === row.slug);
    if (homeTrip?.photo) return homeTrip.photo;
    const guide = row.guide_data || {};
    return guide.thumbnail || guide.cover_image || guide.photo || guide.image || makeThumbnail(row.title, guide.location || row.destination);
  }

  function parseDistance(value){
    const match = String(value || '').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function cleanText(value, fallback){
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback || '';
  }

  function rowToHomeTrip(row){
    if (!row.guide_data || row.source === 'built_in') return null;
    const guide = row.guide_data || {};
    const isUpload = guide.type === 'uploaded_html';
    const tags = Array.isArray(guide.tags) && guide.tags.length
      ? guide.tags.slice(0, 4).map(tag => cleanText(tag, 'Trip'))
      : [isUpload ? 'Uploaded' : 'AI', 'Saved'];
    const distanceText = cleanText(guide.distance, '');
    return {
      id: row.slug,
      href: rowUrl(row),
      title: cleanText(row.title || guide.title, 'Saved trip'),
      location: cleanText(guide.location || row.destination, 'Saved trip'),
      desc: cleanText(guide.summary || guide.intro || 'A saved custom guide in your account.', 'A saved custom guide in your account.'),
      tags,
      distance: parseDistance(distanceText),
      duration: cleanText(guide.duration, isUpload ? 'Uploaded guide' : 'AI guide'),
      season: cleanText(guide.season, 'Saved'),
      added: row.created_at || row.updated_at || new Date().toISOString(),
      cover: 'placeholder',
      available: true,
      photo: thumbnailForRow(row),
      photoAlt: cleanText(row.title || guide.title, 'Trip thumbnail'),
      source: row.source || 'ai'
    };
  }

  function syncHomeTrips(){
    if (!IS_HOME || typeof window.setCloudTripGuides !== 'function') return;
    const cloudCards = session
      ? [...savedTrips.values()].map(rowToHomeTrip).filter(Boolean)
      : [];
    window.setCloudTripGuides(cloudCards);
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
    if (!client || !session) {
      syncHomeTrips();
      return;
    }
    const {data, error} = await client
      .from('user_trips')
      .select('*')
      .order('updated_at', {ascending:false});
    if (error) {
      toast(error.message);
      syncHomeTrips();
      return;
    }
    (data || []).forEach(row => savedTrips.set(row.slug, row));
    syncHomeTrips();
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
    syncHomeTrips();
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
    if (!canUseCloud(true) || !row) return;
    const {error} = await client.from('user_trips').delete().eq('id', row.id);
    if (error) {
      toast(error.message);
      return;
    }
    savedTrips.delete(row.slug);
    syncHomeTrips();
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
    syncHomeTrips();
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
          <p>Cloud-synced once you sign in. AI and uploaded guides also appear as cards below.</p>
        </div>
      </div>
      <div class="tg-saved-list" data-saved-list></div>
      <form class="tg-ai-form" data-ai-form>
        <div>
          <h2>Add a trip with AI</h2>
          <p>DeepSeek generates a complete guide with the same card, directions, PDF, itinerary, and tips structure.</p>
        </div>
        <div class="row">
          <input name="destination" required placeholder="Destination, city, or attraction" aria-label="Destination">
          <input name="start" placeholder="Starting point" aria-label="Starting point">
        </div>
        <textarea name="notes" placeholder="Who is going, mobility needs, must-see stops, timing, lunch preferences..." aria-label="Trip notes"></textarea>
        <button class="tg-primary-btn" type="submit">Generate trip</button>
        <div class="tg-ai-status" data-ai-status></div>
      </form>
      <form class="tg-upload-form" data-upload-form>
        <div>
          <h2>Upload an HTML guide</h2>
          <p>Import an existing HTML file into your account. It gets a home card, thumbnail, and saved-trip controls.</p>
        </div>
        <div class="row">
          <input name="title" placeholder="Optional title override" aria-label="Optional title override">
          <input name="html" type="file" accept=".html,.htm,text/html" required aria-label="HTML guide file">
        </div>
        <button class="tg-primary-btn" type="submit">Upload HTML</button>
        <div class="tg-upload-status" data-upload-status></div>
      </form>`;
    const main = document.querySelector('main.wrap');
    if (main) main.prepend(accountPanel);
    savedList = accountPanel.querySelector('[data-saved-list]');
    aiStatus = accountPanel.querySelector('[data-ai-status]');
    uploadStatus = accountPanel.querySelector('[data-upload-status]');
    accountPanel.querySelector('[data-ai-form]').addEventListener('submit', generateTrip);
    accountPanel.querySelector('[data-upload-form]').addEventListener('submit', uploadHtmlGuide);
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

  function savedThumbHtml(row){
    const thumb = thumbnailForRow(row);
    return `<div class="tg-saved-thumb">${thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : ''}</div>`;
  }

  function renderSavedList(){
    if (!savedList) return;
    if (!session) {
      savedList.innerHTML = '<div class="tg-saved-row"><div class="tg-saved-main"><div class="tg-saved-thumb"></div><div><div class="tg-saved-title">No account yet</div><div class="tg-saved-meta">Send yourself a magic link to start saving trips.</div></div></div></div>';
      renderCloudFavs();
      return;
    }
    const rows = [...savedTrips.values()];
    if (!rows.length) {
      savedList.innerHTML = '<div class="tg-saved-row"><div class="tg-saved-main"><div class="tg-saved-thumb"></div><div><div class="tg-saved-title">Nothing saved yet</div><div class="tg-saved-meta">Use the heart on any guide to add it here, generate one with AI, or upload HTML.</div></div></div></div>';
      renderCloudFavs();
      return;
    }
    savedList.innerHTML = rows.map(row => `
      <div class="tg-saved-row" data-row-id="${escapeHtml(row.id)}">
        <div class="tg-saved-main">
          ${savedThumbHtml(row)}
          <div>
            <div class="tg-saved-title">${escapeHtml(row.title)}</div>
            <div class="tg-saved-meta">${escapeHtml(row.destination || '')}${row.visited ? ' - visited' : ''}</div>
          </div>
        </div>
        <div class="tg-saved-actions">
          <a class="tg-small-btn" href="${escapeHtml(rowUrl(row))}">Open</a>
          <button class="tg-cloud-btn" type="button" data-visit="${escapeHtml(row.slug)}" aria-pressed="${row.visited ? 'true' : 'false'}">${row.visited ? 'Visited' : 'Mark visited'}</button>
          <button class="tg-small-btn" type="button" data-remove="${escapeHtml(row.slug)}">Remove</button>
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

  async function invokeGenerateTrip(payload, timeoutMs){
    const auth = await client.auth.getSession();
    const token = auth.data.session?.access_token;
    if (!token) return {error: new Error('Sign in again before generating a trip.')};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-trip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_error) {
          data = {error: text};
        }
      }
      if (!response.ok) {
        return {data, error: new Error(data?.error || data?.message || `AI generation failed (${response.status})`)};
      }
      return {data, error: null};
    } catch (error) {
      if (error.name === 'AbortError') {
        return {error: new Error('AI generation timed out after 90 seconds. Try again with shorter notes.')};
      }
      return {error};
    } finally {
      clearTimeout(timer);
    }
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
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Generating...';
    aiStatus.textContent = 'Generating guide... this can take up to 90 seconds.';
    try {
      const {data, error} = await invokeGenerateTrip(payload, 90000);
      if (error) {
        aiStatus.textContent = error.message || 'AI generation failed.';
        toast(error.message || 'AI generation failed');
        return;
      }
      if (data?.trip) {
        savedTrips.set(data.trip.slug, data.trip);
        syncHomeTrips();
        renderSavedList();
        aiStatus.textContent = 'Saved and added to the home grid.';
        form.reset();
        return;
      }
      aiStatus.textContent = 'The AI function responded, but no trip was saved.';
      toast('No trip was saved');
    } finally {
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }

  function sanitizeUploadedHtml(raw){
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script,iframe,object,embed').forEach(node => node.remove());
    doc.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) el.removeAttribute(attr.name);
      });
    });
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  function parseUploadedGuide(raw, fileName, titleOverride){
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const title = cleanText(
      titleOverride ||
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      doc.querySelector('h1')?.textContent ||
      doc.querySelector('title')?.textContent ||
      fileName.replace(/\.[^.]+$/, ''),
      'Uploaded guide'
    );
    const summary = cleanText(
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('p')?.textContent,
      'An uploaded HTML guide saved to your trip shelf.'
    );
    const location = cleanText(
      doc.querySelector('[data-location]')?.textContent ||
      doc.querySelector('.loc,.location,[class*="location"]')?.textContent,
      title
    );
    const thumbnail = firstUsableImage(doc) || makeThumbnail(title, location);
    return {
      slug: `${slugify(title)}-${shortId()}`,
      title,
      destination: location,
      guide_data: {
        type: 'uploaded_html',
        title,
        location,
        summary,
        trip_type: 'Uploaded guide',
        distance: '',
        duration: 'Guide',
        season: 'Saved',
        tags: ['Uploaded', 'Saved'],
        thumbnail,
        uploaded_filename: fileName,
        uploaded_at: new Date().toISOString(),
        html: sanitizeUploadedHtml(raw)
      }
    };
  }

  async function uploadHtmlGuide(e){
    e.preventDefault();
    if (!canUseCloud(true)) return;
    const form = e.currentTarget;
    const fileInput = form.elements.html;
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > 900000) {
      uploadStatus.textContent = 'Please keep uploads under 900 KB for now.';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    uploadStatus.textContent = 'Reading HTML...';
    try {
      const raw = await file.text();
      const parsed = parseUploadedGuide(raw, file.name, form.title.value.trim());
      uploadStatus.textContent = 'Saving guide...';
      const row = await saveTrip({
        slug: parsed.slug,
        title: parsed.title,
        destination: parsed.destination,
        guide_url: null,
        source: 'ai'
      }, {
        guide_data: parsed.guide_data,
        visited: false,
        visited_at: null
      });
      if (row) {
        uploadStatus.textContent = 'Uploaded and added to the home grid.';
        form.reset();
      }
    } catch (error) {
      uploadStatus.textContent = 'Could not upload that HTML file.';
      toast(error.message || 'Upload failed');
    } finally {
      button.disabled = false;
    }
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
