export default async function handler(req, res) {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    redirect_uri: 'https://siroca-dashboard.vercel.app/api/google-ads-auth',
    grant_type: 'authorization_code',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await response.json();
  
  return res.status(200).json(data);
}
