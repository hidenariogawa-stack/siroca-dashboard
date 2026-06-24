export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.status(500).json({ error: 'Failed to get access token', detail: tokenData });
    }

    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    // デバッグ用：環境変数の確認
    return res.status(200).json({
      accessToken: accessToken ? 'OK' : 'MISSING',
      customerId: customerId || 'MISSING',
      developerToken: developerToken ? 'OK' : 'MISSING',
      url: `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:search`,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
