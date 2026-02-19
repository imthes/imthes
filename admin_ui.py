from flask import Flask, jsonify, request, send_from_directory
import os
import storage

app = Flask(__name__, static_folder='static', static_url_path='/static')

# Serve static frontend
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

# API Endpoints
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'ok': True})

@app.route('/api/state', methods=['GET'])
def get_state():
    user_id = request.args.get('uid', 'demo_user')
    state = storage.get_user_state(user_id)
    return jsonify(state)

@app.route('/api/miner/start', methods=['POST'])
def miner_start():
    user_id = request.json.get('uid', 'demo_user')
    new_state = storage.update_miner_start(user_id)
    return jsonify(new_state)

@app.route('/api/miner/claim', methods=['POST'])
def miner_claim():
    user_id = request.json.get('uid', 'demo_user')
    new_state = storage.update_miner_claim(user_id)
    return jsonify(new_state)

@app.route('/api/shop/buy', methods=['POST'])
def shop_buy():
    data = request.json
    user_id = data.get('uid', 'demo_user')
    item_id = data.get('itemId')
    if not item_id:
        return jsonify({'error': 'No item_id'}), 400

    # Delegate to storage
    new_state = storage.buy_item(user_id, item_id)
    return jsonify(new_state)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
