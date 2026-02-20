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
            const def = this.getDefaultState();
            // Patch missing items
            if (!data.shop || !data.shop.items || data.shop.items.length < 4) {
                data.shop = def.shop;
            }
            if (typeof data.xp === 'undefined') {
                data.xp = def.xp;
                data.level = def.level;
                data.nextLevelXp = def.nextLevelXp;
                data.isPremium = def.isPremium;
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
      if (this.state) {
          const now = Math.floor(Date.now() / 1000);
          const elapsed = now - (this.state.lastEnergyTs || now);
          if (elapsed > 0 && this.state.energy < this.state.maxEnergy) {
              this.state.energy = Math.min(this.state.maxEnergy, this.state.energy + elapsed);
              this.state.lastEnergyTs = now;
              this.saveLocalState(this.state);
          }
      }
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
       const state = { ...this.state };
       if (state.miner.status === 'mining' && Math.floor(Date.now()/1000) >= state.miner.sessionEndTs) {
           let reward = 10;
           if (state.boosts.inventory.includes('boost_speed')) reward *= 2;
           if (state.isPremium) reward *= 2; // Module 3: Premium x2

           state.balance += reward;
           state.miner.status = 'idle';
           state.miner.sessionEndTs = 0;

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
          showSuccessModal('Activated!');
          return data;
      } catch (e) {
          const state = { ...this.state };
          const item = state.shop.items.find(i => i.id === itemId);

          if (item && state.balance >= item.price && !state.boosts.inventory.includes(itemId)) {
              state.balance -= item.price;
              state.boosts.inventory.push(itemId);

              if (itemId === 'boost_capacity') {
                  state.maxEnergy += 500;
                  state.energy = state.maxEnergy;
              } else if (itemId === 'boost_multitap') {
                  state.tapLevel += 1;
              } else if (itemId === 'item_premium') {
                  state.isPremium = true;
              }

              triggerBoostAnimation();
              showSuccessModal(item.name + ' Purchased!');

              this.saveLocalState(state);
          }
          return state;
      }
  }

  completeTask(taskId, rewardXp, rewardCoins) {
      const state = { ...this.state };
      if (!state.tasks.doneList) state.tasks.doneList = [];

      if (!state.tasks.doneList.includes(taskId)) {
          state.tasks.doneList.push(taskId);
          state.xp += rewardXp;
          state.balance += rewardCoins;

          const thresholds = [
              {xp: 50, lvl: 1, reward: 5},
              {xp: 250, lvl: 2, reward: 1},
              {xp: 500, lvl: 3, reward: 1},
              {xp: 600, lvl: 4, reward: 1},
              {xp: 650, lvl: 5, reward: 10},
              {xp: 1050, lvl: 10, reward: 100},
          ];

          let newLevel = state.level;
          for (let t of thresholds) {
              if (state.xp >= t.xp && state.level < t.lvl) {
                  newLevel = t.lvl;
                  state.balance += t.reward;
                  showSuccessModal(`Level Up! Lvl ${newLevel}`);
              }
          }
          state.level = newLevel;

          let msg = `+${rewardXp} XP`;
          if (rewardCoins > 0) msg += `, +${rewardCoins} TGM`;
          triggerBoostAnimation(msg);
          this.saveLocalState(state);
      }
      return state;
  }

  getDefaultState() {
    return {
      balance: 0,
      energy: 500,
      maxEnergy: 500,
      tapLevel: 1,
      xp: 0,
      level: 1,
      nextLevelXp: 50,
      isPremium: false,
      lastEnergyTs: Math.floor(Date.now() / 1000),
      chat: { lastRewardTs: 0, cooldownSec: 60 },
      daily: { lastDailyTs: 0, cooldownSec: 86400 },
      miner: { status: 'idle', sessionEndTs: 0, lastClaimTs: 0 },
      tasks: { doneToday: 0, totalToday: 3, doneList: [] },
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
                desc: '+500 Max Energy'
            },
            {
                id: 'boost_multitap',
                name: 'Multi-Tap',
                price: 500,
                type: 'booster',
                icon: 'hand.tap',
                desc: '+1 Coin per tap'
            },
            {
                id: 'item_premium',
                name: 'Premium Status',
                price: 100,
                type: 'subscription',
                icon: 'crown',
                desc: 'x2 Multiplier on ALL Earnings'
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
  const page = hash.substring(2) || 'home';

  document.querySelectorAll('main > .view').forEach(div => div.style.display = 'none');

  const target = document.getElementById(page);
  if (target) {
    target.style.display = 'block';
    target.style.animation = 'fadeIn 0.3s ease-out';
  }

  const header = document.querySelector('header');
  if (page === 'home') {
       if(header) header.style.display = 'flex';
  } else {
       if(header) header.style.display = 'none';
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href');
    item.classList.toggle('active', href === hash);
  });

  render();
}

window.addEventListener('hashchange', navigate);
window.addEventListener('load', init);

function formatTime(seconds) {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function init() {
  currentState = await adapter.fetchState();
  if (!currentState) currentState = adapter.getDefaultState();
  navigate();

  setInterval(() => {
    if (!document.hidden && currentState) {
        const now = Math.floor(Date.now() / 1000);
        if (currentState.energy < currentState.maxEnergy) {
            currentState.energy = Math.min(currentState.maxEnergy, currentState.energy + 1);
            currentState.lastEnergyTs = now;
            adapter.saveLocalState(currentState);
        }
        render();
    }
  }, 1000);
}

function handleTap(e) {
    if (!currentState) return;

    if (currentState.energy > 0) {
        currentState.energy -= 1;
        let gain = currentState.tapLevel || 1;
        if (currentState.isPremium) gain *= 2; // Premium Multiplier

        currentState.balance += gain;

        triggerTapAnimation(e, gain);

        // Use proper haptics if available
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
             window.Telegram.WebApp.HapticFeedback.impactOccurred('medium'); // Heavier tap
        }

        adapter.saveLocalState(currentState);
        render();
    } else {
        const tapArea = document.getElementById('tap-area');
        if (tapArea) {
             tapArea.style.animation = 'shake 0.3s';
             setTimeout(() => tapArea.style.animation = '', 300);
        }
    }
}

function handleTaskClaim(taskId, xp, coins) {
    currentState = adapter.completeTask(taskId, xp, coins);
    render();
}

function render() {
  if (!currentState) return;

  const now = Math.floor(Date.now() / 1000);

  // --- HOME SCREEN ---
  const balanceEl = document.getElementById('balance-display');
  if (balanceEl) balanceEl.textContent = currentState.balance.toLocaleString();

  // XP & Level UI
  const levelBadge = document.getElementById('level-badge');
  if (levelBadge) {
      if (currentState.isPremium) {
           levelBadge.innerHTML = `Lvl ${currentState.level} <span style="color:#FFD60A">★</span>`;
           levelBadge.style.border = '1px solid #FFD60A';
      } else {
           levelBadge.textContent = `Lvl ${currentState.level}`;
           levelBadge.style.border = '1px solid rgba(255,255,255,0.2)';
      }
  }

  const xpBar = document.getElementById('xp-bar-fill');
  const xpText = document.getElementById('xp-text');
  if (xpBar && xpText) {
      let target = 50;
      if (currentState.level >= 1) target = 250;
      if (currentState.level >= 2) target = 500;
      if (currentState.level >= 5) target = 1050;

      const pct = Math.min(100, (currentState.xp / target) * 100);
      xpBar.style.width = `${pct}%`;
      xpText.textContent = `${currentState.xp}/${target} XP`;
  }

  // Energy Bar
  const energyVal = document.getElementById('energy-val');
  const energyBar = document.getElementById('energy-bar');
  if (energyVal && energyBar) {
      energyVal.textContent = `${Math.floor(currentState.energy)}/${currentState.maxEnergy}`;
      const pct = (currentState.energy / currentState.maxEnergy) * 100;
      energyBar.style.width = `${pct}%`;
  }

  // Tap Area Binding
  const tapArea = document.getElementById('tap-area');
  if (tapArea && !tapArea.onclick) {
      tapArea.onclick = handleTap;
      tapArea.addEventListener('touchstart', function(e) {
          e.preventDefault();
          handleTap(e.touches[0]);
      }, {passive: false});
  }

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
              minerBtn.disabled = true;
              currentState = await adapter.minerStart();
              render();
          };
      } else if (currentState.miner.status === 'mining') {
          const sessionEnd = currentState.miner.sessionEndTs;
          const left = sessionEnd - now;

          if (left > 0) {
              minerStatus.textContent = formatTime(left);
              minerStatus.className = 'status-chip ready';
              minerBtn.textContent = 'Mining...';
              minerBtn.disabled = true;
          } else {
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
      shopList.innerHTML = '';

      currentState.shop.items.forEach(item => {
          const owned = (currentState.boosts.inventory || []).includes(item.id);

          const div = document.createElement('div');
          // Important: use new 'list-item' class for grouped style, but wrap in card if needed?
          // Actually, 'card' + 'list-group' style.
          // Let's stick to 'list-item' structure inside the parent 'shop-list' which is a 'list-group' in HTML?
          // Wait, 'shop-list' is id. We need to style individual items as list items.

          // Re-structure: Shop List container should be .list-group
          // Items should be .list-item

          div.className = 'list-item'; // Changed from 'card boost-card'
          // We need custom content inside list item

          div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                <div class="boost-icon-wrapper" style="width: 36px; height: 36px; font-size: 18px;">
                    ${getIcon(item.icon)}
                </div>
                <div style="flex: 1;">
                    <h4 style="margin: 0; font-size: 16px; font-weight: 500;">${item.name}</h4>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${item.desc}</div>
                </div>
            </div>
            <button class="btn-gray-pill" style="margin-left: 12px; min-width: 80px;">
                ${owned ? 'Active' : item.price + ' TGM'}
            </button>
          `;

          const btn = div.querySelector('button');
          if (owned) {
              btn.disabled = true;
              btn.textContent = 'Owned';
              btn.style.color = 'var(--text-tertiary)';
              if (item.id === 'item_premium') {
                   btn.textContent = 'Premium';
                   btn.style.color = '#FFD60A';
              }
          } else {
              btn.onclick = async () => {
                  if (currentState.balance >= item.price) {
                      btn.textContent = '...';
                      currentState = await adapter.shopBuy(item.id);
                      render();
                  } else {
                      // Shake animation on button
                      btn.style.animation = 'shake 0.3s';
                      setTimeout(() => btn.style.animation = '', 300);
                  }
              };
          }
          shopList.appendChild(div);
      });
  }

  // TASKS LIST (Dynamic)
  const taskList = document.querySelector('#tasks .list-group');
  if (taskList) {
      taskList.innerHTML = '';

      const TASKS_DEF = [
          {id: 't_chat', name: 'Write in Chat', reward_xp: 13, reward_coin: 0, sub: '+13 XP'},
          {id: 't_invite', name: 'Invite a Friend', reward_xp: 250, reward_coin: 100, sub: '+250 XP, +100 TGM'},
          {id: 't_lottery', name: 'Buy Lottery Ticket', reward_xp: 100, reward_coin: 0, sub: '+100 XP'},
          {id: 't_nft', name: 'Buy NFT', reward_xp: 250, reward_coin: 0, sub: '+250 XP'},
          {id: 't_daily', name: 'Daily Login', reward_xp: 50, reward_coin: 5, sub: '+50 XP, +5 TGM'}
      ];

      const doneList = currentState.tasks.doneList || [];

      TASKS_DEF.forEach(t => {
          const isDone = doneList.includes(t.id);
          const div = document.createElement('div');
          div.className = 'list-item';
          div.innerHTML = `
            <div class="item-info">
                <h4>${t.name}</h4>
                <div class="item-price">${t.sub}</div>
            </div>
            <button class="btn-gray-pill">${isDone ? 'Done' : 'Do'}</button>
          `;

          const btn = div.querySelector('button');
          if (isDone) {
              btn.disabled = true;
              btn.style.background = 'transparent';
              btn.textContent = 'Completed';
          } else {
              btn.onclick = () => {
                  handleTaskClaim(t.id, t.reward_xp, t.reward_coin);
              };
          }
          taskList.appendChild(div);
      });
  }

  // FRIENDS UI Update
  const friendsView = document.getElementById('friends');
  if (friendsView) {
      const p = friendsView.querySelector('.item-price');
      if (p) p.textContent = "Invite friends to earn +100 TGM per invite plus 10% commission on their mining!";
  }

  // MINER UI Update
  const minerInfo = document.querySelector('#miner-status')?.parentElement?.querySelector('.item-price');
  if (minerInfo) {
      minerInfo.textContent = "Passive income (x10 in Sponsor Chat)";
  }
}

// Helper: Icons (SF Symbols approximation)
function getIcon(name) {
    if (name === 'bolt') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #FFD60A"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>';
    if (name === 'battery') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #32D74B"><rect x="1" y="6" width="18" height="12" rx="2" ry="2"></rect><line x1="23" y1="13" x2="23" y2="11"></line></svg>';
    if (name === 'hand.tap') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #0A84FF"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path></svg>';
    if (name === 'crown') return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #FFD60A"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z"></path></svg>';
    return '📦';
}

/* --- ANIMATION SYSTEM --- */
function triggerTapAnimation(event, amount) {
    const floatText = document.createElement('div');
    floatText.className = 'burst-text';
    floatText.textContent = `+${amount}`;

    let x = event.clientX;
    let y = event.clientY;
    if (!x || !y) {
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
    }

    floatText.style.position = 'fixed';
    floatText.style.left = x + 'px';
    floatText.style.top = y + 'px';
    floatText.style.pointerEvents = 'none';
    floatText.style.zIndex = '9999';
    floatText.style.fontSize = '48px'; // Larger

    document.body.appendChild(floatText);
    setTimeout(() => floatText.remove(), 800);
}

function triggerBoostAnimation(amount) {
    const burstCount = 16; // More particles
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    for (let i = 0; i < burstCount; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const angle = (Math.random() * 360) * (Math.PI / 180);
        const dist = 60 + Math.random() * 120; // Larger spread
        const tx = Math.cos(angle) * dist + 'px';
        const ty = Math.sin(angle) * dist + 'px';
        p.style.setProperty('--tx', tx);
        p.style.setProperty('--ty', ty);
        p.style.left = centerX + 'px';
        p.style.top = centerY + 'px';
        p.style.animation = `flyOut 1s ease-out forwards`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    }

    if (amount) {
        showSuccessModal(amount); // Use modal for big events
    }
}

function showSuccessModal(message) {
    let overlay = document.querySelector('.success-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'success-overlay';
        overlay.innerHTML = `
            <div class="success-card">
                <div class="success-icon">🎉</div>
                <div style="text-align: left;">
                    <h3 style="margin: 0; font-size: 17px; font-weight: 600;">Success</h3>
                    <p style="color: var(--text-secondary); margin: 0; font-size: 15px;">${message}</p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        overlay.querySelector('p').textContent = message;
    }
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    const card = overlay.querySelector('.success-card');
    card.style.transform = 'translateY(0)'; // Slide up to view

    setTimeout(() => {
        card.style.transform = 'translateY(100%)';
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
    }, 2500);
}
