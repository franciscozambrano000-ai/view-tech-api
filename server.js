app.post('/api/ingest', async (req, res) => {
  const body = req.body;
  const rows = Array.isArray(body.data) ? body.data : [body];

  let inserted = 0;
  for (const row of rows) {
    try {
      const conversaciones = Array.isArray(row.actions)
        ? row.actions.find(a => a.action_type?.includes('messaging'))?.value || 0
        : 0;

      await pool.query(`
        INSERT INTO ad_insights 
          (cliente, account_id, campaign_name, adset_name, ad_id,
           ad_name, fecha, edad, sexo, inversion, conversaciones, impresiones)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (cliente, ad_id, fecha, edad, sexo)
        DO UPDATE SET
          inversion = EXCLUDED.inversion,
          conversaciones = EXCLUDED.conversaciones,
          impresiones = EXCLUDED.impresiones,
          insertado_en = NOW()
      `, [
        row.cliente || 'luxury-sleep',
        row.account_id || '877777073436113',
        row.campaign_name, row.adset_name, row.ad_id,
        row.ad_name, row.date_start, row.age, row.gender,
        parseFloat(row.spend) || 0,
        parseInt(conversaciones) || 0,
        parseInt(row.impressions) || 0
      ]);
      inserted++;
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
  res.json({ ok: true, inserted });
});
