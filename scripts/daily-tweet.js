const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('API Key exists:', !!process.env.TWITTER_API_KEY);
  console.log('API Secret exists:', !!process.env.TWITTER_API_SECRET);
  console.log('Access Token exists:', !!process.env.TWITTER_ACCESS_TOKEN);
  console.log('Access Secret exists:', !!process.env.TWITTER_ACCESS_SECRET);

  // --- 1. Load quotes and find today's ---
  const quotes = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'quotes.json'), 'utf8')
  );

  const startDate = new Date('2026-01-01T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayIndex = Math.floor((today - startDate) / 86400000) % quotes.length;
  const q = quotes[dayIndex];

  console.log(`Today's quote (#${dayIndex}): "${q.q.substring(0, 50)}..." — ${q.a}`);

  // --- 2. Text-only tweet to test auth ---
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  const dateStr = today.toISOString().split('T')[0];
  let tweetQuote = q.q;
  const link = `\n\naxitome.com/#${dateStr}`;
  const maxQuoteLen = 280 - q.a.length - link.length - 6;

  if (tweetQuote.length > maxQuoteLen) {
    tweetQuote = tweetQuote.substring(0, maxQuoteLen - 3) + '...';
  }

  const tweetText = `\u201C${tweetQuote}\u201D\n\u2014 ${q.a}${link}`;

  await client.v2.tweet(tweetText);
  console.log('Tweet posted!');
  console.log(tweetText);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
