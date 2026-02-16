const { createCanvas } = require('@napi-rs/canvas');
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

async function main() {
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

  // --- 2. Generate 1080x1080 quote card (matches site's genCard()) ---
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
  ctx.font = 'italic 140px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('\u201C', W / 2, 240);

  // Quote text
  ctx.fillStyle = '#f0ebe3';
  const fontSize = q.q.length > 300 ? 32 : q.q.length > 150 ? 38 : 44;
  ctx.font = `italic ${fontSize}px Georgia, serif`;

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
  ctx.font = 'italic 140px Georgia, serif';
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
  ctx.font = '300 22px sans-serif';
  ctx.fillText(q.a.toUpperCase(), W / 2, ruleY + 45);

  // Tags
  if (q.t && q.t.length) {
    ctx.fillStyle = 'rgba(200,168,110,0.25)';
    ctx.font = '200 16px sans-serif';
    ctx.fillText(q.t.map(t => '#' + t).join('  '), W / 2, ruleY + 80);
  }

  // AXITOME watermark
  ctx.fillStyle = 'rgba(240,235,227,0.12)';
  ctx.font = '200 14px sans-serif';
  ctx.fillText('AXITOME', W / 2, H - 50);

  // Save image
  const imagePath = '/tmp/quote-card.png';
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(imagePath, buffer);
  console.log('Quote card generated');

  // --- 3. Post to Twitter ---
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  // Upload image
  const mediaId = await client.v1.uploadMedia(imagePath);
  console.log('Image uploaded, mediaId:', mediaId);

  // Build tweet text
  const dateStr = today.toISOString().split('T')[0];
  let tweetQuote = q.q;
  const link = `\n\naxitome.com/#${dateStr}`;
  const maxQuoteLen = 280 - q.a.length - link.length - 6;

  if (tweetQuote.length > maxQuoteLen) {
    tweetQuote = tweetQuote.substring(0, maxQuoteLen - 3) + '...';
  }

  const tweetText = `\u201C${tweetQuote}\u201D\n\u2014 ${q.a}${link}`;

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
