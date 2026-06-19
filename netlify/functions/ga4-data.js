const { BetaAnalyticsDataClient } = require('@google-analytics/data');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const serviceAccountKey = JSON.parse(process.env.GA4_SERVICE_ACCOUNT_KEY);
    const propertyId = process.env.GA4_PROPERTY_ID;
    const analyticsDataClient = new BetaAnalyticsDataClient({ credentials: serviceAccountKey });

    const params = event.queryStringParameters || {};
    const type = params.type || 'overview';
    const landingPage = params.landingPage || null;
    const medium = params.medium || null; // 'cpc' = 有料, 'organic' = オーガニック, null = 全体

    // 共通フィルター構築
    const buildFilters = () => {
      const filters = [];
      if (landingPage) {
        filters.push({
          filter: {
            fieldName: 'landingPage',
            stringFilter: { matchType: 'EXACT', value: landingPage }
          }
        });
      }
      if (medium) {
        filters.push({
          filter: {
            fieldName: 'sessionMedium',
            stringFilter: { matchType: 'EXACT', value: medium }
          }
        });
      }
      if (filters.length === 0) return undefined;
      if (filters.length === 1) return { filter: filters[0].filter };
      return { andGroup: { expressions: filters } };
    };

    const dimensionFilter = buildFilters();

    // 概要（セッション推移）
    if (type === 'overview') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
        ],
        dimensions: [{ name: 'date' }],
        ...(dimensionFilter && { dimensionFilter }),
      });
      return { statusCode: 200, headers, body: JSON.stringify(response) };
    }

    // ファネルデータ
    if (type === 'funnel') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'addToCarts' },
          { name: 'ecommercePurchases' },
          { name: 'totalUsers' },
        ],
        dimensions: [{ name: 'date' }],
        ...(dimensionFilter && { dimensionFilter }),
      });
      return { statusCode: 200, headers, body: JSON.stringify(response) };
    }

    // イベント別コンバージョン
    if (type === 'events') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'eventCount' }, { name: 'sessions' }],
        dimensions: [{ name: 'eventName' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: ['add_to_cart', 'purchase', 'member_registration', 'begin_checkout', '直販cv']
            }
          }
        },
        ...(dimensionFilter && {
          dimensionFilter: {
            andGroup: {
              expressions: [
                {
                  filter: {
                    fieldName: 'eventName',
                    inListFilter: {
                      values: ['add_to_cart', 'purchase', 'member_registration', 'begin_checkout', '直販cv']
                    }
                  }
                },
                ...(dimensionFilter.filter ? [{ filter: dimensionFilter.filter }] : (dimensionFilter.andGroup?.expressions || []))
              ]
            }
          }
        }),
      });
      return { statusCode: 200, headers, body: JSON.stringify(response) };
    }

    // ランディングページ一覧
    if (type === 'landing_pages') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'addToCarts' },
          { name: 'ecommercePurchases' },
          { name: 'bounceRate' },
        ],
        dimensions: [{ name: 'landingPage' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 100,
        ...(medium && {
          dimensionFilter: {
            filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: medium } }
          }
        }),
      });
      return { statusCode: 200, headers, body: JSON.stringify(response) };
    }

    // 流入元別
    if (type === 'sources') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'addToCarts' },
          { name: 'ecommercePurchases' },
          { name: 'bounceRate' },
        ],
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 20,
        ...(dimensionFilter && { dimensionFilter }),
      });
      return { statusCode: 200, headers, body: JSON.stringify(response) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid type' }) };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
