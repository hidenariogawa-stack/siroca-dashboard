import { BetaAnalyticsDataClient } from '@google-analytics/data';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const privateKey = (process.env.GA4_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const clientEmail = process.env.GA4_CLIENT_EMAIL;
    const propertyId = process.env.GA4_PROPERTY_ID;

    const analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      }
    });

    const params = req.query || {};
    const type = params.type || 'overview';
    const landingPage = params.landingPage || null;
    const medium = params.medium || null;

    const buildFilters = () => {
      const filters = [];
      if (landingPage) {
        filters.push({ filter: { fieldName: 'landingPage', stringFilter: { matchType: 'EXACT', value: landingPage } } });
      }
      if (medium === 'paid_all') {
        filters.push({ filter: { fieldName: 'sessionMedium', inListFilter: { values: ['cpc', 'paidsocial', 'paid'] } } });
      } else if (medium) {
        filters.push({ filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: medium } } });
      }
      if (filters.length === 0) return undefined;
      if (filters.length === 1) return { filter: filters[0].filter };
      return { andGroup: { expressions: filters } };
    };

    const dimensionFilter = buildFilters();

    if (type === 'overview') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'bounceRate' }],
        dimensions: [{ name: 'date' }],
        ...(dimensionFilter && { dimensionFilter }),
      });
      return res.status(200).json(response);
    }

    if (type === 'funnel') {
      const [overviewRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'addToCarts' }],
        dimensions: [{ name: 'date' }],
        ...(dimensionFilter && { dimensionFilter }),
      });

      const purchaseEventFilter = { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: '直販cv' } } };
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

      let sessions = 0, carts = 0, purchases = 0;
      (overviewRes.rows || []).forEach(row => {
        sessions += parseInt(row.metricValues[0].value) || 0;
        carts += parseInt(row.metricValues[1].value) || 0;
      });
      (purchaseRes.rows || []).forEach(row => { purchases += parseInt(row.metricValues[0].value) || 0; });

      return res.status(200).json({ rows: [{ metricValues: [{ value: String(sessions) }, { value: String(carts) }, { value: String(purchases) }] }] });
    }

    if (type === 'events') {
      const eventFilter = { filter: { fieldName: 'eventName', inListFilter: { values: ['add_to_cart', 'purchase', 'member_registration', 'begin_checkout', '直販cv'] } } };
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'eventCount' }, { name: 'sessions' }],
        dimensions: [{ name: 'eventName' }],
        dimensionFilter: dimensionFilter
          ? { andGroup: { expressions: [eventFilter, ...(dimensionFilter.andGroup?.expressions || [{ filter: dimensionFilter.filter }])] } }
          : eventFilter,
      });
      return res.status(200).json(response);
    }

    if (type === 'landing_pages') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'addToCarts' }, { name: 'ecommercePurchases' }, { name: 'bounceRate' }],
        dimensions: [{ name: 'landingPage' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 100,
        ...(dimensionFilter && { dimensionFilter }),
      });
      return res.status(200).json(response);
    }

    if (type === 'sources') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'addToCarts' }, { name: 'ecommercePurchases' }, { name: 'bounceRate' }],
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 20,
        ...(dimensionFilter && { dimensionFilter }),
      });
      return res.status(200).json(response);
    }

    if (type === 'devices') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'addToCarts' }, { name: 'totalUsers' }, { name: 'bounceRate' }],
        dimensions: [{ name: 'deviceCategory' }],
        ...(dimensionFilter && { dimensionFilter }),
      });

      const cvFilter = { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: '直販cv' } } };
      const combinedCvFilter = dimensionFilter
        ? { andGroup: { expressions: [cvFilter, ...(dimensionFilter.andGroup?.expressions || [{ filter: dimensionFilter.filter }])] } }
        : cvFilter;

      const [cvRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [{ name: 'deviceCategory' }],
        dimensionFilter: combinedCvFilter,
      });

      const cvMap = {};
      (cvRes.rows || []).forEach(r => { cvMap[r.dimensionValues[0].value] = parseInt(r.metricValues[0].value) || 0; });
      return res.status(200).json({ rows: response.rows || [], cvMap });
    }

    if (type === 'hourly') {
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'addToCarts' }],
        dimensions: [{ name: 'hour' }],
        orderBys: [{ dimension: { dimensionName: 'hour' } }],
        ...(dimensionFilter && { dimensionFilter }),
      });
      return res.status(200).json(response);
    }

    if (type === 'behavior') {
      const [userTypeRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        dimensions: [{ name: 'newVsReturning' }],
        ...(dimensionFilter && { dimensionFilter }),
      });

      const searchFilter = { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'search' } } };
      const combinedSearchFilter = dimensionFilter
        ? { andGroup: { expressions: [searchFilter, ...(dimensionFilter.andGroup?.expressions || [{ filter: dimensionFilter.filter }])] } }
        : searchFilter;

      const [searchRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'eventCount' }],
        dimensions: [{ name: 'customEvent:search_term' }],
        dimensionFilter: combinedSearchFilter,
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        limit: 20,
      });

      const [scrollRes] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: params.startDate || '30daysAgo', endDate: params.endDate || 'today' }],
        metrics: [{ name: 'sessions' }, { name: 'scrolledUsers' }],
        dimensions: [{ name: 'date' }],
        ...(dimensionFilter && { dimensionFilter }),
      });

      let totalSessions = 0, totalScrolled = 0;
      (scrollRes.rows || []).forEach(r => {
        totalSessions += parseInt(r.metricValues[0].value) || 0;
        totalScrolled += parseInt(r.metricValues[1].value) || 0;
      });

      return res.status(200).json({
        userType: userTypeRes.rows || [],
        searchTerms: searchRes.rows || [],
        scrollRate: totalSessions ? (totalScrolled / totalSessions * 100).toFixed(1) : 0,
        totalSessions,
        totalScrolled,
      });
    }

    return res.status(400).json({ error: 'Invalid type' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
