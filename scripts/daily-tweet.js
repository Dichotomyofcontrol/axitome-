const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');
const https = require('https');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    };
    follow(url);
  });
}

async function main() {
  const fontDir = '/tmp/fonts';
  if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir);

  // Download TWO variants of Playfair - italic for quote, regular for author
  await download(
    'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtbK-F2rA0s.ttf',
    path.join(fontDir, 'Playfair-Italic.ttf')
  );
  await download(
    'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd3vXDXbtXK-F2qC0s.ttf',
    path.join(fontDir, 'Playfair-Regular.ttf')
  );

  GlobalFonts.registerFromPath(path.join(fontDir, 'Playfair-Italic.ttf'), 'PlayfairItalic');
  GlobalFonts.registerFromPath(path.join(fontDir, 'Playfair-Regular.ttf'), 'PlayfairRegular');

  // Verify fonts loaded
  const families = GlobalFonts.families.map(f => f.family);
  console.log('Fonts:', families.join(', '));
  if (!families.includes('PlayfairItalic') || !families.includes('PlayfairRegular')) {
    throw new Error('Font registration failed');
  }

  // Load quotes, Pacific time
  const quotes = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'quotes.json'), 'utf8')
  );
  const nowUTC = new Date();
  const pacific = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pacific.setHours(0, 0, 0, 0);
  const epoch = new Date(2026, 0, 1);
  const dayIndex = Math.floor((pacific - epoch) / 86400000);
  const idx = dayIndex % quotes.length;
  const q = quotes[idx];

  console.log(`Pacific: ${pacific.toISOString().split('T')[0]}, idx: ${idx}`);
  console.log(`Quote: "${q.q.substring(0, 60)}..."`);
  console.log(`Author: ${q.a}`);

  // --- Canvas ---
  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111010';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top'; // Critical: all measurements from top, not baseline

  // Word wrap
  const fontSize = q.q.length > 300 ? 32 : q.q.length > 150 ? 38 : 44;
  ctx.font = `${fontSize}px PlayfairItalic`;
  const maxWidth = W - 180;
  const words = q.q.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  // Define all vertical measurements
  const openQuoteH = 90;
  const gapOpenToText = 35;
  const lineH = Math.round(fontSize * 1.7);
  const textBlockH = lines.length * lineH;
  const gapTextToClose = 20;
  const closeQuoteH = 90;
  const gapCloseToRule = 45;
  const ruleH = 1;
  const gapRuleToAuthor = 35;
  const authorH = 24;

  const totalH = openQuoteH + gapOpenToText + textBlockH + gapTextToClose
    + closeQuoteH + gapCloseToRule + ruleH + gapRuleToAuthor + authorH;

  let y = Math.round((H - totalH) / 2);

  // --- Draw ---

  // Open quote mark
  ctx.font = '100px PlayfairItalic';
  ctx.fillStyle = 'rgba(200,168,110,0.4)';
  ctx.fillText('\u201C', W / 2, y);
  y += openQuoteH + gapOpenToText;

  // Quote lines
  ctx.font = `${fontSize}px PlayfairItalic`;
  ctx.fillStyle = '#f0ebe3';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, y + i * lineH);
  }
  y += textBlockH + gapTextToClose;

  // Close quote mark
  ctx.font = '100px PlayfairItalic';
  ctx.fillStyle = 'rgba(200,168,110,0.4)';
  ctx.fillText('\u201D', W / 2, y);
  y += closeQuoteH + gapCloseToRule;

  // Rule
  ctx.strokeStyle = 'rgba(200,168,110,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, y);
  ctx.lineTo(W / 2 + 30, y);
  ctx.stroke();
  y += ruleH + gapRuleToAuthor;

  // Author
  ctx.font = '20px PlayfairRegular';
  ctx.fillStyle = 'rgba(240,235,227,0.7)';
  const authorText = q.a.toUpperCase();
  ctx.fillText(authorText, W / 2, y);
  console.log(`Drew author "${authorText}" at y=${y}`);

  // Watermark pinned to bottom
  ctx.font = '13px PlayfairRegular';
  ctx.fillStyle = 'rgba(240,235,227,0.12)';
  ctx.fillText('AXITOME', W / 2, H - 60);

  // Save
  const imagePath = '/tmp/quote-card.png';
  fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));
  console.log('Card saved');

  // --- Tweet ---
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  const mediaId = await client.v1.uploadMedia(imagePath);

  let tweetQuote = q.q;
  const suffix = ` \u2014 ${q.a}\n\naxitome.com`;
  const maxLen = 280 - suffix.length - 2;
  if (tweetQuote.length > maxLen) {
    tweetQuote = tweetQuote.substring(0, maxLen - 3) + '...';
  }

  const tweetText = `\u201C${tweetQuote}\u201D${suffix}`;

  await client.v2.tweet({
    text: tweetText,
    media: { media_ids: [mediaId] },
  });

  console.log('Posted!');
  console.log(tweetText);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
