const socket = io();
let username, lobbyCode;
let players = {}; // store players data
let votes = {}; // track who voted

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

// Update Player List in Lobby (visible to all players now)
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
  document.getElementById("word").innerText = players[username].word;  // Show the word for the player
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
  voteList.innerHTML = ""; // Clear previous list items

  // Populate vote list with players
  for (let player in playerData) {
    let li = document.createElement("li");
    li.innerHTML = `<img src="${playerData[player].avatar}" class="avatar"> ${player}`;
    li.onclick = function() {
      socket.emit("vote", { code: lobbyCode, suspect: player });
      highlightVotedPlayer(username, player); // Immediately highlight the voted player
    };
    voteList.appendChild(li);

    // Optionally, mark the suspect if they were voted before
    if (votes[username] === player) {
      li.classList.add("voted"); // Highlight the player who has been voted by this player already
    }
  }
});

// Handle player voting
socket.on("vote_received", function(voter, suspect) {
  votes[voter] = suspect; // Store the vote
  highlightVotedPlayer(voter, suspect); // Highlight the voted player for this player
});

// Function to highlight voted player
function highlightVotedPlayer(voter, suspect) {
  let voteList = document.getElementById("voteList");
  let listItems = voteList.getElementsByTagName("li");
  for (let li of listItems) {
    if (li.innerText.includes(suspect)) {
      li.classList.add("voted"); // Apply the "voted" class to highlight the suspect
    } else {
      li.classList.remove("voted"); // Remove highlight from other players
    }
  }
}

// Show Game Over Result
socket.on("game_over", function(result) {
  document.getElementById("gameResult").style.display = "block";
  document.getElementById("gameResult").innerText = result;
});

// Check if all players have voted before declaring the result
socket.on("check_all_voted", function() {
  // Send an acknowledgement once all players have voted
  if (Object.keys(votes).length === Object.keys(players).length) {
    socket.emit("all_voted", { code: lobbyCode });
  }
});
