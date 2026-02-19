import sqlite3
import json
import time
import os

DB_NAME = 'tgm_coin.db'

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
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

    if row is None:
        # Create new user
        invite_code = f"user_{user_id}_{int(time.time())}"
        c.execute('''INSERT INTO users (id, invite_code) VALUES (?, ?)''', (user_id, invite_code))
        conn.commit()
        # Return default state
        return {
            'balance': 0,
            'chat': {'lastRewardTs': 0, 'cooldownSec': 60},
            'daily': {'lastDailyTs': 0, 'cooldownSec': 86400},
            'miner': {'status': 'idle', 'sessionEndTs': 0, 'lastClaimTs': 0},
            'tasks': {'doneToday': 0, 'totalToday': 3, 'daily': [], 'weekly': []},
            'boosts': {'inventory': [], 'active': []},
            'shop': {'items': [], 'dailyDealId': None},
            'friends': {'inviteCode': invite_code, 'stats': {'invited': 0, 'active': 0}, 'list': []}
        }

    # Parse JSON fields
    state = {
        'balance': row['balance'],
        'chat': {
            'lastRewardTs': row['last_reward_ts'],
            'cooldownSec': 60
        },
        'daily': {
            'lastDailyTs': row['last_daily_ts'],
            'cooldownSec': 86400
        },
        'miner': {
            'status': row['miner_status'],
            'sessionEndTs': row['miner_session_end_ts'],
            'lastClaimTs': row['miner_last_claim_ts']
        },
        'tasks': {
            'doneToday': row['tasks_done_today'],
            'totalToday': 3,
            'daily': json.loads(row['tasks_daily_json']),
            'weekly': json.loads(row['tasks_weekly_json'])
        },
        'boosts': {
            'inventory': json.loads(row['inventory_json']),
            'active': json.loads(row['active_boosts_json'])
        },
        'shop': {
            'items': [
                {'id': 'boost_x2', 'name': '2x Mining Speed', 'price': 100, 'type': 'booster'},
                {'id': 'skin_gold', 'name': 'Gold Skin', 'price': 500, 'type': 'cosmetic'},
                {'id': 'ticket_raffle', 'name': 'Raffle Ticket', 'price': 50, 'type': 'ticket'}
            ],
            'dailyDealId': 'boost_x2'
        },
        'friends': {
            'inviteCode': row['invite_code'],
            'stats': {'invited': len(json.loads(row['friends_json'])), 'active': 0}, # Simplified
            'list': json.loads(row['friends_json'])
        }
    }
    conn.close()
    return state

def update_miner_start(user_id):
    conn = get_db()
    c = conn.cursor()
    # Mining duration hardcoded for demo: 60 seconds
    session_end = int(time.time()) + 60
    c.execute('UPDATE users SET miner_status = ?, miner_session_end_ts = ? WHERE id = ?', ('mining', session_end, user_id))
    conn.commit()
    conn.close()
    return get_user_state(user_id)

def update_miner_claim(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT miner_status, miner_session_end_ts, balance FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()

    if row and row['miner_status'] == 'mining' and time.time() >= row['miner_session_end_ts']:
        # Claim reward
        reward = 10 # Base reward
        new_balance = row['balance'] + reward
        c.execute('''UPDATE users SET
            balance = ?,
            miner_status = 'idle',
            miner_session_end_ts = 0,
            miner_last_claim_ts = ?
            WHERE id = ?''', (new_balance, int(time.time()), user_id))
        conn.commit()

    conn.close()
    return get_user_state(user_id)

def update_shop_buy(user_id, item_id):
    state = get_user_state(user_id) # Need to get price from code logic or store items in DB
    # For demo, hardcode prices matching get_user_state
    prices = {'boost_x2': 100, 'skin_gold': 500, 'ticket_raffle': 50}

    if item_id not in prices:
        return state

    price = prices[item_id]

    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT balance, inventory_json FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()

    if row and row['balance'] >= price:
        new_balance = row['balance'] - price
        inventory = json.loads(row['inventory_json'])
        inventory.append(item_id)
        c.execute('UPDATE users SET balance = ?, inventory_json = ? WHERE id = ?',
                  (new_balance, json.dumps(inventory), user_id))
        conn.commit()

    conn.close()
    return get_user_state(user_id)

# Initialize DB on load
init_db()
