const API_URL = window.location.origin + '/api';
let token = localStorage.getItem('token');
let currentUser = null;
let currentAuctionId = null;
let ws = null;
let timerInterval = null;

function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  if (tab === 'login') {
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
  } else {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }

    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;

    showMainSection();
  } catch (error) {
    showError('auth-error', error.message);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const role = document.getElementById('register-role').value;

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }

    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;

    showMainSection();
  } catch (error) {
    showError('auth-error', error.message);
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  closeWebSocket();
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('main-section').classList.add('hidden');
}

async function showMainSection() {
  await loadUserInfo();
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('main-section').classList.remove('hidden');
  showAuctionList();
}

async function loadUserInfo() {
  try {
    const response = await fetch(`${API_URL}/user/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const user = await response.json();
    currentUser = user;

    document.getElementById('user-info').textContent =
      `${user.username} (${user.role}) - Balance: ${user.balance}`;
  } catch (error) {
    console.error('Error loading user info:', error);
  }
}

async function addBalance() {
  const amount = prompt('Enter amount to add:');
  if (!amount || isNaN(amount)) return;

  try {
    const response = await fetch(`${API_URL}/user/balance/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount: parseInt(amount) })
    });

    const user = await response.json();
    currentUser = user;
    document.getElementById('user-info').textContent =
      `${user.username} (${user.role}) - Balance: ${user.balance}`;

    alert('Balance added successfully!');
  } catch (error) {
    alert('Error adding balance: ' + error.message);
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(token);
    showNotification('Token copied to clipboard! Use it for stress tests.', 'success');
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = token;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification('Token copied to clipboard! Use it for stress tests.', 'success');
  }
}

async function copyAuctionId(auctionId) {
  try {
    await navigator.clipboard.writeText(auctionId);
    showNotification('Auction ID copied! Use it for stress tests.', 'success');
  } catch (error) {
    const textarea = document.createElement('textarea');
    textarea.value = auctionId;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification('Auction ID copied! Use it for stress tests.', 'success');
  }
}

function showAuctionList() {
  document.getElementById('auction-list').classList.remove('hidden');
  document.getElementById('create-auction').classList.add('hidden');
  document.getElementById('auction-detail').classList.add('hidden');
  document.getElementById('bank-section').classList.add('hidden');
  document.getElementById('prizes-section').classList.add('hidden');
  closeWebSocket();
  loadAuctions();
}

function showCreateAuction() {
  document.getElementById('auction-list').classList.add('hidden');
  document.getElementById('create-auction').classList.remove('hidden');
  document.getElementById('auction-detail').classList.add('hidden');
  document.getElementById('bank-section').classList.add('hidden');
  document.getElementById('prizes-section').classList.add('hidden');
  closeWebSocket();
}

function showMyPrizes() {
  document.getElementById('auction-list').classList.add('hidden');
  document.getElementById('create-auction').classList.add('hidden');
  document.getElementById('auction-detail').classList.add('hidden');
  document.getElementById('bank-section').classList.add('hidden');
  document.getElementById('prizes-section').classList.remove('hidden');
  closeWebSocket();
  loadMyPrizes();
}

function showBankPage() {
  document.getElementById('auction-list').classList.add('hidden');
  document.getElementById('create-auction').classList.add('hidden');
  document.getElementById('auction-detail').classList.add('hidden');
  document.getElementById('bank-section').classList.remove('hidden');
  document.getElementById('prizes-section').classList.add('hidden');
  closeWebSocket();
  loadBankInfo();
}

async function loadAuctions() {
  try {
    const response = await fetch(`${API_URL}/auctions`);
    const auctions = await response.json();

    const container = document.getElementById('auctions-container');
    container.innerHTML = '';

    if (auctions.length === 0) {
      container.innerHTML = '<p>No auctions yet. Create one!</p>';
      return;
    }

    auctions.forEach(auction => {
      const card = document.createElement('div');
      card.className = 'auction-card';
      card.onclick = () => showAuctionDetail(auction.id || auction._id);

      card.innerHTML = `
        <h3>${auction.title}</h3>
        <p>${auction.description}</p>
        <p><strong>Rounds:</strong> ${auction.rounds} | <strong>Duration:</strong> ${auction.roundDuration}s</p>
        <p><strong>Winners per Round:</strong> ${auction.winnersPerRound} | <strong>Min Bid:</strong> ${auction.minBid}</p>
        <p><strong>Current Round:</strong> ${auction.currentRound} / ${auction.rounds}</p>
        <span class="auction-status status-${auction.status}">${auction.status}</span>
      `;

      container.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading auctions:', error);
  }
}

async function handleCreateAuction(e) {
  e.preventDefault();

  const title = document.getElementById('auction-title').value;
  const description = document.getElementById('auction-description').value;
  const rounds = parseInt(document.getElementById('auction-rounds').value);
  const roundDuration = parseInt(document.getElementById('auction-duration').value);
  const winnersPerRound = parseInt(document.getElementById('auction-winners').value);
  const prizes = document.getElementById('auction-prizes').value.split(',').map(p => p.trim());
  const minBid = parseInt(document.getElementById('auction-min-bid').value);

  const antiSnipingConfig = {
    enabled: document.getElementById('anti-sniping-enabled').checked,
    thresholdMinutes: parseInt(document.getElementById('anti-sniping-threshold').value),
    stepMultiplier: parseFloat(document.getElementById('anti-sniping-multiplier').value)
  };

  try {
    const response = await fetch(`${API_URL}/auctions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        description,
        rounds,
        roundDuration,
        winnersPerRound,
        prizes,
        minBid,
        antiSnipingConfig
      })
    });

    const auction = await response.json();

    if (!response.ok) {
      throw new Error(auction.error);
    }

    alert('Auction created successfully!');
    showAuctionList();
  } catch (error) {
    alert('Error creating auction: ' + error.message);
  }
}

async function showAuctionDetail(auctionId) {
  currentAuctionId = auctionId;

  try {
    const response = await fetch(`${API_URL}/auctions/${auctionId}`);
    const auction = await response.json();

    document.getElementById('auction-list').classList.add('hidden');
    document.getElementById('create-auction').classList.add('hidden');
    document.getElementById('auction-detail').classList.remove('hidden');
    document.getElementById('bank-section').classList.add('hidden');
    document.getElementById('prizes-section').classList.add('hidden');

    const infoDiv = document.getElementById('auction-info');
    infoDiv.innerHTML = `
      <h2>${auction.title} <button onclick="copyAuctionId('${auctionId}')" style="font-size: 0.7em; padding: 4px 8px;">Copy ID</button></h2>
      <p>${auction.description}</p>
      <p><strong>Rounds:</strong> ${auction.rounds} | <strong>Duration per Round:</strong> ${auction.roundDuration}s</p>
      <p><strong>Winners per Round:</strong> ${auction.winnersPerRound}</p>
      <p><strong>Prizes:</strong> ${auction.prizes.join(', ')}</p>
      <p><strong>Status:</strong> <span class="auction-status status-${auction.status}">${auction.status}</span></p>
    `;

    const statusDiv = document.getElementById('auction-status');
    if (auction.status === 'pending') {
      const isCreator = currentUser && (currentUser._id === auction.createdBy || currentUser.id === auction.createdBy);
      statusDiv.innerHTML = `
        <h3>Auction Not Started</h3>
        ${isCreator ? `<button onclick="startAuction('${auctionId}')">Start Auction</button>` : '<p>Waiting for creator to start...</p>'}
      `;
      document.getElementById('round-results').classList.add('hidden');
    } else if (auction.status === 'active') {
      statusDiv.innerHTML = `
        <h3>Round ${auction.currentRound} of ${auction.rounds}</h3>
        <div id="timer" class="timer"></div>
      `;
      startTimer(auction.roundEndTime);
      document.getElementById('round-results').classList.add('hidden');
    } else {
      statusDiv.innerHTML = `
        <h3>Auction Completed</h3>
      `;
      document.getElementById('round-results').classList.remove('hidden');
      await loadRoundResults(auctionId);
    }

    await loadMinBid(auctionId);
    await loadLeaderboard(auctionId);

    connectWebSocket(auctionId);
  } catch (error) {
    console.error('Error loading auction:', error);
  }
}

async function startAuction(auctionId) {
  try {
    const response = await fetch(`${API_URL}/auctions/${auctionId}/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    showAuctionDetail(auctionId);
  } catch (error) {
    alert('Error starting auction: ' + error.message);
  }
}

async function handlePlaceBid(e) {
  e.preventDefault();

  const amount = parseInt(document.getElementById('bid-amount').value);

  try {
    const response = await fetch(`${API_URL}/auctions/${currentAuctionId}/bid`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }

    document.getElementById('bid-amount').value = '';
    document.getElementById('bid-error').classList.add('hidden');
  } catch (error) {
    showError('bid-error', error.message);
  }
}

async function loadMinBid(auctionId) {
  try {
    const response = await fetch(`${API_URL}/auctions/${auctionId}/min-bid`);
    const data = await response.json();

    document.getElementById('min-bid-info').textContent = `Current minimum bid: ${data.minBid}`;
  } catch (error) {
    console.error('Error loading min bid:', error);
  }
}

async function loadLeaderboard(auctionId) {
  try {
    const response = await fetch(`${API_URL}/auctions/${auctionId}/leaderboard`);
    const leaderboard = await response.json();

    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '';

    if (leaderboard.length === 0) {
      leaderboardDiv.innerHTML = '<p>No bids yet. Be the first!</p>';
      return;
    }

    leaderboard.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = `leaderboard-item ${item.isBot ? 'bot' : ''}`;

      div.innerHTML = `
        <span class="leaderboard-rank">#${index + 1}</span>
        <span class="leaderboard-user">${item.username}${item.isBot ? ' 🤖' : ''}</span>
        <span class="leaderboard-amount">${item.amount}</span>
      `;

      leaderboardDiv.appendChild(div);
    });
  } catch (error) {
    console.error('Error loading leaderboard:', error);
  }
}

function connectWebSocket(auctionId) {
  closeWebSocket();

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const userId = currentUser?._id || currentUser?.id || '';
  const wsUrl = `${protocol}//${window.location.host}/ws/${auctionId}?userId=${userId}`;

  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'bid_placed') {
      loadLeaderboard(auctionId);
      loadMinBid(auctionId);
    } else if (message.type === 'balance_update') {
      if (currentUser && (currentUser._id === message.data.userId || currentUser.id === message.data.userId)) {
        currentUser.balance = message.data.balance;
        document.getElementById('user-info').textContent =
          `${currentUser.username} (${currentUser.role}) - Balance: ${currentUser.balance}`;
      }
    } else if (message.type === 'time_extended') {
      if (currentAuctionId === auctionId) {
        showNotification(`Anti-snipe activated! Round extended by ${message.data.extensionSeconds} seconds`, 'warning');
      }
    } else if (message.type === 'timer_update') {
      const timerDiv = document.getElementById('timer');
      if (timerDiv && message.data.remaining > 0) {
        const minutes = Math.floor(message.data.remaining / 60000);
        const seconds = Math.floor((message.data.remaining % 60000) / 1000);
        timerDiv.textContent = `Time Remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    } else if (message.type === 'round_started') {
      if (currentAuctionId === auctionId) {
        showNotification(`Round ${message.data.currentRound} started!`, 'info');
        const statusDiv = document.getElementById('auction-status');
        if (statusDiv) {
          statusDiv.innerHTML = `
            <h3>Round ${message.data.currentRound} of ${message.data.totalRounds}</h3>
            <div id="timer" class="timer"></div>
          `;
        }
        loadLeaderboard(auctionId);
        loadMinBid(auctionId);
      }
    } else if (message.type === 'auction_completed') {
      if (currentAuctionId === auctionId) {
        showNotification('Auction completed!', 'success');
        setTimeout(() => {
          showAuctionDetail(auctionId);
        }, 2000);
      }
    } else if (message.type === 'winner_notification') {
      if (currentUser && (currentUser._id === message.data.userId || currentUser.id === message.data.userId)) {
        showNotification(`Congratulations! You won "${message.data.prize}" in Round ${message.data.round}!`, 'success');
      }
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function closeWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimer(endTime) {
}

function showError(elementId, message) {
  const errorDiv = document.getElementById(elementId);
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');

  setTimeout(() => {
    errorDiv.classList.add('hidden');
  }, 5000);
}

async function loadBankInfo() {
  try {
    const response = await fetch(`${API_URL}/bank`);
    const data = await response.json();

    const bankContainer = document.getElementById('bank-info');
    bankContainer.innerHTML = `
      <h2>Bank Total: ${data.total}</h2>
      <h3>Recent Transactions</h3>
      <div class="bank-transactions">
        ${data.transactions.map(t => `
          <div class="bank-transaction">
            <span><strong>${t.auction}</strong> - Round ${t.round}</span>
            <span>User: ${t.user}</span>
            <span>Amount: ${t.amount}</span>
            <span>${new Date(t.createdAt).toLocaleString()}</span>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Error loading bank info:', error);
  }
}

async function loadMyPrizes() {
  try {
    const response = await fetch(`${API_URL}/user/prizes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const prizes = await response.json();

    const container = document.getElementById('prizes-container');

    if (prizes.length === 0) {
      container.innerHTML = '<p>You have not won any prizes yet.</p>';
      return;
    }

    container.innerHTML = prizes.map(prize => `
      <div class="prize-card">
        <h3>${prize.auction_id.title}</h3>
        <p><strong>Prize:</strong> ${prize.prize}</p>
        <p><strong>Round:</strong> ${prize.round}</p>
        <p><strong>Rank:</strong> ${prize.rank}</p>
        <p><strong>Total Bid:</strong> ${prize.total_bid}</p>
        <p><strong>Won on:</strong> ${new Date(prize.created_at).toLocaleString()}</p>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading prizes:', error);
  }
}

async function loadRoundResults(auctionId) {
  try {
    const response = await fetch(`${API_URL}/auctions/${auctionId}/results`);
    const results = await response.json();

    const container = document.getElementById('round-results-content');

    if (Object.keys(results).length === 0) {
      container.innerHTML = '<p>No results available yet.</p>';
      return;
    }

    container.innerHTML = Object.entries(results).map(([round, winners]) => `
      <div class="round-result">
        <h4>Round ${round}</h4>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Username</th>
              <th>Prize</th>
              <th>Total Bid</th>
            </tr>
          </thead>
          <tbody>
            ${winners.map(winner => `
              <tr>
                <td>${winner.rank}</td>
                <td>${winner.username}</td>
                <td>${winner.prize}</td>
                <td>${winner.total_bid}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading round results:', error);
  }
}

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.remove('hidden');

  setTimeout(() => {
    notification.classList.add('hidden');
  }, 5000);
}

if (token) {
  showMainSection();
}
