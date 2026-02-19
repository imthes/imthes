class DataAdapter {
  constructor() {
    this.apiBase = localStorage.getItem('tgm_api_base') || '/api';
    this.uid = localStorage.getItem('tgm_uid') || 'demo_user';
    this.state = null;
  }

  async fetchState() {
    try {
      const res = await fetch(`${this.apiBase}/state?uid=${this.uid}`);
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      this.state = data;
      return data;
    } catch (e) {
      console.warn('Offline mode:', e);
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
      this.state = data;
      return data;
    } catch (e) {
      console.warn('Start failed offline', e);
      return this.state;
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

      // Trigger Animation if successful
      if (data.balance > this.state.balance) {
          triggerBoostAnimation(data.balance - this.state.balance);
      }

      this.state = data;
      return data;
    } catch (e) {
       console.warn('Claim failed offline', e);
       return this.state;
    }
  }

  async shopBuy(itemId) {
      try {
          const res = await fetch(`${this.apiBase}/shop/buy`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: this.uid, itemId: itemId }) // Use camelCase to match storage.py or fix admin_ui
          });
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          this.state = data;
          return data;
      } catch (e) {
          console.warn('Shop buy failed offline', e);
          return this.state;
      }
  }

  getDefaultState() {
    return {
      balance: 0,
      chat: { lastRewardTs: 0, cooldownSec: 60 },
      daily: { lastDailyTs: 0, cooldownSec: 86400 },
      miner: { status: 'idle', sessionEndTs: 0, lastClaimTs: 0 },
      tasks: { doneToday: 0, totalToday: 3 },
      shop: { items: [], dailyDealId: null },
      boosts: { inventory: [], active: [] }
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
  navigate();

  // Tick loop
  setInterval(() => {
    // Only re-render if visible
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
          const owned = currentState.boosts.inventory.includes(item.id);

          const div = document.createElement('div');
          div.className = 'card'; // Use card style for boosts
          div.style.marginBottom = '12px';
          div.style.padding = '12px 16px';
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.justifyContent = 'space-between';

          div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; background: rgba(0,122,255,0.1); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                    ${getIcon(item.icon)}
                </div>
                <div>
                    <h4 style="margin: 0; font-size: 16px; font-weight: 600;">${item.name}</h4>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${item.desc}</div>
                </div>
            </div>
            <button class="btn-tinted-pill" style="height: 32px; font-size: 13px; padding: 0 12px;">
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
                      triggerBoostAnimation();
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

// Animation
function triggerBoostAnimation(amount) {
    // 1. Particle Burst
    const burst = document.createElement('div');
    burst.className = 'boost-burst';
    burst.style.position = 'fixed';
    burst.style.top = '50%';
    burst.style.left = '50%';
    burst.style.transform = 'translate(-50%, -50%)';
    burst.style.pointerEvents = 'none';
    burst.style.zIndex = '9999';
    burst.innerHTML = `
        <div class="burst-circle"></div>
        <div class="burst-text">${amount ? '+' + amount : 'Success!'}</div>
    `;
    document.body.appendChild(burst);

    // Remove after animation
    setTimeout(() => burst.remove(), 2000);
}

// Add CSS for animation dynamically
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
  0% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
  100% { transform: translateX(0); }
}

.boost-burst {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.burst-circle {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(0,122,255,0.8) 0%, rgba(0,0,0,0) 70%);
    animation: burstScale 0.6s ease-out forwards;
    opacity: 0;
}

.burst-text {
    font-family: 'SF Pro Display', sans-serif;
    font-size: 32px;
    font-weight: 800;
    color: #fff;
    text-shadow: 0 2px 10px rgba(0,122,255,0.5);
    margin-top: -60px;
    animation: textFloat 1.5s ease-out forwards;
    opacity: 0;
}

@keyframes burstScale {
    0% { transform: scale(0.2); opacity: 0; }
    50% { opacity: 1; }
    100% { transform: scale(2.0); opacity: 0; }
}

@keyframes textFloat {
    0% { transform: translateY(20px); opacity: 0; }
    20% { opacity: 1; transform: translateY(0); }
    80% { opacity: 1; transform: translateY(-20px); }
    100% { opacity: 0; transform: translateY(-40px); }
}
`;
document.head.appendChild(style);
