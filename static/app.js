/* ... existing DataAdapter and Router logic ... */

class DataAdapter {
  constructor() {
    this.apiBase = localStorage.getItem('tgm_api_base') || '/api';
    this.uid = localStorage.getItem('tgm_uid') || 'demo_user';
    this.state = this.loadLocalState();
  }

  loadLocalState() {
    try {
        const stored = localStorage.getItem('tgm_state');
        if (stored) {
            const data = JSON.parse(stored);
            // Patch missing items in old state
            const def = this.getDefaultState();
            if (!data.shop || !data.shop.items || data.shop.items.length === 0) {
                data.shop = def.shop;
            }
            if (!data.boosts) {
                data.boosts = def.boosts;
            }
            return data;
        }
    } catch(e) {}
    return null;
  }

  saveLocalState(state) {
    this.state = state;
    localStorage.setItem('tgm_state', JSON.stringify(state));
  }

  async fetchState() {
    try {
      const res = await fetch(`${this.apiBase}/state?uid=${this.uid}`);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      this.saveLocalState(data);
      return data;
    } catch (e) {
      console.warn('Offline mode (State):', e);
      return this.state || this.getDefaultState();
    }
  }

  async minerStart() {
    try {
      const res = await fetch(`${this.apiBase}/miner/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: this.uid })
      });
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      this.saveLocalState(data);
      return data;
    } catch (e) {
      console.warn('Start failed offline', e);
      // Mock offline
      const state = { ...this.state };
      state.miner.status = 'mining';
      state.miner.sessionEndTs = Math.floor(Date.now() / 1000) + 60;
      this.saveLocalState(state);
      return state;
    }
  }

  async minerClaim() {
    try {
      const res = await fetch(`${this.apiBase}/miner/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: this.uid })
      });
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();

      if (data.balance > this.state.balance) {
          triggerBoostAnimation(data.balance - this.state.balance);
      }

      this.saveLocalState(data);
      return data;
    } catch (e) {
       console.warn('Claim failed offline', e);
       // Mock offline
       const state = { ...this.state };
       // Check if claimable
       if (state.miner.status === 'mining' && Math.floor(Date.now()/1000) >= state.miner.sessionEndTs) {
           // Calculate reward with boost
           let reward = 10;
           if (state.boosts.inventory.includes('boost_speed')) reward *= 2;

           state.balance += reward;
           state.miner.status = 'idle';
           state.miner.sessionEndTs = 0;
           state.miner.lastClaimTs = Math.floor(Date.now() / 1000);

           triggerBoostAnimation(reward);
           this.saveLocalState(state);
       }
       return state;
    }
  }

  async shopBuy(itemId) {
      try {
          const res = await fetch(`${this.apiBase}/shop/buy`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: this.uid, itemId: itemId })
          });
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          this.saveLocalState(data);
          showSuccessModal('Boost Activated!');
          return data;
      } catch (e) {
          console.warn('Shop buy failed offline', e);
          // Mock offline purchase logic
          const state = { ...this.state };
          const item = state.shop.items.find(i => i.id === itemId);

          if (item && state.balance >= item.price && !state.boosts.inventory.includes(itemId)) {
              state.balance -= item.price;
              state.boosts.inventory.push(itemId);

              triggerBoostAnimation(); // Particle burst
              showSuccessModal(item.name + ' Purchased!');

              this.saveLocalState(state);
          }
          return state;
      }
  }

  getDefaultState() {
    return {
      balance: 0,
      chat: { lastRewardTs: 0, cooldownSec: 60 },
      daily: { lastDailyTs: 0, cooldownSec: 86400 },
      miner: { status: 'idle', sessionEndTs: 0, lastClaimTs: 0 },
      tasks: { doneToday: 0, totalToday: 3 },
      // HARDCODED SHOP ITEMS FOR OFFLINE MODE
      shop: {
          items: [
            {
                id: 'boost_speed',
                name: '2x Mining Speed',
                price: 100,
                type: 'booster',
                icon: 'bolt',
                desc: 'Double income for 1 hour'
            },
            {
                id: 'boost_capacity',
                name: 'Energy Tank',
                price: 250,
                type: 'booster',
                icon: 'battery',
                desc: '+100 Max Energy'
            },
            {
                id: 'boost_multitap',
                name: 'Multi-Tap',
                price: 500,
                type: 'booster',
                icon: 'hand.tap',
                desc: '+1 Coin per tap'
            }
          ],
          dailyDealId: 'boost_speed'
      },
      boosts: { inventory: [], active: [] },
      friends: { inviteCode: 'demo', stats: { invited: 0 }, list: [] }
    };
  }
}

const adapter = new DataAdapter();
let currentState = null;

// Routing
function navigate() {
  const hash = window.location.hash || '#/home';
  const page = hash.substring(2) || 'home'; // remove #/

  // Hide all views
  document.querySelectorAll('main > .view').forEach(div => div.style.display = 'none');

  // Show target view
  const target = document.getElementById(page);
  if (target) {
    target.style.display = 'block';
    target.style.animation = 'fadeIn 0.3s ease-out';
  }

  // Header management
  const header = document.querySelector('header');
  if (page === 'home') {
       if(header) header.style.display = 'flex';
  } else {
       if(header) header.style.display = 'none';
  }

  // Update Tab Bar
  document.querySelectorAll('.nav-item').forEach(item => {
    // href="#/home" matches current hash
    const href = item.getAttribute('href');
    item.classList.toggle('active', href === hash);
  });

  // Re-render to update UI for the new page
  render();
}

window.addEventListener('hashchange', navigate);
window.addEventListener('load', init);

// Logic
function formatTime(seconds) {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function init() {
  currentState = await adapter.fetchState();
  if (!currentState) currentState = adapter.getDefaultState(); // Fallback
  navigate();

  // Tick loop
  setInterval(() => {
    if (!document.hidden) {
        render();
    }
  }, 1000);
}

function render() {
  if (!currentState) return;

  const now = Math.floor(Date.now() / 1000);

  // --- HOME SCREEN ---
  const balanceEl = document.getElementById('balance-display');
  if (balanceEl) balanceEl.textContent = currentState.balance.toLocaleString();

  // Miner Card Logic
  const minerStatus = document.getElementById('miner-status');
  const minerBtn = document.getElementById('miner-btn');

  if (minerStatus && minerBtn) {
      if (currentState.miner.status === 'idle') {
          minerStatus.textContent = 'Idle';
          minerStatus.className = 'status-chip';
          minerBtn.textContent = 'Start Mining';
          minerBtn.disabled = false;
          minerBtn.onclick = async () => {
              minerBtn.disabled = true; // Prevent double click
              currentState = await adapter.minerStart();
              render();
          };
      } else if (currentState.miner.status === 'mining') {
          const sessionEnd = currentState.miner.sessionEndTs;
          const left = sessionEnd - now;

          if (left > 0) {
              minerStatus.textContent = formatTime(left);
              minerStatus.className = 'status-chip ready'; // Greenish while active
              minerBtn.textContent = 'Mining...';
              minerBtn.disabled = true;
          } else {
              // Time is up, needs claim
              minerStatus.textContent = 'Done';
              minerStatus.className = 'status-chip ready';
              minerBtn.textContent = 'Claim Reward';
              minerBtn.disabled = false;
              minerBtn.onclick = async () => {
                  minerBtn.disabled = true;
                  currentState = await adapter.minerClaim();
                  render();
              };
          }
      }
  }

  // Shop Render
  const shopList = document.getElementById('shop-list');
  if (shopList && currentState.shop && currentState.shop.items) {
      shopList.innerHTML = ''; // Clear

      currentState.shop.items.forEach(item => {
          // Check ownership
          const owned = (currentState.boosts.inventory || []).includes(item.id);

          const div = document.createElement('div');
          // USE NEW CLASS "boost-card"
          div.className = 'card boost-card';
          div.style.marginBottom = '12px';
          div.style.padding = '16px';
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.justifyContent = 'space-between';

          div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 16px;">
                <div class="boost-icon-wrapper">
                    ${getIcon(item.icon)}
                </div>
                <div>
                    <h4 style="margin: 0; font-size: 17px; font-weight: 600;">${item.name}</h4>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${item.desc}</div>
                </div>
            </div>
            <button class="btn-tinted-pill" style="height: 32px; font-size: 13px; padding: 0 12px; border-radius: 16px;">
                ${owned ? 'Active' : item.price + ' TGM'}
            </button>
          `;

          const btn = div.querySelector('button');
          if (owned) {
              btn.disabled = true;
              btn.style.opacity = '0.5';
              btn.style.background = 'transparent';
              btn.style.border = '1px solid var(--success-color)';
              btn.style.color = 'var(--success-color)';
              btn.textContent = 'Owned';
          } else {
              btn.onclick = async () => {
                  if (currentState.balance >= item.price) {
                      // Optimistic UI
                      btn.textContent = 'Buying...';
                      currentState = await adapter.shopBuy(item.id);
                      render();
                      // Modal handled in adapter
                  } else {
                      // Shake animation
                      btn.style.animation = 'shake 0.3s';
                      setTimeout(() => btn.style.animation = '', 300);
                  }
              };
          }
          shopList.appendChild(div);
      });
  }
}

// Helper: Icons (SF Symbols approximation)
function getIcon(name) {
    if (name === 'bolt') return '⚡️';
    if (name === 'battery') return '🔋';
    if (name === 'hand.tap') return '👆';
    return '📦';
}

// --- ANIMATION SYSTEM ---

// 1. Particle Burst (More Particles)
function triggerBoostAnimation(amount) {
    const burstCount = 12;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    for (let i = 0; i < burstCount; i++) {
        const p = document.createElement('div');
        p.className = 'particle';

        // Random angle and distance
        const angle = (Math.random() * 360) * (Math.PI / 180);
        const dist = 50 + Math.random() * 100;
        const tx = Math.cos(angle) * dist + 'px';
        const ty = Math.sin(angle) * dist + 'px';

        p.style.setProperty('--tx', tx);
        p.style.setProperty('--ty', ty);

        // Random position jitter
        p.style.left = centerX + 'px';
        p.style.top = centerY + 'px';

        // Animation
        p.style.animation = `flyOut 0.8s ease-out forwards`;

        document.body.appendChild(p);
        setTimeout(() => p.remove(), 800);
    }

    // Float Text
    if (amount) {
        const floatText = document.createElement('div');
        floatText.className = 'burst-text';
        floatText.textContent = `+${amount}`;
        floatText.style.position = 'fixed';
        floatText.style.top = '50%';
        floatText.style.left = '50%';
        floatText.style.transform = 'translate(-50%, -50%)';
        floatText.style.pointerEvents = 'none';
        floatText.style.zIndex = '9999';
        document.body.appendChild(floatText);
        setTimeout(() => floatText.remove(), 1500);
    }
}

// 2. Success Modal
function showSuccessModal(message) {
    // Check if exists
    let overlay = document.querySelector('.success-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'success-overlay';
        overlay.innerHTML = `
            <div class="success-card">
                <div class="success-icon">✅</div>
                <h3 style="margin-bottom: 8px; font-size: 20px;">Success</h3>
                <p style="color: var(--text-secondary); margin: 0;">${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector('p').textContent = message;
    }

    // Show
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    const card = overlay.querySelector('.success-card');
    card.style.transform = 'scale(1)';

    // Hide automatically
    setTimeout(() => {
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
        card.style.transform = 'scale(0.8)';
    }, 2000);
}
