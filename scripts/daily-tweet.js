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

  // Playfair Display Regular Italic
  await download(
    'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFRD-vYSZviVYUb_rj3ij__anPXDTnCjmHKM4nYO7KN_qiTbtbK-F2rA0s.ttf',
    path.join(fontDir, 'PlayfairDisplay-Italic.ttf')
  );
  // DM Sans Regular
  await download(
    'https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriCZOIHTWEBlwu8Q.ttf',
    path.join(fontDir, 'DMSans-Regular.ttf')
  );
  // DM Sans Light
  await download(
    'https://fonts.gstatic.com/s/dmsans/v15/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAop-hSA.ttf',
    path.join(fontDir, 'DMSans-Light.ttf')
  );

  GlobalFonts.registerFromPath(path.join(fontDir, 'PlayfairDisplay-Italic.ttf'), 'Playfair');
  GlobalFonts.registerFromPath(path.join(fontDir, 'DMSans-Regular.ttf'), 'DMSans');
  GlobalFonts.registerFromPath(path.join(fontDir, 'DMSans-Light.ttf'), 'DMSansLight');

  const registered = GlobalFonts.families;
  console.log('Registered fonts:', registered.map(f => f.family).join(', '));

  // --- 2. Load quotes, use PACIFIC time for today ---
  const quotes = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'quotes.json'), 'utf8')
  );

  // Get today in Pacific time (GitHub Actions runs UTC)
  const nowUTC = new Date();
  const pacific = new Date(nowUTC.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pacific.setHours(0, 0, 0, 0);

  const epoch = new Date(2026, 0, 1); // Jan 1 2026
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

  // Background gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#161413');
  g.addColorStop(0.5, '#111010');
  g.addColorStop(1, '#0d0c0b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Radial glow
  const rg = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, W * 0.5);
  rg.addColorStop(0, 'rgba(200,168,110,0.06)');
  rg.addColorStop(1, 'transparent');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  // Opening quote mark
  ctx.fillStyle = 'rgba(200,168,110,0.35)';
  ctx.font = 'italic 140px Playfair';
  ctx.textAlign = 'center';
  ctx.fillText('\u201C', W / 2, 240);

  // Quote text - word wrap
  ctx.fillStyle = '#f0ebe3';
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
  const textHeight = lines.length * lineHeight;
  const startY = (H - textHeight) / 2 + 40;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, startY + i * lineHeight);
  }

  // Closing quote mark
  ctx.fillStyle = 'rgba(200,168,110,0.35)';
  ctx.font = 'italic 140px Playfair';
  ctx.fillText('\u201D', W / 2, startY + lines.length * lineHeight + 60);

  // Rule line
  const ruleY = startY + lines.length * lineHeight + 110;
  ctx.strokeStyle = 'rgba(200,168,110,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, ruleY);
  ctx.lineTo(W / 2 + 30, ruleY);
  ctx.stroke();

  // Author
  ctx.fillStyle = 'rgba(240,235,227,0.5)';
  ctx.font = '22px DMSans';
  ctx.fillText(q.a.toUpperCase(), W / 2, ruleY + 45);

  // Tags
  if (q.t && q.t.length) {
    ctx.fillStyle = 'rgba(200,168,110,0.25)';
    ctx.font = '16px DMSansLight';
    ctx.fillText(q.t.map(t => '#' + t).join('  '), W / 2, ruleY + 80);
  }

  // AXITOME watermark
  ctx.fillStyle = 'rgba(240,235,227,0.12)';
  ctx.font = '14px DMSansLight';
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

  // Clean tweet: quote + author on same flow, simple link
  let tweetQuote = q.q;
  const suffix = ` \u2014 ${q.a}\n\naxitome.com`;
  const maxLen = 280 - suffix.length - 2; // 2 for curly quotes

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
