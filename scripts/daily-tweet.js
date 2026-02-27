const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

async function main() {
  const families = GlobalFonts.families.map(f => f.family);
  console.log('Available fonts:', families.join(', '));

  const SERIF = 'Liberation Serif';
  const SANS = 'Liberation Sans';

  if (!families.includes(SERIF)) throw new Error(`Missing ${SERIF}`);
  if (!families.includes(SANS)) throw new Error(`Missing ${SANS}`);

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
  console.log(`Author: "${q.a}"`);

  // --- Canvas ---
  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111010';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Word wrap the quote
  const fontSize = q.q.length > 300 ? 30 : q.q.length > 150 ? 36 : 42;
  ctx.font = `italic ${fontSize}px "${SERIF}"`;
  const maxWidth = W - 200;
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

  // Layout measurements
  const lineH = Math.round(fontSize * 1.75);
  const textBlockH = lines.length * lineH;

  const openH = 80;
  const gapOpen = 30;
  const gapClose = 15;
  const closeH = 80;
  const gapRule = 40;
  const gapAuthor = 30;
  const authorH = 20;

  const totalH = openH + gapOpen + textBlockH + gapClose + closeH + gapRule + 1 + gapAuthor + authorH;
  let y = Math.round((H - totalH) / 2);

  // Open quote mark
  ctx.font = `italic 90px "${SERIF}"`;
  ctx.fillStyle = '#c8a86e';
  ctx.fillText('\u201C', W / 2, y);
  y += openH + gapOpen;

  // Quote text
  ctx.font = `italic ${fontSize}px "${SERIF}"`;
  ctx.fillStyle = '#f0ebe3';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, y + i * lineH);
  }
  y += textBlockH + gapClose;

  // Close quote mark
  ctx.font = `italic 90px "${SERIF}"`;
  ctx.fillStyle = '#c8a86e';
  ctx.fillText('\u201D', W / 2, y);
  y += closeH + gapRule;

  // Rule line
  ctx.strokeStyle = '#c8a86e';
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, y);
  ctx.lineTo(W / 2 + 30, y);
  ctx.stroke();
  ctx.globalAlpha = 1.0;
  y += 1 + gapAuthor;

  // Author - sans-serif, larger, crisp
  ctx.font = `18px "${SANS}"`;
  ctx.fillStyle = '#b0a898';
  ctx.fillText(q.a.toUpperCase(), W / 2, y);
  console.log(`Author "${q.a.toUpperCase()}" drawn at y=${y}`);

  // AXITOME watermark - sans-serif, larger, crisp
  ctx.font = `16px "${SANS}"`;
  ctx.fillStyle = '#3a3835';
  ctx.fillText('AXITOME', W / 2, H - 55);

  // Save
  const imagePath = '/tmp/quote-card.png';
  fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));
  console.log('Card saved, size:', fs.statSync(imagePath).size, 'bytes');

  // --- Tweet ---
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

  const mediaId = await client.v1.uploadMedia(imagePath);

  // X counts URLs as 23 chars regardless of actual length (t.co wrapping)
  const URL_TCO_LENGTH = 23;
  function xLength(text) {
    return text.replace('axitome.com', 'x'.repeat(URL_TCO_LENGTH)).length;
  }

  // Try full quote first; if too long, fall back to simple format
  const fullText = `\u201C${q.q}\u201D \u2014 ${q.a}\n\naxitome.com`;
  let tweetText;

  if (xLength(fullText) <= 280) {
    tweetText = fullText;
  } else {
    tweetText = `Today\u2019s quote by ${q.a}\n\naxitome.com`;
  }

  console.log('Tweet length (X-perceived):', xLength(tweetText));
  console.log('Tweet text:', tweetText);

  await client.v2.tweet({
    text: tweetText,
    media: { media_ids: [mediaId] },
  });

  console.log('Posted!');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
