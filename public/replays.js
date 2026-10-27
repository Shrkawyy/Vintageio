// Replays record visible game state only. Playback has its own renderer and never
// replaces the live world or sends recorded input back to the server.
export const REPLAY_WINDOW_MS = 30000;
export const REPLAY_SAMPLE_MS = 1000 / 15;
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;

// Hundredths of a world unit stay below a pixel even at maximum zoom. Avoid
// retaining long simulation decimals for every pellet in every recorded frame.
const visualNumbers = new Set(['x', 'y', 'mass', 'radius', 'feedMass']);
const pick = (source, keys) => Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => {
  const value = source[key];
  return [key, visualNumbers.has(key) && Number.isFinite(value) ? Math.round(value * 100) / 100 : value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):value];
}));
const cellKeys = ['id', 'x', 'y', 'mass', 'skinUrl'];
const foodKeys = ['feedId', 'ownerId', 'x', 'y', 'mass', 'radius', 'color', 'ejected'];
const virusKeys = ['id', 'x', 'y', 'mass', 'feedMass'];

export class ReplayBuffer {
  constructor({windowMs = REPLAY_WINDOW_MS, maxBytes = MAX_BUFFER_BYTES} = {}) {
    this.windowMs = windowMs;
    this.maxBytes = maxBytes;
    this.reset();
  }
  reset() {
    this.frames = []; this.bytes = 0; this.lastAt = -Infinity;
    this.cellIds = new WeakMap(); this.nextCellId = 0;
    this.foodPool = new Map(); this.foodValues = new Map(); this.nextFoodId = 0;
  }
  retainFood(food) {
    const json = JSON.stringify(pick(food, foodKeys));
    let entry = this.foodPool.get(json);
    if (!entry) {
      entry = {id: ++this.nextFoodId, json, refs: 0, bytes: json.length * 2 + 96};
      this.foodPool.set(json, entry); this.foodValues.set(entry.id, entry);this.bytes += entry.bytes;
    }
    entry.refs++;
    return entry.id;
  }
  dropOldest() {
    const frame = this.frames.shift(); this.bytes -= frame.bytes;
    for (const id of frame.foodIds) {
      const entry = this.foodValues.get(id);
      if (--entry.refs === 0) {
        this.foodValues.delete(id);this.foodPool.delete(entry.json);this.bytes -= entry.bytes;
      }
    }
  }
  capture(now, snapshot, view) {
    if (now - this.lastAt < REPLAY_SAMPLE_MS || !snapshot?.players?.length) return;
    // Most pellets stay still for the entire clip. Keep one copy and reference
    // it from each frame; ejected or consumed pellets still retain their history.
    const foodIds = (snapshot.food || []).map(food => this.retainFood(food));
    const state = {
      mode: snapshot.mode, worldSize: snapshot.worldSize, vision: snapshot.vision,
      players: snapshot.players.map(player => ({
        ...pick(player, ['id', 'name', 'color', 'teamId', 'tag', 'skinUrl', 'shieldId', 'flagId', 'titleId', 'titlePosition', 'nameColor', 'nameStyle']),
        cells: (player.cells || []).map(cell => {
          if (cell.id == null && !this.cellIds.has(cell)) this.cellIds.set(cell, ++this.nextCellId);
          return {...pick(cell, cellKeys), id: cell.id ?? 'local-' + this.cellIds.get(cell)};
        })
      })),
      food: foodIds,
      viruses: (snapshot.viruses || []).map(virus => pick(virus, virusKeys))
    };
    const json = JSON.stringify({state, ...view});
    const bytes = json.length * 2 + foodIds.length * 8 + 96;
    this.lastAt = now;
    this.frames.push({at: now, json, bytes, foodIds});
    this.bytes += bytes;
    while (this.frames.length && (this.bytes > this.maxBytes || (this.frames.length > 1 && now - this.frames[0].at > this.windowMs))) this.dropOldest();
  }
  get duration() { return this.frames.length < 2 ? 0 : this.frames.at(-1).at - this.frames[0].at; }
  clip(settings, metadata = {}) {
    if (this.duration < 500) return null;
    const start = this.frames[0].at;
    return {
      version: 2, ...metadata, duration: this.duration,
      settings: JSON.parse(JSON.stringify(settings)),
      foodPool: Object.fromEntries([...this.foodValues.values()].map(entry => [entry.id, JSON.parse(entry.json)])),
      frames: this.frames.map(frame => ({at: frame.at - start, ...JSON.parse(frame.json)}))
    };
  }
}

export function expandReplay(clip) {
  if (!clip.foodPool) return clip;
  return {...clip, frames: clip.frames.map(frame => ({...frame,
    state: {...frame.state, food: frame.state.food.map(id => clip.foodPool[id]).filter(Boolean)}
  }))};
}

export class ReplayStore {
  constructor() { this.database = null; }
  open() {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open('vintage-replays-v1', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('clips', {keyPath: 'id'});
        store.createIndex('createdAt', 'createdAt');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.database = null; };
        resolve(db);
      };
      request.onerror = () => { this.database = null; reject(request.error); };
      request.onblocked = () => { this.database = null; reject(new Error('Replay storage is open in another tab.')); };
    });
    return this.database;
  }
  async transaction(mode, action) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('clips', mode);
      const request = action(transaction.objectStore('clips'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || request.error || new Error('Replay storage failed.'));
    });
  }
  async put(clip) {
    let payload = new Blob([JSON.stringify(clip)], {type: 'application/json'});
    let compressed = false;
    if (typeof CompressionStream !== 'undefined') {
      payload = await new Response(payload.stream().pipeThrough(new CompressionStream('gzip'))).blob();
      compressed = true;
    }
    const record = {
      id: crypto.randomUUID(), createdAt: Date.now(), title: clip.title,
      mode: clip.mode, duration: clip.duration, bytes: payload.size, payload, compressed
    };
    await this.transaction('readwrite', store => store.put(record));
    return record;
  }
  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const records = [], transaction = db.transaction('clips', 'readonly');
      const request = transaction.objectStore('clips').index('createdAt').openCursor(null, 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const {payload, ...metadata} = cursor.value;
        records.push(metadata); cursor.continue();
      };
      transaction.oncomplete = () => resolve(records);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || request.error);
    });
  }
  async get(id) {
    const record = await this.transaction('readonly', store => store.get(id));
    if (!record) throw new Error('This replay is no longer available.');
    const payload = record.compressed
      ? await new Response(record.payload.stream().pipeThrough(new DecompressionStream('gzip'))).blob()
      : record.payload;
    return JSON.parse(await payload.text());
  }
  remove(id) { return this.transaction('readwrite', store => store.delete(id)); }
}

export function framePair(clip, position) {
  let low = 0, high = clip.frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (clip.frames[middle].at <= position) low = middle; else high = middle - 1;
  }
  const first = clip.frames[low], second = clip.frames[Math.min(low + 1, clip.frames.length - 1)];
  const ratio = second.at > first.at ? Math.max(0, Math.min(1, (position - first.at) / (second.at - first.at))) : 0;
  return {first, second, ratio};
}

const mix = (a, b, ratio) => a + (b - a) * ratio;
function tweenState(first, second, ratio) {
  const others = new Map(second.players.map(player => [player.id, player]));
  const tweenEntities = (entities, targets, key) => {
    const next = new Map(targets.filter(entity => entity[key] != null).map(entity => [entity[key], entity]));
    return entities.map(entity => {
      const target = entity[key] == null ? null : next.get(entity[key]);
      if (!target || Math.hypot(entity.x - target.x, entity.y - target.y) > first.worldSize / 4) return entity;
      return {...entity, x: mix(entity.x, target.x, ratio), y: mix(entity.y, target.y, ratio)};
    });
  };
  return {...first,
    food: tweenEntities(first.food, second.food, 'feedId'),
    viruses: tweenEntities(first.viruses, second.viruses, 'id'),
    players: first.players.map(player => {
    const next = others.get(player.id), cells = next?.cells || [];
    return {...player, cells: player.cells.map((cell, index) => {
      const target = cell.id == null ? (cells.length === player.cells.length ? cells[index] : null) : cells.find(other => other.id === cell.id);
      if (!target || Math.hypot(cell.x - target.x, cell.y - target.y) > first.worldSize / 4) return cell;
      return {...cell, x: mix(cell.x, target.x, ratio), y: mix(cell.y, target.y, ratio), mass: mix(cell.mass, target.mass, ratio)};
    })};
  })};
}

const timeLabel = ms => {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
};

export function mountReplays({Renderer, getSettings, getMetadata, releaseInputs, toast}) {
  const $ = id => document.getElementById(id);
  const buffer = new ReplayBuffer(), store = new ReplayStore(), temporary = new Map();
  let active = null, activeId = null, position = 0, running = false, lastTime = 0, raf = 0;
  let saving = false, exporting = false, trigger = null, selection = 0, loadVersion = 0;
  let exportRecorder = null, cancelExport = null;
  const canvas = $('replay-canvas'), radar = document.createElement('canvas');
  radar.width = radar.height = 240;
  let size = {width: 1280, height: 720, ratio: 1};
  const replayTime = () => (active?.frames?.[0]?.visualTime || 0) + position / 1000;
  let player = new Renderer(canvas, radar, {viewport: () => size, instantEffects: true, time: replayTime});
  player.resize();

  function setMessage(message) { $('replay-message').textContent = message; }
  function playbackControls() {
    const enabled = !!active && !exporting;
    for (const id of ['replay-play', 'replay-seek', 'replay-speed', 'replay-download']) $(id).disabled = !enabled;
    $('replay-play').textContent = running ? 'Pause' : 'Play';
    $('replay-play').setAttribute('aria-label', running ? 'Pause replay' : 'Play replay');
    $('replay-cancel-export').hidden = !exporting;
    $('replay-empty-player').hidden = !!active;
    $('replay-seek').max = active?.duration || 1;
    $('replay-seek').value = position;
    $('replay-time').textContent = timeLabel(position) + ' / ' + timeLabel(active?.duration || 0);
  }
  function draw() {
    if (!active) return;
    const {first, second, ratio} = framePair(active, position);
    const scale = size.width / first.width;
    player.cam = {x: mix(first.camera.x, second.camera.x, ratio), y: mix(first.camera.y, second.camera.y, ratio)};
    player.zoom = mix(first.zoom, second.zoom, ratio) * scale;
    player.draw(tweenState(first.state, second.state, ratio), first.focusId,
      {...active.settings, zoom: player.zoom, animation: 0, showMinimap: false}, false, 0, true, first.ownedIds);
    const ctx = player.ctx;
    ctx.fillStyle = '#0b111bd9';ctx.fillRect(18, 18, 230, 38);
    ctx.fillStyle = '#dcecf4';ctx.font = '600 15px Arial';ctx.textAlign = 'left';ctx.textBaseline = 'middle';
    ctx.fillText('VINTAGE / REPLAY  ' + timeLabel(position), 30, 38);
  }
  function tick(now) {
    if (!isOpen()) { raf = 0; return; }
    if (running && active) {
      position = Math.min(active.duration, position + Math.min(100, now - lastTime) * Number($('replay-speed').value));
      if (position >= active.duration) running = false;
    }
    lastTime = now;
    if (!exporting) { draw(); playbackControls(); }
    raf = requestAnimationFrame(tick);
  }
  function isOpen() { return !$('replays-overlay').classList.contains('hidden'); }
  async function select(id) {
    if (exporting) return;
    const version = ++selection;
    try {
      const clip = expandReplay(temporary.get(id)?.clip || await store.get(id));
      if (version !== selection || !isOpen()) return;
      active = clip; activeId = id; position = 0; running = true;
      // Reset the canvas too: a previous custom image may have tainted it.
      const first = clip.frames[0], scale = Math.min(1, 1280 / first.width, 720 / first.height);
      size = {width: Math.round(first.width * scale), height: Math.round(first.height * scale), ratio: 1};
      player = new Renderer(canvas, radar, {viewport: () => size, instantEffects: true, time: replayTime});player.resize();
      $('replay-stage').style.aspectRatio = size.width + ' / ' + size.height;
      $('replay-title').textContent = clip.title;
      $('replay-speed').value = '1';setMessage('');draw();playbackControls();
      document.querySelectorAll('.replay-card').forEach(card => card.classList.toggle('selected', card.dataset.id === id));
    } catch { setMessage('Could not open this replay. Try another recording.'); }
  }
  function button(label, action, className = '') {
    const node = document.createElement('button');node.type = 'button';node.textContent = label;node.className = className;node.onclick = action;return node;
  }
  async function refresh() {
    const version = ++loadVersion;
    let records = [];
    try { records = await store.list(); }
    catch { setMessage('Browser storage is unavailable. New replays can be watched in this tab until you close it.'); }
    if (version !== loadVersion) return;
    records.push(...[...temporary.values()].map(({clip, ...record}) => record));
    records.sort((a, b) => b.createdAt - a.createdAt);
    const list = $('replay-list');list.replaceChildren();
    $('replay-count').textContent = records.length + ' saved';
    if (!records.length) {
      const empty = document.createElement('p');empty.className = 'replay-empty';
      empty.textContent = 'Your best moments go here. Play a match, then use Save replay to keep the last 30 seconds.';
      list.append(empty);
    }
    for (const record of records) {
      const card = document.createElement('article');card.className = 'replay-card';card.dataset.id = record.id;
      card.classList.toggle('selected', record.id === activeId);
      const title = button(record.title, () => select(record.id), 'replay-card-title');
      const meta = document.createElement('small');
      meta.textContent = record.mode.toUpperCase() + ' / ' + timeLabel(record.duration) + ' / ' + new Date(record.createdAt).toLocaleString() + (record.temporary ? ' / THIS TAB ONLY' : '');
      const actions = document.createElement('div');actions.className = 'replay-card-actions';
      const watch = button('Watch', () => select(record.id));
      const remove = button('Delete', async () => {
        if (exporting) return;
        remove.disabled = true;
        try {
          if (temporary.has(record.id)) temporary.delete(record.id);else await store.remove(record.id);
          if (activeId === record.id) { selection++;active = null;activeId = null;running = false;position = 0;player.ctx.clearRect(0, 0, canvas.width, canvas.height);$('replay-title').textContent = 'Select a replay';playbackControls(); }
          await refresh();
        } catch { setMessage('Could not delete this replay.');remove.disabled = false; }
      }, 'replay-delete');
      actions.append(watch, remove);card.append(title, meta, actions);list.append(card);
    }
  }
  async function save() {
    if (saving) return;
    const metadata = getMetadata(), settings = getSettings();
    const clip = buffer.clip(settings, {...metadata, title: (metadata.nickname || 'Vintage Player') + ' / ' + metadata.mode.toUpperCase()});
    if (!clip) { toast('Play for a moment first, then save your replay.');return; }
    saving = true;
    for (const id of ['save-replay-btn', 'replay-save-current']) $(id).disabled = true;
    try {
      await store.put(clip);
      toast('Replay saved (' + (clip.duration / 1000).toFixed(1) + 's). Open Replays to watch or download.');
    } catch {
      const id = 'temporary-' + Date.now();
      temporary.set(id, {id, createdAt: Date.now(), title: clip.title, mode: clip.mode, duration: clip.duration, temporary: true, clip});
      toast('Storage unavailable or full. Replay kept in this tab; download it before closing.');
    } finally {
      saving = false;
      for (const id of ['save-replay-btn', 'replay-save-current']) $(id).disabled = false;
      if (isOpen()) await refresh();
    }
  }
  function open() {
    if (isOpen()) return;
    trigger = document.activeElement;releaseInputs();
    $('replays-overlay').classList.remove('hidden');$('close-replays').focus();
    lastTime = performance.now();if (!raf) raf = requestAnimationFrame(tick);
    playbackControls();refresh();
  }
  function close() {
    cancelExport?.();selection++;loadVersion++;running = false;
    $('replays-overlay').classList.add('hidden');cancelAnimationFrame(raf);raf = 0;
    releaseInputs();trigger?.focus?.({preventScroll: true});
  }
  async function download() {
    if (!active || exporting) return;
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      setMessage('Video downloads need a browser with canvas recording support, such as Chrome or Edge.');return;
    }
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setMessage('This browser does not support a video download format.');return; }
    exporting = true;running = false;position = 0;player.resetAnimations();
    playbackControls();setMessage('Preparing video... Keep this window open.');
    let stream, exportFrame = 0;
    const chunks = [];
    try {
      draw();stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 5000000});
      exportRecorder = recorder;
      const finished = new Promise((resolve, reject) => {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error('Video recording failed.'));
      });
      let cancelled = false;
      cancelExport = () => { cancelled = true;if (recorder.state !== 'inactive') recorder.stop(); };
      recorder.start();
      let previous = performance.now();
      const render = now => {
        if (cancelled || recorder.state === 'inactive') return;
        // Count rendered time so background-tab throttling cannot skip the clip.
        position = Math.min(active.duration, position + Math.min(now - previous, 100));previous = now;
        draw();$('replay-seek').value = position;
        $('replay-time').textContent = timeLabel(position) + ' / ' + timeLabel(active.duration);
        setMessage('Preparing video ' + Math.round(position / active.duration * 100) + '% — Cancel to stop.');
        if (position >= active.duration) recorder.stop();else exportFrame = requestAnimationFrame(render);
      };
      exportFrame = requestAnimationFrame(render);
      await finished;
      if (cancelled) { setMessage('Video download cancelled.');return; }
      const blob = new Blob(chunks, {type: recorder.mimeType}), url = URL.createObjectURL(blob);
      const link = document.createElement('a');link.href = url;
      link.download = 'vintage-replay-' + new Date().toISOString().replace(/[:.]/g, '-') + (recorder.mimeType.includes('mp4') ? '.mp4' : '.webm');
      document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage('Video downloaded. Your replay stays in the library.');
    } catch {
      setMessage('Could not export video. Custom images from another website may block recording. Try a replay using the default artwork.');
    } finally {
      cancelAnimationFrame(exportFrame);
      if (exportRecorder?.state !== 'inactive') exportRecorder?.stop();
      stream?.getTracks().forEach(track => track.stop());
      exportRecorder = null;cancelExport = null;exporting = false;playbackControls();
    }
  }

  $('replays-btn').onclick = $('lobby-replays-btn').onclick = open;
  $('save-replay-btn').onclick = $('replay-save-current').onclick = save;
  $('close-replays').onclick = close;
  $('replays-overlay').addEventListener('click', event => { if (event.target === $('replays-overlay')) close(); });
  $('replay-play').onclick = () => {
    if (!active || exporting) return;
    if (position >= active.duration) { position = 0;player.resetAnimations(); }
    running = !running;playbackControls();
  };
  $('replay-seek').oninput = () => { if (!exporting) {position = Number($('replay-seek').value);player.resetAnimations();draw();playbackControls();} };
  $('replay-download').onclick = download;
  $('replay-cancel-export').onclick = () => cancelExport?.();
  // Capture keyboard events before gameplay handlers, including while a button
  // inside the player has focus. Native range/video controls keep their keys.
  window.addEventListener('keydown', event => {
    if (!isOpen()) return;
    if (event.key === 'Escape') { event.preventDefault();close(); }
    else if (event.key === 'Tab') {
      const fields = [...$('replays-overlay').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node => !node.hidden && node.offsetParent !== null);
      const first = fields[0], last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus(); }
    }
    event.stopImmediatePropagation();
  }, true);
  playbackControls();
  return {buffer, save, open, close, isOpen};
}
