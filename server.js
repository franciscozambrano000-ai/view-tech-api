require('dotenv').config();
const express = require('express');
const { neon } = require('@neondatabase/serverless');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const sql = neon(process.env.DATABASE_URL);

app.get('/', (req, res) => {
  res.json({ status: 'VIEW Tech API running' });
});

app.post('/api/ingest', async (req, res) => {
  const body = req.body;
  const rows = Array.isArray(body.data) ? body.data : [body];
  let inserted = 0;
  for (const row of rows) {
    try {
      await sql`
        INSERT INTO ad_insights 
          (cliente, account_id, campaign_name, adset_name, ad_id,
           ad_name, fecha, edad, sexo, inversion, conversaciones, impresiones)
        VALUES (
          ${row.cliente || 'luxury-sleep'},
          ${row.account_id || '877777073436113'},
          ${row.campaign_name}, ${row.adset_name}, ${row.ad_id},
          ${row.ad_name}, ${row.date_start}, ${row.age}, ${row.gender},
          ${parseFloat(row.spend) || 0}, 0,
          ${parseInt(row.impressions) || 0}
        )
        ON CONFLICT (cliente, ad_id, fecha, edad, sexo)
        DO UPDATE SET
          inversion = EXCLUDED.inversion,
          impresiones = EXCLUDED.impresiones,
          insertado_en = NOW()
      `;
      inserted++;
    } catch (e) {
      console.error('Error fila:', e.message);
    }
  }
  res.json({ ok: true, inserted });
});

app.get('/api/report', async (req, res) => {
  const { cliente, desde, hasta } = req.query;
  if (!cliente || !desde || !hasta) {
    return res.status(400).json({ error: 'cliente, desde y hasta requeridos' });
  }
  try {
    const global = await sql`
      SELECT SUM(inversion) as inversion, SUM(conversaciones) as conv,
             ROUND(SUM(inversion)/NULLIF(SUM(conversaciones),0),0) as cpr
      FROM ad_insights WHERE cliente=${cliente} AND fecha BETWEEN ${desde} AND ${hasta}`;

    const porAnuncio = await sql`
      SELECT ad_name, SUM(inversion) as inversion, SUM(conversaciones) as conv,
             ROUND(SUM(inversion)/NULLIF(SUM(conversaciones),0),0) as cpr
      FROM ad_insights WHERE cliente=${cliente} AND fecha BETWEEN ${desde} AND ${hasta}
      GROUP BY ad_name ORDER BY cpr ASC`;

    const porDia = await sql`
      SELECT fecha, SUM(inversion) as inversion,
             ROUND(SUM(inversion)/NULLIF(SUM(conversaciones),0),0) as cpr
      FROM ad_insights WHERE cliente=${cliente} AND fecha BETWEEN ${desde} AND ${hasta}
      GROUP BY fecha ORDER BY fecha ASC`;

    const demografico = await sql`
      SELECT edad, sexo, SUM(inversion) as inversion, SUM(conversaciones) as conv,
             ROUND(SUM(inversion)/NULLIF(SUM(conversaciones),0),0) as cpr
      FROM ad_insights WHERE cliente=${cliente} AND fecha BETWEEN ${desde} AND ${hasta}
        AND sexo IN ('male','female')
      GROUP BY edad, sexo ORDER BY edad, sexo`;

    res.json({ global: global[0], porAnuncio, porDia, demografico });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VIEW Tech API en puerto ${PORT}`));
