const endpoint = 'https://views.fazleyrabbi.xyz';
const project = 'mystical-ride';
const cacheKey = 'mystical-ride:visits';
const sessionKey = 'mystical-ride:visitTracked';

function read(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function write(storage, key, value) {
  try { storage.setItem(key, value); } catch { /* Storage may be disabled. */ }
}

function isAutomatedVisitor() {
  const agent = navigator.userAgent.toLowerCase();
  return navigator.webdriver || ['bot','spider','crawler','preview','lighthouse','headless','playwright','puppeteer','selenium','curl','wget'].some(word => agent.includes(word));
}

export async function initVisitorCounter() {
  const counter = document.querySelector('#visitor-count');
  if (!counter) return;
  const local = ['localhost','127.0.0.1','::1'].includes(location.hostname) || location.hostname.endsWith('.local');
  const cached = Number(read(localStorage, cacheKey)) || 0;
  counter.textContent = cached.toLocaleString();
  const track = !local && !isAutomatedVisitor() && read(sessionStorage, sessionKey) !== 'true';
  if (track) write(sessionStorage, sessionKey, 'true');
  const route = track ? 'hit' : 'get';
  try {
    const response = await fetch(`${endpoint}/api/${route}?project=${project}&key=visitors`, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (!Number.isSafeInteger(data.views) || data.views < 0) return;
    write(localStorage, cacheKey, String(data.views));
    counter.textContent = data.views.toLocaleString();
  } catch { /* Keep the last known count when the service is unavailable. */ }
}
