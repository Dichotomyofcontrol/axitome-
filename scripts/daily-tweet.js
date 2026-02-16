const puppeteer = require('puppeteer');
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

async function main() {
  // --- 1. Figure out today's quote index ---
  const quotes = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'quotes.json'), 'utf8')
  );

  const startDate = new Date('2025-01-01T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayIndex = Math.floor((today - startDate) / 86400000) % quotes.length;
  const quote = quotes[dayIndex];

  console.log(`Today's quote (#${dayIndex}): "${quote.q.substring(0, 50)}..." — ${quote.a}`);

  // --- 2. Screenshot the quote card ---
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set viewport to a nice card size
  await page.setViewport({ width: 1200, height: 675 });

  // Build the date string for the URL
  const dateStr = today.toISOString().split('T')[0]; // 2026-02-15
  await page.goto(`https://www.axitome.com/#${dateStr}`, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // Wait for quote to render
  await page.waitForSelector('.quote-text', { timeout: 10000 });

  // Give fonts a moment to load
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot just the quote area
  const screenshotPath = '/tmp/quote-card.png';
  await page.screenshot({ path: screenshotPath, type: 'png' });
  await browser.close();

  console.log('Screenshot saved');

  // --- 3. Post to Twitter ---
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  // Upload the image
  const mediaId = await client.v1.uploadMedia(screenshotPath);

  // Compose tweet text
  // Trim quote if too long for tweet (280 char limit minus link and author)
  let tweetQuote = quote.q;
  const author = quote.a;
  const link = `\n\naxitome.com/#${dateStr}`;
  const maxQuoteLen = 280 - author.length - link.length - 6; // 6 for quotes and dash

  if (tweetQuote.length > maxQuoteLen) {
    tweetQuote = tweetQuote.substring(0, maxQuoteLen - 3) + '...';
  }

  const tweetText = `"${tweetQuote}"\n— ${author}${link}`;

  // Post tweet with image
  await client.v2.tweet({
    text: tweetText,
    media: { media_ids: [mediaId] }
  });

  console.log('Tweet posted successfully!');
  console.log(tweetText);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
