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
  // --- 1. Download and register fonts ---
  const fontDir = '/tmp/fonts';
  if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir);

  console.log('Downloading fonts...');
  await download(
    'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtbK-F2rA0s.ttf',
    path.join(fontDir, 'PlayfairDisplay-Italic.ttf')
  );
  await download(
    'https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZOIHTWEBlwu8Q.ttf',
    path.join(fontDir, 'DMSans-Regular.ttf')
  );

  GlobalFonts.registerFromPath(path.join(fontDir, 'PlayfairDisplay-Italic.ttf'), 'Playfair');
  GlobalFonts.registerFromPath(path.join(fontDir, 'DMSans-Regular.ttf'), 'DMSans');
  console.log('Fonts registered');

  // --- 2. Load quotes, Pacific time ---
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

  console.log(`Pacific date: ${pacific.toISOString().split('T')[0]}`);
  console.log(`Day index: ${dayIndex}, Quote #${idx}`);
  console.log(`"${q.q.substring(0, 60)}..." — ${q.a}`);

  // --- 3. Generate 1080x1080 quote card ---
  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Flat background
  ctx.fillStyle = '#111010';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  // Word-wrap the quote first to know total height
  const fontSize = q.q.length > 300 ? 32 : q.q.length > 150 ? 38 : 44;
  ctx.font = `italic ${fontSize}px Playfair`;

  const maxWidth = W - 180;
  const words = q.q.split(' ');
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line + (line ? ' ' : '') + words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineHeight = fontSize * 1.7;

  // Calculate total block height, then center it
  const qmarkHeight = 100;     // open quote mark
  const gapAfterOpen = 40;     // space between open mark and text
  const textBlockH = lines.length * lineHeight;
  const gapBeforeClose = 30;   // space between text and close mark
  const closeMarkH = 80;       // close quote mark
  const gapBeforeRule = 50;    // space before rule line
  const ruleToAuthor = 45;     // space from rule to author

  const totalH = qmarkHeight + gapAfterOpen + textBlockH + gapBeforeClose + closeMarkH + gapBeforeRule + ruleToAuthor + 24;
  const topY = (H - totalH) / 2;

  let y = topY;

  // Opening quote mark
  ctx.fillStyle = 'rgba(200,168,110,0.4)';
  ctx.font = 'italic 140px Playfair';
  ctx.fillText('\u201C', W / 2, y + qmarkHeight);
  y += qmarkHeight + gapAfterOpen;

  // Quote lines
  ctx.fillStyle = '#f0ebe3';
  ctx.font = `italic ${fontSize}px Playfair`;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, y + (i + 1) * lineHeight);
  }
  y += textBlockH + gapBeforeClose;

  // Closing quote mark
  ctx.fillStyle = 'rgba(200,168,110,0.4)';
  ctx.font = 'italic 140px Playfair';
  ctx.fillText('\u201D', W / 2, y + closeMarkH);
  y += closeMarkH + gapBeforeRule;

  // Rule line
  ctx.strokeStyle = 'rgba(200,168,110,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, y);
  ctx.lineTo(W / 2 + 30, y);
  ctx.stroke();

  // Author
  y += ruleToAuthor;
  ctx.fillStyle = 'rgba(240,235,227,0.7)';
  ctx.font = '24px DMSans';
  ctx.fillText(q.a.toUpperCase(), W / 2, y);

  // AXITOME watermark (always at bottom)
  ctx.fillStyle = 'rgba(240,235,227,0.15)';
  ctx.font = '14px DMSans';
  ctx.fillText('AXITOME', W / 2, H - 50);

  // Save
  const imagePath = '/tmp/quote-card.png';
  fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));
  console.log('Quote card generated');

  // --- 4. Post to Twitter ---
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  const mediaId = await client.v1.uploadMedia(imagePath);
  console.log('Image uploaded');

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

  console.log('Tweet posted!');
  console.log(tweetText);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
