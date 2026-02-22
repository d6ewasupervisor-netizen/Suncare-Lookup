// State
let stores = {};
let currentStore = null;
let planogram = null;
let currentSide = 1;
let currentFilter = 'all'; // all, new, srp
let products = [];
let upcRedirects = {};
let html5QrCode;
let deferredPrompt;

// Cache
const CACHE_NAME = 'suncare-pog-v1';

// DOM Elements
const app = document.getElementById('app');

// Templates
const landingTemplate = () => `
  <div class="landing-container">
    <div class="landing-title">☀️ SUNCARE POG LOOKUP</div>
    <div class="landing-subtitle">Select your store to begin</div>
    
    <select id="store-selector">
      <option value="" disabled selected>Select Store...</option>
      ${Object.keys(stores).map(s => `<option value="${s}">Store ${s}</option>`).join('')}
    </select>
    
    <div id="preview-card" class="preview-card">
      <h3 class="preview-title" id="pog-name"></h3>
      <p class="preview-meta" id="pog-subtitle"></p>
      
      <div class="preview-stats">
        <span id="pog-number"></span>
        <span id="pog-skus"></span>
      </div>
      
      <button class="btn-primary" id="load-btn">Load Planogram →</button>
    </div>
  </div>
`;

const headerTemplate = (storeId, pog) => `
  <header>
    <div class="header-top">
      <div>
        <div class="app-title">☀️ SUNCARE POG LOOKUP</div>
        <div class="store-info">Store ${storeId} · ${pog.pogNumber}</div>
        <button class="btn-change-store" id="change-store">↩ Change Store</button>
      </div>
      <div class="live-date">LIVE ${pog.liveDate}<br>${pog.totalProducts} SKUs · ${pog.sides} Sides</div>
    </div>
    
    <div class="tab-nav">
      <button class="tab-btn active" data-tab="browse">Browse</button>
      <button class="tab-btn" data-tab="scan">Scan</button>
      <button class="tab-btn" data-tab="upc">UPC</button>
    </div>
    
    <div class="filter-chips">
      <div class="chip active" data-filter="all">All</div>
      <div class="chip" data-filter="new">🟢 New</div>
      <div class="chip" data-filter="srp">🟣 SRP</div>
    </div>
  </header>
`;

const browseTemplate = () => `
  <div class="browse-view" id="browse-view">
    <!-- Shelves injected here -->
  </div>
  
  <div class="scan-view" id="scan-view">
    <div id="reader"></div>
  </div>
  
  <div class="upc-view" id="upc-view">
    <div class="upc-input-group">
      <input type="text" class="upc-input" id="manual-upc" placeholder="Enter UPC (e.g. 8680068785)">
      <button class="btn-primary" id="lookup-upc">Search</button>
    </div>
    <div id="upc-result"></div>
  </div>

  <div class="bottom-nav" id="bottom-nav">
    <!-- Side buttons injected here -->
  </div>
  
  <div class="toast" id="toast"></div>
`;

const productOverlayTemplate = (p, redirect=null) => `
  <div class="overlay active" id="product-overlay">
    <div class="overlay-content">
      <button class="close-btn" id="close-overlay">✕</button>
      
      ${redirect ? `
        <div class="redirect-banner">
          ⚠️ UPC Changed — Old: ${redirect.old} → New: ${redirect.new}
        </div>
      ` : ''}
      
      <div class="detail-img-container">
        <img src="images/${p.upc}.webp" class="detail-img" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><text y=\\'50%\\' x=\\'50%\\' dy=\\'0.35em\\' text-anchor=\\'middle\\' font-size=\\'80\\'>☀️</text></svg>'">
      </div>
      
      <h2 class="detail-title">${p.name}</h2>
      <div class="detail-upc">UPC: ${p.upc.replace(/^0+/, '')}</div>
      
      <div class="badges">
        ${p.isNew ? '<span class="badge new">NEW</span>' : ''}
        ${p.srp ? '<span class="badge srp">SRP</span>' : ''}
        ${p.isChange ? '<span class="badge change">CHANGE</span>' : ''}
        ${p.isMove ? '<span class="badge move">MOVE</span>' : ''}
      </div>
      
      <div class="location-grid">
        <div class="loc-box">
          <span class="loc-label">Side</span>
          <span class="loc-value">${p.segment}</span>
        </div>
        <div class="loc-box">
          <span class="loc-label">Shelf</span>
          <span class="loc-value">${p.shelf}</span>
        </div>
        <div class="loc-box">
          <span class="loc-label">Position</span>
          <span class="loc-value">${p.position}</span>
        </div>
        <div class="loc-box">
          <span class="loc-label">Facings</span>
          <span class="loc-value">${p.facings}</span>
        </div>
      </div>
      
      <div class="mini-pog" id="mini-pog">
        <!-- Mini shelf layout -->
      </div>
      
      <button class="btn-primary" id="view-pdf">📄 POG PDFs</button>
    </div>
  </div>
`;

const pdfViewerTemplate = (url) => `
  <div class="pdf-viewer active" id="pdf-viewer">
    <div class="pdf-header">
      <h3>Planogram PDF</h3>
      <button class="close-btn" id="close-pdf">✕</button>
    </div>
    <iframe src="${url}" class="pdf-frame"></iframe>
  </div>
`;

// Initialize
async function init() {
  try {
    const res = await fetch('data/stores.json');
    stores = await res.json();
    renderLanding();
  } catch (e) {
    console.error("Failed to load stores", e);
    app.innerHTML = `<div style="padding:20px; text-align:center;">Failed to load app data. Please refresh.</div>`;
  }
}

// Render Landing
function renderLanding() {
  app.innerHTML = landingTemplate();
  
  const selector = document.getElementById('store-selector');
  const preview = document.getElementById('preview-card');
  const loadBtn = document.getElementById('load-btn');
  
  selector.addEventListener('change', async (e) => {
    const storeId = e.target.value;
    const pogType = stores[storeId];
    
    // Fetch preview data just to show info (or just assume based on type)
    // We'll just fetch the full json for now since we need it anyway
    try {
      const res = await fetch(`data/${pogType}.json`);
      const data = await res.json();
      
      document.getElementById('pog-name').innerText = data.name;
      document.getElementById('pog-subtitle').innerText = data.subtitle;
      document.getElementById('pog-number').innerText = `POG: ${data.pogNumber}`;
      document.getElementById('pog-skus').innerText = `${data.totalProducts} SKUs`;
      
      preview.classList.add('active');
      
      loadBtn.onclick = () => loadApp(storeId, data);
    } catch (err) {
      console.error(err);
    }
  });
}

// Load Main App
function loadApp(storeId, data) {
  currentStore = storeId;
  planogram = data;
  products = data.products;
  upcRedirects = data.upcRedirects || {};
  currentSide = 1;
  
  // Render structure
  app.innerHTML = headerTemplate(storeId, planogram) + browseTemplate();
  
  setupNavigation();
  setupFilters();
  renderShelves();
  renderBottomNav();
  setupGestures();
  
  // PDF Listener
  // Check if pdf viewer exists (it's dynamic)
}

function setupNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  const views = {
    'browse': document.getElementById('browse-view'),
    'scan': document.getElementById('scan-view'),
    'upc': document.getElementById('upc-view')
  };
  
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      // Switch active tab
      tabs.forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      
      // Hide all views
      Object.values(views).forEach(v => v.style.display = 'none');
      
      // Show selected
      const tabName = t.dataset.tab;
      views[tabName].style.display = tabName === 'scan' ? 'flex' : 'block';
      
      if (tabName === 'scan') {
        startScanner();
      } else {
        stopScanner();
      }
      
      if (tabName === 'browse') {
        renderShelves();
      }
    });
  });
  
  document.getElementById('change-store').addEventListener('click', () => {
    if (confirm('Change store?')) {
      location.reload();
    }
  });
  
  // Manual UPC
  document.getElementById('lookup-upc').addEventListener('click', () => {
    const input = document.getElementById('manual-upc').value.trim();
    if (input) handleUpcSearch(input);
  });
}

function setupFilters() {
  const chips = document.querySelectorAll('.chip');
  chips.forEach(c => {
    c.addEventListener('click', () => {
      chips.forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      currentFilter = c.dataset.filter;
      renderShelves();
    });
  });
}

function renderShelves() {
  const container = document.getElementById('browse-view');
  container.innerHTML = '';
  
  // Filter products by side and filter type
  const sideProducts = products.filter(p => p.segment === currentSide);
  
  // Get shelves (max shelf to 1)
  const maxShelf = planogram.shelves; // e.g. 5
  // We want to render top (5) to bottom (1)
  
  for (let s = maxShelf; s >= 1; s--) {
    const shelfProducts = sideProducts
      .filter(p => p.shelf === s)
      .sort((a, b) => a.position - b.position);
      
    // Filter by type if needed
    let displayProducts = shelfProducts;
    if (currentFilter === 'new') displayProducts = displayProducts.filter(p => p.isNew);
    if (currentFilter === 'srp') displayProducts = displayProducts.filter(p => p.srp);
    
    // Always render shelf container, even if empty, to show structure? 
    // Or just skip? Let's show header.
    
    const shelfDiv = document.createElement('div');
    shelfDiv.className = 'shelf-container';
    
    const label = s === maxShelf ? 'TOP' : (s === 1 ? 'BOTTOM' : '');
    
    // Count facings
    const facings = displayProducts.reduce((acc, p) => acc + p.facings, 0);
    
    shelfDiv.innerHTML = `
      <div class="shelf-header">
        <span>Shelf ${s} ${label}</span>
        <span>${displayProducts.length} items · ${facings} facings</span>
      </div>
      <div class="product-grid">
        ${displayProducts.map(p => createProductCard(p)).join('')}
      </div>
    `;
    
    container.appendChild(shelfDiv);
  }
}

function createProductCard(p) {
  // Handle facings? 
  // Prompt says: "Multi-facing products: Images repeat side-by-side... wrapped in a single tap target"
  // For grid layout, it might be easier to just show one card. 
  // Let's stick to one card but maybe indicate facings visually or just one image.
  // "Images repeat side-by-side" suggests inside the card.
  
  // Simple card for now
  return `
    <div class="product-card" onclick="openProductOverlay('${p.upc}')">
      <div class="product-img-container">
        <img src="images/${p.upc}.webp" class="product-img" loading="lazy" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'><text y=\\'50%\\' x=\\'50%\\' dy=\\'0.35em\\' text-anchor=\\'middle\\' font-size=\\'80\\'>☀️</text></svg>'">
        ${p.isNew ? '<span class="badge new">NEW</span>' : ''}
        ${p.srp ? '<span class="badge srp">SRP</span>' : ''}
      </div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-upc">${p.upc.replace(/^0+/, '')}</div>
      </div>
    </div>
  `;
}

function renderBottomNav() {
  const nav = document.getElementById('bottom-nav');
  if (planogram.sides <= 1) {
    nav.style.display = 'none';
    return;
  }
  
  let html = '';
  for (let i = 1; i <= planogram.sides; i++) {
    html += `<button class="nav-btn ${i === currentSide ? 'active' : ''}" onclick="changeSide(${i})">${i}</button>`;
  }
  nav.innerHTML = html;
}

function changeSide(side) {
  if (side < 1 || side > planogram.sides) return;
  currentSide = side;
  renderShelves();
  renderBottomNav();
  
  // Toast
  const toast = document.getElementById('toast');
  toast.innerText = `Side ${side}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1500);
  
  // Haptic
  if (navigator.vibrate) navigator.vibrate(30);
}

function setupGestures() {
  if (planogram.sides <= 1) return;
  
  let touchStartX = 0;
  let touchEndX = 0;
  
  const view = document.getElementById('browse-view');
  
  view.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  });
  
  view.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  });
  
  function handleSwipe() {
    if (touchEndX < touchStartX - 50) {
      // Swipe Left -> Next Side
      if (currentSide < planogram.sides) changeSide(currentSide + 1);
    }
    if (touchEndX > touchStartX + 50) {
      // Swipe Right -> Prev Side
      if (currentSide > 1) changeSide(currentSide - 1);
    }
  }
}

// Scanner
function startScanner() {
  if (html5QrCode) return; // already running
  
  html5QrCode = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };
  
  html5QrCode.start(
    { facingMode: "environment" }, 
    config, 
    (decodedText) => {
      // Success
      stopScanner();
      handleUpcSearch(decodedText);
    },
    (errorMessage) => {
      // ignore
    }
  ).catch(err => {
    console.error(err);
    document.getElementById('reader').innerHTML = "Camera error or permission denied.";
  });
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode = null;
    }).catch(err => console.error(err));
  }
}

// Search & Overlay
function handleUpcSearch(upc) {
  // Normalize UPC? (strip leading zeros?)
  // Data has leading zeros (e.g. 000868...)
  // Scanned might not.
  // Best to check exact match, then try adding/removing zeros.
  
  let found = findProduct(upc);
  let redirectInfo = null;
  
  if (!found) {
    // Check redirects
    // Redirect keys might vary in zeros too.
    // Let's normalize everything to strings without leading zeros for comparison
    const normUpc = upc.replace(/^0+/, '');
    
    // check redirects
    for (let old in upcRedirects) {
      if (old.replace(/^0+/, '') === normUpc) {
        const newUpc = upcRedirects[old];
        found = findProduct(newUpc);
        if (found) {
          redirectInfo = { old: upc, new: newUpc };
        }
        break;
      }
    }
    
    if (!found) {
        // Try to match scanned UPC with leading zeros in product list
        // E.g. scan 868... need to find 000868...
        // The simple way: check endsWith
        found = products.find(p => p.upc.replace(/^0+/, '') === normUpc);
    }
  }
  
  if (found) {
    openProductOverlay(found.upc, redirectInfo);
  } else {
    alert(`Product ${upc} not found on this planogram.`);
  }
}

function findProduct(upc) {
  return products.find(p => p.upc === upc);
}

function openProductOverlay(upc, redirect=null) {
  const p = findProduct(upc);
  if (!p) return;
  
  // Create overlay
  const div = document.createElement('div');
  div.innerHTML = productOverlayTemplate(p, redirect);
  document.body.appendChild(div.firstElementChild);
  
  // Render mini pog
  renderMiniPog(p);
  
  // Events
  document.getElementById('close-overlay').onclick = () => {
    document.querySelector('.overlay').remove();
  };
  
  document.getElementById('view-pdf').onclick = () => {
    openPdfViewer();
  };
}

function renderMiniPog(activeProduct) {
  const container = document.getElementById('mini-pog');
  // Render current side shelves
  const sideProds = products.filter(p => p.segment === activeProduct.segment);
  
  let html = '';
  for (let s = planogram.shelves; s >= 1; s--) {
    const shelfItems = sideProds.filter(p => p.shelf === s).sort((a,b) => a.position - b.position);
    
    let itemsHtml = '';
    shelfItems.forEach(item => {
      const isTarget = item.upc === activeProduct.upc;
      itemsHtml += `<div class="mini-item ${isTarget ? 'highlight' : ''}" style="flex: ${item.facings}"></div>`;
    });
    
    html += `<div class="mini-shelf" style="display:flex; gap:1px;">${itemsHtml}</div>`;
  }
  container.innerHTML = html;
}

function openPdfViewer() {
  const file = planogram.id === 'pallet' ? 'pallet.pdf' : 'endcap.pdf';
  const url = `pdfs/${file}`;
  
  const div = document.createElement('div');
  div.innerHTML = pdfViewerTemplate(url);
  document.body.appendChild(div.firstElementChild);
  
  document.getElementById('close-pdf').onclick = () => {
    document.querySelector('.pdf-viewer').remove();
  };
}

// Start
init();

// SW Update
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
