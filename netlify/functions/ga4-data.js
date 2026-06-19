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
    const medium = params.medium || null;

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
      // 有料トラフィック全体（GA4の「有料のトラフィック」セグメントと同定義）
      if (medium === 'paid_all') {
        filters.push({
          filter: {
            fieldName: 'sessionMedium',
            inListFilter: {
              values: ['cpc', 'paidsocial', 'paid']
            }
          }
        });
      } else if (medium) {
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

    // ファネルデータ（セッション・カート追加・purchase イベント数を別々に取得）
    if (type === 'funnel') {
      // セッション＆カート追加
      const [overviewRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'addToCarts' }],
        dimensions: [{ name: 'date' }],
        ...(dimensionFilter && { dimensionFilter }),
      });

      // 直販cvイベント数（eventNameフィルター + 既存フィルターをAND結合）
      const purchaseEventFilter = {
        filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: '直販cv' } }
      };
      const combinedFilter = dimensionFilter
        ? { andGroup: { expressions: [purchaseEventFilter, ...(dimensionFilter.andGroup?.expressions || [{ filter: dimensionFilter.filter }])] } }
        : purchaseEventFilter;

      const [purchaseRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [{ name: 'date' }],
        dimensionFilter: combinedFilter,
      });

      // 集計してマージ
      let sessions = 0, carts = 0, purchases = 0;
      (overviewRes.rows || []).forEach(row => {
        sessions += parseInt(row.metricValues[0].value) || 0;
        carts += parseInt(row.metricValues[1].value) || 0;
      });
      (purchaseRes.rows || []).forEach(row => {
        purchases += parseInt(row.metricValues[0].value) || 0;
      });

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ rows: [{ metricValues: [{ value: String(sessions) }, { value: String(carts) }, { value: String(purchases) }] }] })
      };
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

    // ブランドサイト→本店遷移率
    if (type === 'transition') {
      // 遷移イベント数（オンラインストアへ遷移）
      const transitionEventFilter = {
        filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'オンラインストアへ遷移' } }
      };
      const combinedFilter = dimensionFilter
        ? { andGroup: { expressions: [transitionEventFilter, ...(dimensionFilter.andGroup?.expressions || [{ filter: dimensionFilter.filter }])] } }
        : transitionEventFilter;

      // セッション数（全体）
      const [sessionRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }],
        dimensions: [{ name: 'date' }],
        ...(dimensionFilter && { dimensionFilter }),
      });

      // 遷移イベント数（日別）
      const [transitionRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [{ name: 'date' }],
        dimensionFilter: combinedFilter,
      });

      // LP別遷移数
      const [lpTransitionRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'eventCount' }, { name: 'sessions' }],
        dimensions: [{ name: 'landingPage' }],
        dimensionFilter: combinedFilter,
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 20,
      });

      // 集計
      let totalSessions = 0, totalTransitions = 0;
      (sessionRes.rows || []).forEach(r => { totalSessions += parseInt(r.metricValues[0].value) || 0; });
      (transitionRes.rows || []).forEach(r => { totalTransitions += parseInt(r.metricValues[0].value) || 0; });

      // 日別データ（グラフ用）
      const dailyMap = {};
      (sessionRes.rows || []).forEach(r => {
        const d = r.dimensionValues[0].value;
        if (!dailyMap[d]) dailyMap[d] = { sessions: 0, transitions: 0 };
        dailyMap[d].sessions += parseInt(r.metricValues[0].value) || 0;
      });
      (transitionRes.rows || []).forEach(r => {
        const d = r.dimensionValues[0].value;
        if (!dailyMap[d]) dailyMap[d] = { sessions: 0, transitions: 0 };
        dailyMap[d].transitions += parseInt(r.metricValues[0].value) || 0;
      });
      const daily = Object.entries(dailyMap).sort(([a],[b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          totalSessions,
          totalTransitions,
          transitionRate: totalSessions ? (totalTransitions / totalSessions * 100).toFixed(1) : 0,
          daily,
          lpBreakdown: lpTransitionRes.rows || [],
        })
      };
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
