// Netlify build step: pulls the latest Panoramic Nuggets videos from the public YouTube feed and writes them
// into index.html (between the LATEST markers), plus a fresh sitemap.xml. Runs on every deploy; the daily
// autopilot triggers a deploy through a build hook so the site stays current. Never fails the build: if the
// feed can't be read, the page keeps its fallback content.
import fs from 'node:fs';

const CHANNEL = 'UCFK-c4Z_5CCwQ1qB_7CylhQ';
const SITE = 'https://panoramicnuggets.com';
const SHOW = 6;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unxml = s => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => (xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1] || '';

async function videos() {
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`feed ${r.status}`);
    return [...(await r.text()).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
      id: tag(e, 'yt:videoId'),
      title: unxml(tag(e, 'title')),
      published: tag(e, 'published'),
      description: unxml(tag(e, 'media:description')).split('\n')[0],
    })).filter(v => v.id);
  } catch (e) {
    console.warn('Latest nuggets: feed unavailable, keeping fallback content.', e.message);
    return null;
  }
}

const list = await videos();
let html = fs.readFileSync('index.html', 'utf8');
const today = new Date().toISOString().slice(0, 10);

if (list && list.length) {
  const shown = list.slice(0, SHOW);
  const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const cards = shown.map(v => `
          <a class="nugget" href="https://www.youtube.com/shorts/${esc(v.id)}" target="_blank" rel="noopener">
            <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="${esc(v.title)}" width="480" height="360" loading="lazy">
            <span class="nugget-date">${esc(fmt(v.published))}</span>
            <h3>${esc(v.title)}</h3>
          </a>`).join('');
  const ld = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Latest Panoramic Nuggets videos',
    itemListElement: shown.map((v, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: { '@type': 'VideoObject', name: v.title, description: v.description || v.title, uploadDate: v.published,
        thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, contentUrl: `https://www.youtube.com/shorts/${v.id}`, embedUrl: `https://www.youtube.com/embed/${v.id}` },
    })),
  };
  const block = `<!--LATEST:START-->
        <div class="nuggets">${cards}
        </div>
        <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
        <!--LATEST:END-->`;
  html = html.replace(/<!--LATEST:START-->[\s\S]*?<!--LATEST:END-->/, block);
  console.log(`Latest nuggets: ${shown.length} videos, newest "${shown[0].title}"`);
}
fs.writeFileSync('index.html', html);

const pages = [['/', '1.0', 'daily'], ['/privacy.html', '0.3', 'yearly'], ['/terms.html', '0.3', 'yearly'], ['/data-deletion.html', '0.2', 'yearly']];
fs.writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(([p, pr, f]) => `  <url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`);
