export default {
  async fetch(request, env) {

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const CORS  = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
    const REPO  = 'ibalajisivarajan/daily-pulse-v2';
    const TOKEN = env.GITHUB_TOKEN;
    const GH_HEADERS = {
      'Authorization': `token ${TOKEN}`,
      'Content-Type':  'application/json',
      'User-Agent':    'DailyPulse/2.0',
      'Accept':        'application/vnd.github.v3+json',
    };

    try {
      // Parse body — detect Case A (preferences present) vs Case B (dispatch only)
      let preferences = null;
      try {
        const body = await request.json();
        if (body && body.preferences && typeof body.preferences === 'object') {
          preferences = body.preferences;
        }
      } catch { /* empty body or non-JSON → Case B */ }

      // Case A — write preferences.json to repo then dispatch
      if (preferences) {
        // GET current file SHA (required for update; omitted on first create)
        const getRes = await fetch(
          `https://api.github.com/repos/${REPO}/contents/data/preferences.json`,
          { headers: GH_HEADERS }
        );

        const putBody = {
          message: 'chore: update preferences',
          content: btoa(JSON.stringify(preferences, null, 2)),
        };
        if (getRes.ok) {
          const current = await getRes.json();
          putBody.sha = current.sha;
        }

        // PUT updated file
        const putRes = await fetch(
          `https://api.github.com/repos/${REPO}/contents/data/preferences.json`,
          { method: 'PUT', headers: GH_HEADERS, body: JSON.stringify(putBody) }
        );

        if (!putRes.ok) {
          const msg = await putRes.text();
          throw new Error(`File write failed: ${putRes.status} — ${msg}`);
        }
      }

      // Both cases — trigger GitHub Actions dispatch
      const dispatchRes = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/fetch-stories.yml/dispatches`,
        {
          method:  'POST',
          headers: GH_HEADERS,
          body:    JSON.stringify({ ref: 'main' }),
        }
      );

      if (!dispatchRes.ok && dispatchRes.status !== 204) {
        throw new Error(`Dispatch failed: ${dispatchRes.status}`);
      }

      return new Response(
        JSON.stringify({
          ok:     true,
          action: preferences
            ? 'preferences_saved_and_dispatch_triggered'
            : 'dispatch_triggered',
        }),
        { status: 200, headers: CORS }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: err.message }),
        { status: 500, headers: CORS }
      );
    }
  }
}
