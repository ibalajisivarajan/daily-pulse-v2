'use strict';

const https = require('https');
const fs = require('fs');

const GIST_ID = process.env.GIST_ID;
const GIST_TOKEN = process.env.GIST_TOKEN;

if (!GIST_ID || !GIST_TOKEN) {
  console.log('No Gist credentials — using existing preferences.json');
  process.exit(0);
}

const options = {
  hostname: 'api.github.com',
  path: `/gists/${GIST_ID}`,
  headers: {
    'Authorization': `token ${GIST_TOKEN}`,
    'User-Agent': 'DailyPulse/2.0'
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const gist = JSON.parse(data);
      const content = gist.files['preferences.json']?.content;
      if (content) {
        fs.writeFileSync('data/preferences.json', content);
        console.log('Preferences pulled from Gist successfully');
      }
    } catch (e) {
      console.error('Failed to parse Gist response:', e.message);
    }
  });
}).on('error', (e) => {
  console.error('Gist fetch failed:', e.message);
});
