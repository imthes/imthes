/* ... existing DataAdapter and Router logic ... */

class DataAdapter {
  constructor() {
    this.apiBase = localStorage.getItem('tgm_api_base') || '/api';
    this.uid = localStorage.getItem('tgm_uid') || 'demo_user';
    this.state = this.loadLocalState();
  }

  loadLocalState() {
    const stored = localStorage.getItem('tgm_state');
    return stored ? JSON.parse(stored) : null;
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
      this.saveLocalState(data);
      return data;
    } catch (e) {
      // Mock offline
      console.warn('Offline action', e);
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
      this.saveLocalState(data);
      return data;
    } catch (e) {
       // Mock offline
       const state = { ...this.state };
       if (state.miner.status === 'mining' && Date.now() / 1000 >= state.miner.sessionEndTs) {
         state.balance += 10;
         state.miner.status = 'idle';
         state.miner.sessionEndTs = 0;
         state.miner.lastClaimTs = Math.floor(Date.now() / 1000);
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
              body: JSON.stringify({ uid: this.uid, item_id: itemId })
          });
          if (!res.ok) throw new Error('API Error');
          const data = await res.json();
          this.saveLocalState(data);
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
      shop: { items: [], dailyDealId: null }
    };
  }
}

const adapter = new DataAdapter();
let currentState = null;

// Routing
function navigate() {
  const hash = window.location.hash || '#/home';
  const page = hash.split('/')[1] || 'home';

  // Hide all views
  document.querySelectorAll('main > .view').forEach(div => div.style.display = 'none');

  // Show target view
  const target = document.getElementById(page);
  if (target) {
    target.style.display = 'block';

    // Header management: Large title logic
    const header = document.getElementById('main-header');
    if (page === 'home') {
       header.style.display = 'flex';
       header.style.backgroundColor = 'transparent';
    } else {
       header.style.display = 'none'; // Other pages use large titles in content
    }
  }

  // Update Tab Bar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('href') === hash);
  });

  render();
}

window.addEventListener('hashchange', navigate);

// Logic
function formatTime(seconds) {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function init() {
  currentState = await adapter.fetchState();
  navigate(); // Initial render

  // Tick loop
  setInterval(() => {
    render();
  }, 1000);
}

function render() {
  if (!currentState) return;

  const now = Math.floor(Date.now() / 1000);

  // Home: Balance
  const balanceEl = document.getElementById('balance-display');
  if (balanceEl) balanceEl.textContent = currentState.balance.toLocaleString();

  // Home: Chat Card
  const chatNext = currentState.chat.lastRewardTs + currentState.chat.cooldownSec;
  const chatDiff = chatNext - now;
  const chatStatus = document.getElementById('chat-status');
  const chatBtn = document.getElementById('chat-btn');

  if (chatStatus && chatBtn) {
      if (chatDiff <= 0) {
          chatStatus.textContent = 'Ready';
          chatStatus.className = 'status-chip ready';
          chatBtn.disabled = false;
          chatBtn.textContent = 'Go to Chat';
      } else {
          chatStatus.textContent = `Next in ${formatTime(chatDiff)}`;
          chatStatus.className = 'status-chip';
          chatBtn.disabled = true;
          chatBtn.textContent = `Wait ${formatTime(chatDiff)}`;
      }
  }

  // Home: Miner Card
  const minerStatus = document.getElementById('miner-status');
  const minerBtn = document.getElementById('miner-btn');

  if (minerStatus && minerBtn) {
      if (currentState.miner.status === 'idle') {
          minerStatus.textContent = 'Idle';
          minerBtn.textContent = 'Start Mining';
          minerBtn.disabled = false;
          minerBtn.onclick = async () => {
              currentState = await adapter.minerStart();
              render();
          };
      } else if (currentState.miner.status === 'mining') {
          const miningLeft = currentState.miner.sessionEndTs - now;
          if (miningLeft > 0) {
              minerStatus.textContent = `Mining • ${formatTime(miningLeft)}`;
              minerBtn.textContent = 'Mining...';
              minerBtn.disabled = true;
          } else {
              // Claimable
              currentState.miner.status = 'claimable'; // Optimistic update
              render();
          }
      } else if (currentState.miner.status === 'claimable') {
          minerStatus.textContent = 'Claim Ready';
          minerBtn.textContent = 'Claim Reward';
          minerBtn.disabled = false;
          minerBtn.onclick = async () => {
              currentState = await adapter.minerClaim();
              render();
          };
      }
  }

  // Home: Tasks Row
  const tasksProgress = document.getElementById('tasks-progress');
  if (tasksProgress) {
      tasksProgress.textContent = `${currentState.tasks.doneToday}/${currentState.tasks.totalToday}`;
  }

  // Shop Render (iOS List)
  const shopList = document.getElementById('shop-list');
  if (shopList && currentState.shop.items) {
      shopList.innerHTML = '';
      currentState.shop.items.forEach(item => {
          const div = document.createElement('div');
          div.className = 'list-item';
          div.innerHTML = `
            <div class="item-info">
                <h4>${item.name}</h4>
                <div class="item-price">${item.price} TGM</div>
            </div>
            <button class="spend-btn" style="background: rgba(0,122,255,0.2); color: #007aff;">Buy</button>
          `;
          const btn = div.querySelector('button');
          btn.onclick = async () => {
              if (currentState.balance >= item.price) {
                  currentState = await adapter.shopBuy(item.id);
                  render();
                  alert('Purchased ' + item.name);
              } else {
                  alert('Not enough coins');
              }
          };
          shopList.appendChild(div);
      });
  }
}

init();
