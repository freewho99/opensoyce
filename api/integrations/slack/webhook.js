import crypto from 'node:crypto';
import { getSupabase } from '../../_supabase.js';

// Vercel serverless configuration: disable automatic body parser so we can read the raw stream for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  if (req.rawBody) return req.rawBody;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function verifySlackSignature(req, rawBody, secret) {
  if (!secret) return false;
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  if (!signature || !timestamp) return false;

  // Replay attack protection: reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(sigBase).digest('hex');
  const expected = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

function err(res, status, code, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: code, message }));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return err(res, 405, 'METHOD_NOT_ALLOWED', 'only POST method is supported');
    }

    const rawBody = await readRawBody(req);
    const secret = process.env.SLACK_SIGNING_SECRET;

    // Signature verification check
    if (secret) {
      if (!verifySlackSignature(req, rawBody, secret)) {
        return err(res, 401, 'UNAUTHORIZED', 'invalid slack signature');
      }
    } else {
      console.warn('Slack webhook: SLACK_SIGNING_SECRET is not set. Signature check skipped.');
    }

    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get('payload');
    if (!payloadStr) {
      return err(res, 400, 'BAD_REQUEST', 'missing payload parameter');
    }

    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return err(res, 400, 'BAD_REQUEST', 'payload is not valid JSON');
    }

    if (!payload.actions || !Array.isArray(payload.actions) || payload.actions.length === 0) {
      return err(res, 400, 'BAD_REQUEST', 'missing actions in payload');
    }

    const action = payload.actions[0];
    const exceptionId = action.value;
    const actionId = action.action_id; // 'approve' or 'deny'
    const slackUser = payload.user ? (payload.user.name || payload.user.username) : 'slack-user';

    if (!exceptionId || (actionId !== 'approve' && actionId !== 'deny')) {
      return err(res, 400, 'BAD_REQUEST', 'invalid action configuration');
    }

    let sb;
    try {
      sb = getSupabase();
    } catch (e) {
      console.error('Slack webhook: supabase init failed', e && e.message);
      return err(res, 500, 'DB_ERROR', 'database not configured');
    }

    // First fetch the exception row to verify it exists and is still pending
    const { data: row, error: selErr } = await sb
      .from('exceptions')
      .select('id, package_name, owner, repo, status')
      .eq('id', exceptionId)
      .maybeSingle();

    if (selErr) {
      console.error('Slack webhook: select failed', selErr.message);
      return err(res, 500, 'DB_ERROR', 'database query failed');
    }
    if (!row) {
      return err(res, 404, 'NOT_FOUND', 'exception not found');
    }
    if (row.status !== 'pending') {
      return err(res, 400, 'BAD_REQUEST', `exception is already in status: ${row.status}`);
    }

    const nowStr = new Date().toISOString();
    let updatedStatus = 'pending';

    if (actionId === 'approve') {
      updatedStatus = 'approved';
      const { error: upErr } = await sb
        .from('exceptions')
        .update({
          status: 'approved',
          granted_by: `slack:${slackUser}`,
        })
        .eq('id', exceptionId);

      if (upErr) {
        console.error('Slack webhook: approve update failed', upErr.message);
        return err(res, 500, 'DB_ERROR', 'database write failed');
      }
    } else {
      updatedStatus = 'denied';
      const { error: upErr } = await sb
        .from('exceptions')
        .update({
          status: 'denied',
          revoked_at: nowStr,
          revoked_by: `slack:${slackUser}`,
        })
        .eq('id', exceptionId);

      if (upErr) {
        console.error('Slack webhook: deny update failed', upErr.message);
        return err(res, 500, 'DB_ERROR', 'database write failed');
      }
    }

    // Respond back to Slack's response_url to update the message in-place
    if (payload.response_url) {
      const decisionText = actionId === 'approve'
        ? `✅ Exception for package *${row.package_name}* has been *approved* by @${slackUser}.`
        : `❌ Exception for package *${row.package_name}* has been *denied* by @${slackUser}.`;

      try {
        await fetch(payload.response_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replace_original: true,
            text: decisionText,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: decisionText
                }
              }
            ]
          }),
        });
      } catch (slackErr) {
        console.error('Slack webhook: failed to update message via response_url', slackErr && slackErr.message);
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, status: updatedStatus }));
  } catch (errVal) {
    console.error('Slack webhook: unhandled error', errVal && errVal.stack ? errVal.stack : errVal);
    if (!res.headersSent) {
      return err(res, 500, 'INTERNAL_ERROR', 'unexpected server error');
    }
  }
}
