import sqlite3
import json
import time

DB_NAME = 'tgm_coin.db'

# Define Shop Items (Boosts & Cosmetics & Premium)
SHOP_ITEMS = {
    'boost_speed': {
        'id': 'boost_speed',
        'name': '2x Mining Speed',
        'price': 100,
        'type': 'booster',
        'icon': 'bolt',
        'desc': 'Double income for 1 hour'
    },
    'boost_capacity': {
        'id': 'boost_capacity',
        'name': 'Energy Tank',
        'price': 250,
        'type': 'booster',
        'icon': 'battery',
        'desc': '+500 Max Energy'
    },
    'boost_multitap': {
        'id': 'boost_multitap',
        'name': 'Multi-Tap',
        'price': 500,
        'type': 'booster',
        'icon': 'hand.tap',
        'desc': '+1 Coin per tap'
    },
    'item_premium': {
        'id': 'item_premium',
        'name': 'Premium Status',
        'price': 100,
        'type': 'subscription',
        'icon': 'crown',
        'desc': 'x2 Multiplier on ALL Earnings'
    }
}

# Module 1: XP Thresholds & Rewards
LEVEL_THRESHOLDS = {
    1: {'xp': 50, 'reward': 5},
    2: {'xp': 250, 'reward': 1},
    3: {'xp': 500, 'reward': 1},
    4: {'xp': 600, 'reward': 1},
    5: {'xp': 650, 'reward': 10},
    10: {'xp': 1050, 'reward': 100},
    15: {'xp': 1500, 'reward': 200},
    20: {'xp': 2000, 'reward': 400},
    30: {'xp': 3000, 'reward': 600},
    40: {'xp': 4000, 'reward': 600},
    50: {'xp': 14000, 'reward': 1000}
}

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    # Users table - Added energy columns, xp, level, is_premium
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        energy INTEGER DEFAULT 500,
        max_energy INTEGER DEFAULT 500,
        last_energy_ts INTEGER DEFAULT 0,
        tap_level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        is_premium INTEGER DEFAULT 0,
        last_reward_ts INTEGER DEFAULT 0,
        last_daily_ts INTEGER DEFAULT 0,
        miner_status TEXT DEFAULT 'idle',
        miner_session_end_ts INTEGER DEFAULT 0,
        miner_last_claim_ts INTEGER DEFAULT 0,
        tasks_done_today INTEGER DEFAULT 0,
        tasks_daily_json TEXT DEFAULT '[]',
        tasks_weekly_json TEXT DEFAULT '[]',
        inventory_json TEXT DEFAULT '[]',
        active_boosts_json TEXT DEFAULT '[]',
        friends_json TEXT DEFAULT '[]',
        invite_code TEXT
    )''')

    conn.commit()
    conn.close()

def get_next_level_xp(current_level):
    # Find next threshold > current level
    # Since keys are sparse (1, 2, 3, 4, 5, 10...), we need logic
    # Assume levels between thresholds require previous threshold XP?
    # Or just use the closest higher key?
    # Module 1 implies specific levels grant specific rewards.
    # We'll just target the next defined milestone for simplicity in this MVP.
    sorted_levels = sorted(LEVEL_THRESHOLDS.keys())
    for lvl in sorted_levels:
        if lvl > current_level:
            return LEVEL_THRESHOLDS[lvl]['xp'], lvl
    return 999999, 100 # Max

def get_user_state(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()

    # Default State Structure
    state = {
        'balance': 0,
        'energy': 500,
        'maxEnergy': 500,
        'tapLevel': 1,
        'xp': 0,
        'level': 0,
        'nextLevelXp': 50,
        'isPremium': False,
        'chat': {'lastRewardTs': 0, 'cooldownSec': 60},
        'daily': {'lastDailyTs': 0, 'cooldownSec': 86400},
        'miner': {'status': 'idle', 'sessionEndTs': 0, 'lastClaimTs': 0},
        'tasks': {'doneToday': 0, 'totalToday': 3, 'daily': [], 'weekly': []},
        'boosts': {'inventory': [], 'active': []},
        'shop': {'items': list(SHOP_ITEMS.values()), 'dailyDealId': 'boost_speed'},
        'friends': {'inviteCode': '', 'stats': {'invited': 0, 'active': 0}, 'list': []}
    }

    if row is None:
        # Create new user
        invite_code = f"user_{user_id}_{int(time.time())}"
        c.execute('''INSERT INTO users (id, invite_code, last_energy_ts) VALUES (?, ?, ?)''', (user_id, invite_code, int(time.time())))
        conn.commit()
        state['friends']['inviteCode'] = invite_code
        conn.close()
        return state

    # Parse JSON fields and populate state

    # Energy Regen Logic (Server Side)
    now = int(time.time())
    last_energy_ts = row['last_energy_ts']
    current_energy = row['energy']
    max_energy = row['max_energy']

    # Regen 1 energy per second
    elapsed = now - last_energy_ts
    if elapsed > 0 and current_energy < max_energy:
        regen = elapsed
        new_energy = min(max_energy, current_energy + regen)
        # Update DB lazily
        c.execute('UPDATE users SET energy = ?, last_energy_ts = ? WHERE id = ?', (new_energy, now, user_id))
        conn.commit()
        current_energy = new_energy

    state['balance'] = row['balance']
    state['energy'] = current_energy
    state['maxEnergy'] = max_energy
    state['tapLevel'] = row['tap_level']

    # XP & Level
    state['xp'] = row['xp']
    state['level'] = row['level']
    state['isPremium'] = bool(row['is_premium'])

    next_xp, next_lvl = get_next_level_xp(row['level'])
    state['nextLevelXp'] = next_xp
    state['nextLevelTarget'] = next_lvl

    state['chat']['lastRewardTs'] = row['last_reward_ts']
    state['daily']['lastDailyTs'] = row['last_daily_ts']

    state['miner']['status'] = row['miner_status']
    state['miner']['sessionEndTs'] = row['miner_session_end_ts']
    state['miner']['lastClaimTs'] = row['miner_last_claim_ts']

    state['tasks']['doneToday'] = row['tasks_done_today']
    # JSON parsing with safety defaults
    try: state['tasks']['daily'] = json.loads(row['tasks_daily_json'])
    except: pass
    try: state['tasks']['weekly'] = json.loads(row['tasks_weekly_json'])
    except: pass

    try: state['boosts']['inventory'] = json.loads(row['inventory_json'])
    except: pass
    try: state['boosts']['active'] = json.loads(row['active_boosts_json'])
    except: pass

    state['friends']['inviteCode'] = row['invite_code']
    try: friends_list = json.loads(row['friends_json'])
    except: friends_list = []
    state['friends']['list'] = friends_list
    state['friends']['stats']['invited'] = len(friends_list)

    conn.close()
    return state

def update_tap(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT balance, energy, max_energy, last_energy_ts, tap_level, is_premium, xp FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()

    if row:
        now = int(time.time())
        balance = row['balance']
        energy = row['energy']
        max_energy = row['max_energy']
        last_ts = row['last_energy_ts']
        tap_level = row['tap_level']
        is_premium = row['is_premium']
        xp = row['xp']

        # Calculate regen first
        elapsed = now - last_ts
        if elapsed > 0:
            energy = min(max_energy, energy + elapsed)

        if energy >= 1:
            new_energy = energy - 1

            # Premium Multiplier (x2)
            multiplier = 2 if is_premium else 1
            gain = (1 * tap_level) * multiplier

            new_balance = balance + gain

            # Simple XP gain on tap? Usually taps don't give XP, but for MVP let's say 1 XP per tap occasionally?
            # Or stick to modules: "Chat +13 XP". Tapping is not listed as XP source.

            c.execute('UPDATE users SET balance = ?, energy = ?, last_energy_ts = ? WHERE id = ?',
                      (new_balance, new_energy, now, user_id))
            conn.commit()

    conn.close()
    return get_user_state(user_id)

def update_miner_start(user_id):
    # For demo, mining takes 60 seconds
    session_end = int(time.time()) + 60
    conn = get_db()
    c = conn.cursor()
    c.execute('UPDATE users SET miner_status = ?, miner_session_end_ts = ? WHERE id = ?',
              ('mining', session_end, user_id))
    conn.commit()
    conn.close()
    return get_user_state(user_id)

def update_miner_claim(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT miner_status, miner_session_end_ts, balance, inventory_json, is_premium FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()

    if row and row['miner_status'] == 'mining':
        now = time.time()
        if True: # Simulating successful mining session logic for MVP
            base_reward = 10

            # Apply Boosts logic
            try: inventory = json.loads(row['inventory_json'])
            except: inventory = []

            boost_multiplier = 1
            if 'boost_speed' in inventory:
                boost_multiplier = 2

            # Premium Multiplier (x2)
            premium_multiplier = 2 if row['is_premium'] else 1

            final_reward = base_reward * boost_multiplier * premium_multiplier
            new_balance = row['balance'] + final_reward

            c.execute('''UPDATE users SET
                balance = ?,
                miner_status = 'idle',
                miner_session_end_ts = 0,
                miner_last_claim_ts = ?
                WHERE id = ?''', (new_balance, int(now), user_id))
            conn.commit()

    conn.close()
    return get_user_state(user_id)

def buy_item(user_id, item_id):
    if item_id not in SHOP_ITEMS:
        return get_user_state(user_id) # Invalid item

    price = SHOP_ITEMS[item_id]['price']

    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT balance, inventory_json, max_energy, tap_level, is_premium FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()

    if row:
        current_balance = row['balance']
        try: inventory = json.loads(row['inventory_json'])
        except: inventory = []

        # Check if already owned (unique items for this demo)
        if item_id in inventory:
            conn.close()
            return get_user_state(user_id) # Already owned

        if current_balance >= price:
            new_balance = current_balance - price
            inventory.append(item_id)

            # APPLY BOOST LOGIC
            extra_sql = ""
            args = []

            if item_id == 'boost_capacity':
                new_max = row['max_energy'] + 500
                extra_sql = ", max_energy = ?"
                args.append(new_max)
            elif item_id == 'boost_multitap':
                new_tap = row['tap_level'] + 1
                extra_sql = ", tap_level = ?"
                args.append(new_tap)
            elif item_id == 'item_premium':
                extra_sql = ", is_premium = 1"

            query = f'UPDATE users SET balance = ?, inventory_json = ? {extra_sql} WHERE id = ?'
            all_args = [new_balance, json.dumps(inventory)] + args + [user_id]

            c.execute(query, tuple(all_args))
            conn.commit()

    conn.close()
    return get_user_state(user_id)

# Initialize DB on load
init_db()
