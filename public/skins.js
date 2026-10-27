import {SKIN_CATALOG} from './skin-catalog.js?v=1';
import {FLAGS} from './flag-catalog.js?v=2';
import {normalizeTitlePosition} from './titles.js?v=static-free-trial-oct27-9';
import {mountTitleStudio} from './title-studio.js?v=static-free-trial-oct27-9';
export {FLAGS};

const STORAGE_KEY = 'vintage-cosmetics-v1';
const NO_SKIN_URL = '/assets/skins/jax/featured-11.png';
export const SHIELDS = Array.from({length:13}, (_, index) => ({
  id:'shield' + (index + 1), name:'Shield ' + (index + 1), level:index + 1,
  url:'/assets/shields/shield' + (index + 1) + '.webp'
})).filter(shield => shield.id !== 'shield5');
export function cleanSkinUrl(value) {
  if (typeof value !== 'string' || value.length > 1200) return '';
  if (/^\/assets\/skins\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function normalizeCosmetics(value = {}) {
  return {
    slots:Array.from({length:2}, (_, index) => ({
      skinUrl:cleanSkinUrl(value?.slots?.[index]?.skinUrl),
      shieldId:SHIELDS.some(shield => shield.id === value?.slots?.[index]?.shieldId) ? value.slots[index].shieldId : '',
      flagId:FLAGS.some(flag => flag.id === value?.slots?.[index]?.flagId) ? value.slots[index].flagId : '',
      titlePosition:normalizeTitlePosition(value?.slots?.[index]?.titlePosition)
    })),
    saved:(Array.isArray(value?.saved) ? value.saved : []).slice(0,80)
      .filter(item => item && cleanSkinUrl(item.url))
      .map(item => ({url:cleanSkinUrl(item.url),name:String(item.name || 'My skin').slice(0,60)}))
      .filter((item,index,items) => items.findIndex(other => other.url === item.url) === index)
  };
}

export function mountSkinLibrary({onChange, releaseInputs, toast,getCollection=()=>null}) {
  const $ = id => document.getElementById(id);
  let profile;
  try { profile = normalizeCosmetics(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
  catch { profile = normalizeCosmetics(); }
  let slot = 0, tab = 'level', shown = 48, trigger = null, adding = false;
  const categories = [['featured','Jax Featured'],['all','All free skins'],['author','Author skins'],['clan','Clan skins'],['gradient','Gradient skins'],['letter','Letter skins'],['bubble','Bubble skins'],['infinity','Infinity designs']];
  const catalogByUrl = new Map(SKIN_CATALOG.map(item => [item.url,item]));
  const shieldById = new Map(SHIELDS.map(item => [item.id,item]));
  const flagById = new Map(FLAGS.map(item => [item.id,item]));
  const isOpen = () => !$('skins-overlay').classList.contains('hidden');
  const getSlots = () => profile.slots.map(item => ({...item}));
  const titleStudio=mountTitleStudio({getCollection,getSlot:()=>profile.slots[slot],getQuery:()=>$('skins-search').value,setPosition:position=>{profile.slots[slot].titlePosition=normalizeTitlePosition(position);commit();}});
  function titleFor(url) { return catalogByUrl.get(url)?.name || profile.saved.find(item => item.url === url)?.name || 'Custom skin'; }
  function image(url, className = '') {
    const img = document.createElement('img');img.src = url;img.alt = '';img.className = className;
    img.decoding = 'async';img.loading = 'lazy';img.referrerPolicy = 'no-referrer';
    return img;
  }
  function fillCell(node, equipped, placeholder = true) {
    node.replaceChildren();
    if (equipped.skinUrl) {
      const img = image(equipped.skinUrl,'cosmetic-base');
      img.onerror = () => {img.remove();if (placeholder) node.prepend(image(NO_SKIN_URL,'cosmetic-base'));};
      node.append(img);
    } else if (placeholder) node.append(image(NO_SKIN_URL,'cosmetic-base'));
    if (equipped.shieldId) node.append(image(shieldById.get(equipped.shieldId).url,'cosmetic-shield'));
    if (equipped.flagId && flagById.has(equipped.flagId)) node.append(image(flagById.get(equipped.flagId).url,'cosmetic-flag'));
  }
  function renderPreviews() {
    profile.slots.forEach((equipped,index) => {
      fillCell($('skin-lobby-preview-' + index),equipped);
      fillCell($('skin-slot-preview-' + index),equipped);
      $('skin-slot-' + index).classList.toggle('active',index === slot);
      $('skin-slot-' + index).setAttribute('aria-pressed',String(index === slot));
      $('skin-lobby-' + index).title = 'Connection ' + (index + 1) + ' / ' + (equipped.skinUrl ? titleFor(equipped.skinUrl) : 'No skin') + ' / ' + (shieldById.get(equipped.shieldId)?.name || 'No shield') + ' / ' + (flagById.get(equipped.flagId)?.name || 'No flag');
    });
    const equipped = profile.slots[slot];
    fillCell($('skin-live-preview'),equipped,false);
    $('skin-preview-name').textContent = equipped.skinUrl ? titleFor(equipped.skinUrl) : 'No skin';
    $('skin-preview-shield').textContent = shieldById.get(equipped.shieldId)?.name || 'No shield';
    $('skin-preview-flag').textContent = flagById.get(equipped.flagId)?.name || 'No flag';
    $('skin-remove-base').disabled = !equipped.skinUrl;
    $('skin-remove-shield').disabled = !equipped.shieldId;
    $('skin-remove-flag').disabled = !equipped.flagId;
    $('skins-current-slot').textContent = 'CONNECTION ' + (slot + 1);
  }
  function commit() {
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify(profile)); }
    catch { toast('Browser storage is full. This selection will last for this tab only.'); }
    renderPreviews();onChange(getSlots());
  }
  function remember(item) {
    if (!profile.saved.some(saved => saved.url === item.url)) {
      profile.saved.unshift({url:item.url,name:item.name});profile.saved = profile.saved.slice(0,80);
    }
  }
  function equip(item) {
    if (tab === 'level') profile.slots[slot].shieldId = item.id;
    else if (tab === 'flags') profile.slots[slot].flagId = item.id;
    else if (item.id === 'jax-featured-11') profile.slots[slot].skinUrl = '';
    else { profile.slots[slot].skinUrl = item.url;remember(item); }
    commit();renderGrid();
  }
  function button(label, action, className = '') {
    const node = document.createElement('button');node.type = 'button';node.textContent = label;
    node.className = className;node.onclick = action;return node;
  }
  function renderGrid() {
    if(tab==='titles'){titleStudio.render();return;}
    const grid = $('skins-grid');grid.replaceChildren();
    const query = $('skins-search').value.trim().toLowerCase();
    let items = tab === 'level' ? SHIELDS : tab === 'flags' ? FLAGS : tab === 'free' ? SKIN_CATALOG : profile.saved;
    if (tab === 'free' && $('skins-category').value !== 'all') items = items.filter(item => item.category === $('skins-category').value);
    const searchable = text => text.toLowerCase().normalize('NFKD').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآٱ]/g,'ا');
    items = items.filter(item => searchable(item.name + ' ' + (item.credit || '') + ' ' + (item.englishName || '') + ' ' + (item.code || '')).includes(searchable(query)));
    $('skins-result-count').textContent = items.length + (tab === 'level' ? ' SHIELDS' : tab === 'flags' ? ' FLAGS' : ' SKINS');
    $('skins-load-more').hidden = items.length <= shown;
    $('skins-empty').hidden = !!items.length;
    $('skins-empty').textContent = tab === 'my' && !query ? 'Your collection starts here. Pick a skin in Free, or add your own image URL.' : 'No matches. Try another name or category.';
    for (const item of items.slice(0,shown)) {
      const card = document.createElement('article');card.className = 'cosmetic-card';
      if (tab === 'flags') card.classList.add('flag-card');
      const selected = tab === 'level' ? profile.slots[slot].shieldId === item.id : tab === 'flags' ? profile.slots[slot].flagId === item.id : item.id === 'jax-featured-11' ? !profile.slots[slot].skinUrl : profile.slots[slot].skinUrl === item.url;
      card.classList.toggle('selected',selected);
      card.dataset.cosmetic = item.id || item.url;
      const choose = button('',() => equip(item),'cosmetic-pick');
      const label = item.id === 'jax-featured-11' ? 'No skin' : item.name;
      choose.setAttribute('aria-label','Equip ' + label);choose.setAttribute('aria-pressed',String(selected));
      const cell = document.createElement('span');cell.className = 'cosmetic-card-cell';
      if (tab === 'level') {
        fillCell(cell,{skinUrl:profile.slots[slot].skinUrl,shieldId:item.id},false);
      } else {
        const img = image(item.thumbnail || item.url,'cosmetic-base');
        img.onerror = () => {img.src = NO_SKIN_URL;img.onerror = null;card.classList.add('unavailable');choose.disabled = true;choose.title = 'This image is currently unavailable at its source.';};
        cell.append(img);
      }
      const name = document.createElement('strong');name.textContent = label;name.dir = 'auto';
      const note = document.createElement('small');note.textContent = selected ? 'EQUIPPED' : tab === 'level' ? 'LEVEL ' + item.level + ' / TRY NOW' : tab === 'flags' ? item.englishName : item.credit || 'SAVED ON THIS DEVICE';
      choose.append(cell,name,note);card.append(choose);
      if (tab === 'my') card.append(button('Remove',() => {
        profile.saved = profile.saved.filter(saved => saved.url !== item.url);commit();renderGrid();
      },'cosmetic-forget'));
      grid.append(card);
    }
  }
  function render() {
    for (const node of $('skins-tabs').querySelectorAll('[data-skin-tab]')) {
      const active = node.dataset.skinTab === tab;node.classList.toggle('active',active);node.setAttribute('aria-selected',String(active));
    }
    $('skins-category').hidden = tab !== 'free';
    $('skins-custom-form').hidden = tab !== 'my';
    $('skins-section-title').textContent = tab === 'level' ? 'Animated shields' : tab === 'flags' ? 'Flags' : tab === 'free' ? 'Free skins' : 'My Skins';
    $('skins-section-hint').textContent = tab === 'level' ? 'All ' + SHIELDS.length + ' shields are open for testing. Shields work with a skin or on their own.' : tab === 'flags' ? 'Choose a flag beside your name. Each connection has its own choice.' : tab === 'free' ? 'The collection from Jax. Choose one to equip and keep in My Skins.' : 'Your choices stay on this device. No sign-in needed during testing.';
    $('skins-section-title').dir = $('skins-section-hint').dir = 'ltr';
    $('skins-search').placeholder = tab === 'flags' ? 'Search flags or countries...' : 'Search your next look...';
    const titles=tab==='titles';$('skins-grid').hidden=titles;$('skins-preview-panel').classList.toggle('titles-mode',titles);
    if(titles){$('skins-section-title').textContent='The Insignia Collection';$('skins-section-hint').textContent='20 original Vintage titles. Choose an insignia, then place it anywhere inside your cell.';$('skins-search').placeholder='Find your title...';$('skins-empty').hidden=true;$('skins-load-more').hidden=true;}
    renderPreviews();titleStudio.show(titles);renderGrid();
  }
  function open(index = 0,nextTab=null) {
    slot = index === 1 ? 1 : 0;
    if(nextTab)tab=nextTab;
    trigger = document.activeElement;releaseInputs();
    $('skins-overlay').classList.remove('hidden');render();$('close-skins').focus();
  }
  function close() {
    titleStudio.show(false);
    $('skins-overlay').classList.add('hidden');releaseInputs();trigger?.focus?.({preventScroll:true});
  }
  for (const [value,label] of categories) {
    const option = document.createElement('option');option.value = value;option.textContent = label;$('skins-category').append(option);
  }
  $('skin-lobby-0').onclick = () => open(0);$('skin-lobby-1').onclick = () => open(1);
  $('skin-slot-0').onclick = () => {slot = 0;render();};$('skin-slot-1').onclick = () => {slot = 1;render();};
  $('close-skins').onclick = $('skins-done').onclick = close;
  $('skins-overlay').onclick = event => {if (event.target === $('skins-overlay')) close();};
  $('skins-tabs').addEventListener('click',event => {
    const node = event.target.closest('[data-skin-tab]');if (!node) return;
    tab = node.dataset.skinTab;shown = 48;$('skins-search').value = '';render();
  });
  $('skins-search').oninput = () => {shown = 48;renderGrid();};
  $('skins-category').onchange = () => {shown = 48;renderGrid();};
  $('skins-load-more').onclick = () => {shown += 48;renderGrid();};
  $('skin-remove-base').onclick = () => {profile.slots[slot].skinUrl = '';commit();renderGrid();};
  $('skin-remove-shield').onclick = () => {profile.slots[slot].shieldId = '';commit();renderGrid();};
  $('skin-remove-flag').onclick = () => {profile.slots[slot].flagId = '';commit();renderGrid();};
  $('skins-custom-form').onsubmit = async event => {
    event.preventDefault();if (adding) return;
    const url = cleanSkinUrl($('skins-custom-url').value.trim());
    if (!url) {toast('Enter a valid http(s) image URL.');return;}
    adding = true;$('skins-custom-add').disabled = true;
    try {
      await new Promise((resolve,reject) => {
        const img = new Image(), timer = setTimeout(() => reject(Error('timeout')),12000);
        img.onload = () => {clearTimeout(timer);img.naturalWidth ? resolve() : reject(Error('image'));};
        img.onerror = () => {clearTimeout(timer);reject(Error('image'));};img.crossOrigin = 'anonymous';img.referrerPolicy = 'no-referrer';img.src = url;
      });
      const item = {url,name:$('skins-custom-name').value.trim().slice(0,60) || 'My skin'};
      remember(item);profile.slots[slot].skinUrl = item.url;commit();renderGrid();
      $('skins-custom-url').value = '';$('skins-custom-name').value = '';toast('Skin added and equipped.');
    } catch {toast('Could not load that image. Use a direct image URL.');}
    finally {adding = false;$('skins-custom-add').disabled = false;}
  };
  window.addEventListener('keydown',event => {
    if (!isOpen()) return;
    if(tab==='titles'&&event.target===$('title-position-canvas')&&event.key.startsWith('Arrow'))return;
    if (event.key === 'Escape') {event.preventDefault();close();}
    if (event.key === 'Tab') {
      const fields = [...$('skins-overlay').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(node => node.offsetParent !== null);
      const first = fields[0],last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    }
    event.stopImmediatePropagation();
  },true);
  renderPreviews();
  return {getSlots,isOpen,open,close};
}
