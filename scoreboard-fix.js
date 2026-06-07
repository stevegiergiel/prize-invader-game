(function () {
  const MAX_VISIBLE_SCORES = 5;

  function html(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[ch]));
  }

  function scoreDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function topScores() {
    return (loadScores() || [])
      .filter(row => row && Number.isFinite(Number(row.score)))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
      .slice(0, MAX_VISIBLE_SCORES);
  }

  function buildNameDialog() {
    let dialog = document.getElementById('scoreNameDialog');
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.id = 'scoreNameDialog';
    dialog.innerHTML = `
      <div class="scoreDialogCard" role="dialog" aria-modal="true" aria-labelledby="scoreDialogTitle">
        <h2 id="scoreDialogTitle">Leaderboard Score!</h2>
        <p id="scoreDialogText">Enter your name for the Hall of Fame.</p>
        <input id="scoreNameInput" type="text" maxlength="14" autocomplete="off" value="PLAYER" />
        <button id="scoreNameSave" type="button">Save Score</button>
      </div>
    `;
    document.body.appendChild(dialog);

    const style = document.createElement('style');
    style.textContent = `
      #scoreNameDialog {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(2, 7, 17, 0.82);
      }
      #scoreNameDialog.open { display: flex; }
      .scoreDialogCard {
        width: min(360px, 94vw);
        border: 2px solid #56627a;
        border-radius: 18px;
        padding: 20px;
        background: #0f1726;
        color: #eef6ff;
        box-shadow: 0 24px 70px rgba(0,0,0,.65);
        text-align: center;
      }
      .scoreDialogCard h2 {
        margin: 0 0 8px;
        color: #f9d15c;
      }
      .scoreDialogCard p {
        margin: 0 0 14px;
        color: #b8c7d9;
      }
      #scoreNameInput {
        width: 100%;
        margin-bottom: 14px;
        padding: 13px 14px;
        border: 2px solid #56627a;
        border-radius: 12px;
        background: #020711;
        color: #eef6ff;
        font-size: 1.05rem;
        font-weight: 800;
        text-align: center;
        text-transform: uppercase;
      }
      #scoreNameSave {
        width: 100%;
      }
    `;
    document.head.appendChild(style);
    return dialog;
  }

  function askName(score, callback) {
    const dialog = buildNameDialog();
    const text = document.getElementById('scoreDialogText');
    const input = document.getElementById('scoreNameInput');
    const save = document.getElementById('scoreNameSave');

    text.textContent = `You scored ${Number(score || 0).toLocaleString('en-GB')} points. Enter your name.`;
    input.value = 'PLAYER';
    dialog.classList.add('open');

    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);

    function finish() {
      const name = (input.value || 'PLAYER')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 14)
        .toUpperCase() || 'PLAYER';
      dialog.classList.remove('open');
      save.removeEventListener('click', finish);
      input.removeEventListener('keydown', onKey);
      callback(name);
    }

    function onKey(e) {
      if (e.key === 'Enter') finish();
    }

    save.addEventListener('click', finish);
    input.addEventListener('keydown', onKey);
  }

  renderLeaderboard = function () {
    const scores = topScores();
    if (!scores.length) {
      leaderboardEl.innerHTML = '<li class="empty">No scores yet</li>';
      return;
    }

    leaderboardEl.innerHTML = scores.map((row, index) => {
      const name = html(row.name || row.title || 'PLAYER');
      const score = Number(row.score || 0).toLocaleString('en-GB');
      const level = Number(row.level || 0);
      const when = html(scoreDate(row.when));
      return `
        <li class="scoreRow">
          <span class="scoreRank">${index + 1}</span>
          <span class="scoreName">${name}</span>
          <strong class="scoreValue">${score}</strong>
          <span class="scoreMeta">L${level}${when ? ' · ' + when : ''}</span>
        </li>`;
    }).join('');
  };

  qualifiesForBoard = function (score) {
    const scores = topScores();
    return score > 0 && (scores.length < MAX_VISIBLE_SCORES || score > Number(scores[scores.length - 1].score || 0));
  };

  maybeSaveHighScore = function () {
    if (state.highScoreSaved || !qualifiesForBoard(state.score)) return;
    state.highScoreSaved = true;

    askName(state.score, function (name) {
      const scores = loadScores();
      scores.push({
        name,
        title: name,
        score: state.score,
        level: state.level,
        when: new Date().toISOString()
      });
      scores.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
      saveScores(scores.slice(0, MAX_VISIBLE_SCORES));
      beep('board');
      renderLeaderboard();
    });
  };

  renderLeaderboard();
})();
