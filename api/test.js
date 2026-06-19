export default function handler(req, res) {
  const key = process.env.GA4_SERVICE_ACCOUNT_KEY || 'NOT SET';
  res.status(200).json({ 
    length: key.length,
    first50: key.substring(0, 50),
    last50: key.substring(key.length - 50)
  });
}
