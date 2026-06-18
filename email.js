const store = require('./store');
const { todayStr } = require('./dateUtils');

function buildEodSummaryHtml(dateStr) {
  const date = dateStr || todayStr();
  const reps = store.all('reps');
  const closes = store.all('closes').filter((c) => c.date === date);
  const setterLogs = store.all('setterLogs').filter((s) => s.date === date);
  const products = store.all('products');

  const repName = (id) => reps.find((r) => r.id === id)?.name || 'Unknown';
  const productName = (id) => products.find((p) => p.id === id)?.name || '—';

  const totalRevenue = closes.reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const totalCalls = setterLogs.reduce((sum, s) => sum + Number(s.callsMade || 0), 0);
  const totalAppts = setterLogs.reduce((sum, s) => sum + Number(s.appointmentsBooked || 0), 0);
  const totalShows = setterLogs.reduce((sum, s) => sum + Number(s.showUps || 0), 0);

  const closesRows = closes
    .map(
      (c) =>
        `<tr><td style="padding:4px 10px;">${repName(c.repId)}</td><td style="padding:4px 10px;">${productName(
          c.productId
        )}</td><td style="padding:4px 10px;">${c.leadSource || '—'}</td><td style="padding:4px 10px;">$${Number(c.amount || 0).toLocaleString()}</td></tr>`
    )
    .join('');

  const setterRows = setterLogs
    .map(
      (s) =>
        `<tr><td style="padding:4px 10px;">${repName(s.setterId)}</td><td style="padding:4px 10px;">${
          s.callsMade || 0
        }</td><td style="padding:4px 10px;">${s.appointmentsBooked || 0}</td><td style="padding:4px 10px;">${
          s.showUps || 0
        }</td></tr>`
    )
    .join('');

  return `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
    <h2 style="margin-bottom:4px;">Man of War — EOD Summary</h2>
    <p style="color:#666; margin-top:0;">${date}</p>
    <div style="display:flex; gap:16px; margin: 16px 0;">
      <div><strong>${closes.length}</strong> closes</div>
      <div><strong>$${totalRevenue.toLocaleString()}</strong> revenue</div>
      <div><strong>${totalCalls}</strong> calls</div>
      <div><strong>${totalAppts}</strong> appts booked</div>
      <div><strong>${totalShows}</strong> shows</div>
    </div>
    <h3>Closes</h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr style="text-align:left; border-bottom:1px solid #ddd;"><th style="padding:4px 10px;">Rep</th><th style="padding:4px 10px;">Program</th><th style="padding:4px 10px;">Lead Source</th><th style="padding:4px 10px;">Amount</th></tr>
      ${closesRows || '<tr><td style="padding:8px 10px; color:#888;" colspan="4">No closes logged today.</td></tr>'}
    </table>
    <h3>Setter Activity</h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr style="text-align:left; border-bottom:1px solid #ddd;"><th style="padding:4px 10px;">Setter</th><th style="padding:4px 10px;">Calls</th><th style="padding:4px 10px;">Appts</th><th style="padding:4px 10px;">Shows</th></tr>
      ${setterRows || '<tr><td style="padding:8px 10px; color:#888;" colspan="4">No setter activity logged today.</td></tr>'}
    </table>
  </div>`;
}

async function sendEodSummary(dateStr) {
  const settings = store.getSettings();
  if (!settings.eod?.recipientEmail) {
    throw new Error('No EOD recipient email configured in Team settings.');
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set on the server.');
  }
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = buildEodSummaryHtml(dateStr);
  const fromAddress = process.env.RESEND_FROM || 'Man of War Dashboard <onboarding@resend.dev>';
  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: settings.eod.recipientEmail,
    subject: `MOW EOD Summary — ${dateStr || todayStr()}`,
    html,
  });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data;
}

module.exports = { buildEodSummaryHtml, sendEodSummary };
