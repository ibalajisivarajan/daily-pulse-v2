export default {
  async fetch(request, env) {

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Call GitHub Actions dispatch
    const response = await fetch(
      'https://api.github.com/repos/ibalajisivarajan/daily-pulse-v2/actions/workflows/fetch-stories.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DailyPulse/2.0',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    );

    return new Response(
      JSON.stringify({
        ok: response.ok,
        status: response.status
      }),
      {
        status: response.ok ? 200 : response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}
