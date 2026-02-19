import sqlite3
import json
import time

DB_NAME = 'tgm_coin.db'

# Define Shop Items (Boosts & Cosmetics)
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
        'desc': '+100 Max Energy'
    },
    'boost_multitap': {
        'id': 'boost_multitap',
        'name': 'Multi-Tap',
        'price': 500,
        'type': 'booster',
        'icon': 'hand.tap',
        'desc': '+1 Coin per tap'
    }
}

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    # Users table - Added energy columns
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        energy INTEGER DEFAULT 500,
        max_energy INTEGER DEFAULT 500,
        last_energy_ts INTEGER DEFAULT 0,
        tap_level INTEGER DEFAULT 1,
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
    c.execute('SELECT balance, energy, max_energy, last_energy_ts, tap_level FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()

    if row:
        now = int(time.time())
        balance = row['balance']
        energy = row['energy']
        max_energy = row['max_energy']
        last_ts = row['last_energy_ts']
        tap_level = row['tap_level']

        # Calculate regen first
        elapsed = now - last_ts
        if elapsed > 0:
            energy = min(max_energy, energy + elapsed)

        if energy >= 1:
            new_energy = energy - 1
            new_balance = balance + (1 * tap_level)
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
    c.execute('SELECT miner_status, miner_session_end_ts, balance, inventory_json FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()

    if row and row['miner_status'] == 'mining':
        now = time.time()
        if True: # Simulating successful mining session logic for MVP
            base_reward = 10

            # Apply Boosts logic
            try: inventory = json.loads(row['inventory_json'])
            except: inventory = []

            multiplier = 1
            if 'boost_speed' in inventory:
                multiplier = 2

            final_reward = base_reward * multiplier
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
    c.execute('SELECT balance, inventory_json, max_energy, tap_level FROM users WHERE id = ?', (user_id,))
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

            query = f'UPDATE users SET balance = ?, inventory_json = ? {extra_sql} WHERE id = ?'
            all_args = [new_balance, json.dumps(inventory)] + args + [user_id]

            c.execute(query, tuple(all_args))
            conn.commit()

    conn.close()
    return get_user_state(user_id)

# Initialize DB on load
init_db()
