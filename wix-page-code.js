import wixData from 'wix-data';

const COLLECTION = 'PrizeInvaderScores';
const HTML_ELEMENT_ID = '#htmlPrizeInvader';

$w.onReady(function () {
  $w(HTML_ELEMENT_ID).onMessage(async (event) => {
    const data = event.data || {};

    if (data.type === 'PRIZE_INVADER_REQUEST_SCORES') {
      await sendScoresToGame();
      return;
    }

    if (data.type === 'PRIZE_INVADER_SAVE_SCORE' && Array.isArray(data.scores)) {
      const latest = data.scores
        .filter(row => row && (row.name || row.title) && Number.isFinite(Number(row.score)))
        .sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0))[0];

      if (latest) {
        const playerName = String(latest.name || latest.title || 'PLAYER')
          .trim()
          .slice(0, 14) || 'PLAYER';

        await wixData.insert(COLLECTION, {
          // Wix's primary field is usually displayed as "name" but its field ID is "title".
          title: playerName,
          score: Number(latest.score),
          level: Number(latest.level || 0),
          when: latest.when ? new Date(latest.when) : new Date()
        });

        await sendScoresToGame();
      }
    }
  });
});

async function sendScoresToGame() {
  const result = await wixData.query(COLLECTION)
    .descending('score')
    .limit(10)
    .find();

  const scores = result.items.map(item => ({
    name: item.title || item.name || 'PLAYER',
    score: Number(item.score || 0),
    level: Number(item.level || 0),
    when: item.when || item._createdDate
  }));

  $w(HTML_ELEMENT_ID).postMessage({
    type: 'PRIZE_INVADER_SCORES',
    scores
  });
}
