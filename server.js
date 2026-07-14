require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/', (req, res) => {
  res.json({ status: 'VIEW Tech API running' });
});

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

app.get('/api/report', async (req, res) => {
  const { cliente, desde, hasta } = req.query;
  if (!cliente || !desde || !hasta) {
    return res.status(400).json({ error: 'cliente, desde y hasta requeridos' });
  }
  const global = await pool.query(`
    SELECT SUM(inversion) as inversion, SUM(conversaciones) as conv,
           ROUND(SUM(inversion)/NULLIF(SUM(conversaciones),0),0) as cpr
    FROM ad_insights WHERE cliente=$1 AND fecha BETWEEN $2 AND $3
  `, [cliente, desde, hasta]);

  const porAnuncio = await pool.query(`
    SELECT ad_name, SUM(inversion) as inversion, SUM(conversaciones) as conv,
           ROUND(SUM(inversion)/NULLIF(SUM(conversaciones),0),0) as cpr
    FROM ad_insights WHERE cliente=$1 AND fecha BETWEEN $2 AND $3
    GROUP BY ad_name ORDER BY cpr ASC
  `, [cliente, desde, hasta]);

  const porDia = await pool.query(`
    SELECT fecha, SUM(inversion) as inversion, SUM(conversaciones) as conv,
           ROUND(SUM(inversion)/NULLIF(SUM(conversaciones),0),0) as cpr
    FROM ad_insights WHERE cliente=$1 AND fecha BETWEEN $2 AND $3
    GROUP BY fecha ORDER BY fecha ASC
  `, [cliente, desde, hasta]);

  const demografico = await pool.query(`
    SELECT edad, sexo, SUM(inversion) as inversion, SUM(conversaciones) as conv,
           ROUND(SUM(inversion)/NULLIF(SUM(conversaciones),0),0) as cpr
    FROM ad_insights WHERE cliente=$1 AND fecha BETWEEN $2 AND $3
      AND sexo IN ('male','female')
    GROUP BY edad, sexo ORDER BY edad, sexo
  `, [cliente, desde, hasta]);

  res.json({
    global: global.rows[0],
    porAnuncio: porAnuncio.rows,
    porDia: porDia.rows,
    demografico: demografico.rows
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VIEW Tech API en puerto ${PORT}`));
