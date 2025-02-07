const socket = io();
let username, lobbyCode;
let players = {}; // store players data

// Create Lobby
document.getElementById("createLobby").addEventListener("click", function() {
  username = document.getElementById("username").value.trim();
  if (!username) return alert("Enter your name!");
  socket.emit("create_lobby", username);
});

// Join Lobby
document.getElementById("joinLobby").addEventListener("click", function() {
  username = document.getElementById("username").value.trim();
  lobbyCode = document.getElementById("lobbyCodeInput").value.trim();
  if (!username || !lobbyCode) return alert("Enter name and lobby code!");
  socket.emit("join_lobby", { code: lobbyCode, username: username });
});

// Receive Lobby Code and host info when lobby is created
socket.on("lobby_created", function(data) {
  lobbyCode = data.code;
  showLobby(data.host);
});

// Show Lobby UI
function showLobby(host) {
  document.getElementById("lobby").style.display = "block";
  document.getElementById("create-join").style.display = "none";
  document.getElementById("lobbyCodeDisplay").innerText = lobbyCode;
  document.getElementById("lobbyHostDisplay").innerText = host;
}

// Update Player List in Lobby
socket.on("update_players", function(playerData) {
  players = playerData;
  let list = document.getElementById("playerList");
  list.innerHTML = "";
  for (let player in playerData) {
    let li = document.createElement("li");
    li.innerHTML = `<img src="${playerData[player].avatar}" class="avatar"> ${player} (${playerData[player].role})`;
    list.appendChild(li);
  }
});

// Start Game (host only)
document.getElementById("startGame").addEventListener("click", function() {
  let time = document.getElementById("gameTime").value;
  socket.emit("start_game", { code: lobbyCode, host: username, time: time });
});

// Game Started
socket.on("game_started", function(playerData) {
  players = playerData;
  document.getElementById("game").style.display = "block";
  document.getElementById("lobby-container").style.display = "none";
  document.getElementById("role").innerText = players[username].role;
  document.getElementById("word").innerText = players[username].word;
});

// Timer update
socket.on("timer", function(data) {
  document.getElementById("timerDisplay").innerText = data.time + " sec";
});

// When time is up, notify players and show voting controls
socket.on("time_up", function() {
  alert("Time is up! Voting will begin.");
  document.getElementById("votingControls").style.display = "block";
});

// Chat Messages
document.getElementById("sendChat").addEventListener("click", function() {
  let message = document.getElementById("chatInput").value;
  if (!message) return;
  socket.emit("chat_message", { code: lobbyCode, username: username, message: message });
  document.getElementById("chatInput").value = "";
});

socket.on("chat_update", function(data) {
  let chatBox = document.getElementById("chatBox");
  chatBox.innerHTML += `<p><img src="${data.avatar}" class="chat-avatar"><strong>${data.username}:</strong> ${data.message}</p>`;
  chatBox.scrollTop = chatBox.scrollHeight;
});

// Start Voting (host only)
document.getElementById("startVoting").addEventListener("click", function() {
  socket.emit("start_voting", { code: lobbyCode, host: username });
});

// Voting Phase - display list of players for voting
socket.on("voting_started", function(playerData) {
  players = playerData;
  document.getElementById("voting").style.display = "block";
  let voteList = document.getElementById("voteList");
  voteList.innerHTML = ""; // Clear previous votes

  for (let player in playerData) {
    let li = document.createElement("li");
    li.innerHTML = `<img src="${playerData[player].avatar}" class="avatar"> ${player}`;
    li.onclick = function() {
      // Emit vote and add the 'voted' class to highlight the voted player
      socket.emit("vote", { code: lobbyCode, suspect: player });

      // Add the 'voted' class to highlight the voted player
      this.classList.add('voted');

      // Optionally, disable further voting after selecting
      this.style.pointerEvents = 'none'; // Disable clicking again after voting
    };
    voteList.appendChild(li);
  }
});

// Show Game Over Result
socket.on("game_over", function(result) {
  document.getElementById("gameResult").style.display = "block";
  document.getElementById("gameResult").innerText = result;
});
