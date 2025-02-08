from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import random, string, time
import eventlet
from eventlet import wsgi

# Eventlet monkey-patches standard library modules for better concurrency support.
eventlet.monkey_patch()

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

lobbies = {}
words = {
    "Animals": ["Tiger", "Elephant", "Dolphin", "Eagle"],
    "Sports": ["Football", "Tennis", "Basketball", "Baseball"],  # Fixed duplicate
    "Cities": ["Paris", "New York", "Tokyo", "Berlin"]
}

def generate_lobby_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
        if code not in lobbies:  # Ensure code is unique
            return code

def get_random_avatar():
    # Using RoboHash to generate a random funny avatar
    return f"https://robohash.org/{random.randint(1, 100000)}.png?size=50x50"

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create_lobby')
def create_lobby(host):
    code = generate_lobby_code()
    lobbies[code] = {
        "host": host,
        "players": {},
        "spy": None,
        "category": None,
        "started": False,
        "voting": False,
        "timer": 0
    }
    join_room(code)
    lobbies[code]['players'][host] = {"role": "Waiting", "word": "", "avatar": get_random_avatar()}
    emit("lobby_created", {"code": code, "host": host}, room=code)

@socketio.on('join_lobby')
def join_lobby(data):
    code = data['code']
    username = data['username']

    if code not in lobbies:
        emit("error", "Lobby not found.")
        return

    if lobbies[code]['started']:
        emit("error", "Game has already started.")
        return

    if username in lobbies[code]['players']:  # Prevent duplicate names
        emit("error", "Username already taken in this lobby.")
        return

    join_room(code)
    lobbies[code]['players'][username] = {"role": "Waiting", "word": "", "avatar": get_random_avatar()}

    # Emit to ALL players in the lobby (including the host and the new player)
    emit("update_players", lobbies[code]['players'], room=code)

@socketio.on('start_game')
def start_game(data):
    code = data['code']
    host = data['host']
    duration = int(data.get('time', 120))

    if code in lobbies and lobbies[code]['host'] == host:
        category = random.choice(list(words.keys()))
        spy = random.choice(list(lobbies[code]['players'].keys()))
        assigned_word = random.choice(words[category])  # Select one random word for all players

        i = 0
        for player in lobbies[code]['players']:
            if player == spy:
                lobbies[code]['players'][player]['role'] = "Spy"
                lobbies[code]['players'][player]['word'] = "???"  # Spy gets "???"
            else:
                lobbies[code]['players'][player]['role'] = "Detective"
                lobbies[code]['players'][player]['word'] = assigned_word  # All detectives get the same word

        lobbies[code]['spy'] = spy
        lobbies[code]['category'] = category
        lobbies[code]['started'] = True
        lobbies[code]['timer'] = duration
        emit("game_started", lobbies[code]['players'], room=code)
        socketio.start_background_task(game_timer, code, duration)


def game_timer(code, duration):
    remaining = duration
    while remaining >= 0:
        socketio.emit("timer", {"time": remaining}, room=code)
        time.sleep(1)
        remaining -= 1
    socketio.emit("time_up", room=code)

@socketio.on('get_word')
def send_word(data):
    code, username = data['code'], data['username']
    if username in lobbies[code]['players']:
        emit("your_word", {"role": lobbies[code]['players'][username]["role"],
                           "word": lobbies[code]['players'][username]["word"]})

@socketio.on('chat_message')
def handle_chat(data):
    code = data['code']
    username = data['username']
    avatar = lobbies[code]['players'][username]['avatar'] if username in lobbies[code]['players'] else ''
    emit("chat_update", {"username": username, "message": data['message'], "avatar": avatar}, room=code)

@socketio.on('start_voting')
def start_voting(data):
    code = data['code']
    if code in lobbies and lobbies[code]['host'] == data['host']:
        lobbies[code]['voting'] = True
        emit("voting_started", lobbies[code]['players'], room=code)


@socketio.on('vote')
def handle_vote(data):
    code, suspect = data['code'], data['suspect']
    spy = lobbies[code]['spy']

    # Track vote counts and game outcome
    if 'votes' not in lobbies[code]:
        lobbies[code]['votes'] = {player: 0 for player in lobbies[code]['players']}

    # Track the vote status
    if 'voted_players' not in lobbies[code]:
        lobbies[code]['voted_players'] = set()

    lobbies[code]['votes'][suspect] += 1
    lobbies[code]['voted_players'].add(data['player'])  # Add the player to the voted list

    # Check if all players have voted
    if len(lobbies[code]['voted_players']) == len(lobbies[code]['players']):
        # If a majority votes for the spy, game over
        if max(lobbies[code]['votes'].values()) > len(lobbies[code]['players']) // 2 + 1:
            result = f"Spy ({spy}) was caught! Detectives win!" if suspect == spy else f"Spy ({spy}) escaped! The category was {lobbies[code]['category']}."
            emit("game_over", result, room=code)
        else:
            emit("voting_update", lobbies[code]['votes'], room=code)
            # Reset votes and players for next round or phase
            lobbies[code]['votes'] = {player: 0 for player in lobbies[code]['players']}
            lobbies[code]['voted_players'] = set()  # Reset voted players for the next round
    else:
        emit("voting_update", lobbies[code]['votes'], room=code)


@socketio.on('restart')
def restart_game(data):
    code = data['code']
    if code in lobbies:
        lobbies[code]['players'] = {}
        lobbies[code]['spy'] = None
        lobbies[code]['category'] = None
        lobbies[code]['started'] = False
        lobbies[code]['voting'] = False
        lobbies[code]['votes'] = {}
        emit("reset_game", room=code)

if __name__ == '__main__':
    # Don't need to run with wsgi.server anymore, let gunicorn handle that.
    pass
