// cron/updateIPs.js
const cron = require('node-cron');
const { getIPsFromDB } = require('../services/ipService');
const { processBatchInWorker } = require('../utils/workerUtils');

function startIPUpdateCron() {
  cron.schedule('0 18 * * *', async () => {
    console.log('[CRON] Running scheduled IP update at 18:00');

    try {
      const ips = await getIPsFromDB();
      const BATCH_SIZE = 50;

      for (let i = 0; i < ips.length; i += BATCH_SIZE) {
        const batch = ips.slice(i, i + BATCH_SIZE);
        await processBatchInWorker(batch);
      }

      console.log('[CRON] IP update completed.');
    } catch (err) {
      console.error('[CRON] IP update failed:', err);
    }
  });
}

module.exports = { startIPUpdateCron };
